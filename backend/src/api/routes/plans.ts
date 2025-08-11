import express from 'express'
import { supabase } from '../../services/supabaseClient'
import { requireAuth } from '../../middleware/requireAuth'
import Stripe from 'stripe'

const router = express.Router()

// Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY não encontrada no ambiente. Pagamentos desabilitados.')
}
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

// GET /api/plans
router.get('/', async (req, res) => {
  try {
    console.log('Fetching plans from database...')

    const { data: plans, error } = await supabase
      .from('plans')
      .select('*')
      .order('price')

    if (error) {
      console.error('Database error:', error)
      throw error
    }

    console.log('Plans found:', plans?.length || 0)

    if (!plans || plans.length === 0) {
      console.log('No plans found, running setup...')
      try {
        const { setupPlans } = await import('../../../scripts/setup-plans.js')
        await setupPlans()

        const { data: newPlans, error: reloadErr } = await supabase
          .from('plans')
          .select('*')
          .order('price')
        if (reloadErr) throw reloadErr

        return res.json({ success: true, data: newPlans || [] })
      } catch (setupError) {
        console.error('Error during setup:', setupError)
        return res.status(500).json({ success: false, error: 'Erro ao configurar planos' })
      }
    }

    return res.json({ success: true, data: plans || [] })
  } catch (err) {
    console.error('Error fetching plans:', err)
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
})

// POST /api/plans/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const { planId } = req.body

    if (!planId) return res.status(400).json({ success: false, error: 'Plan ID é obrigatório' })

    // Buscar plano
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (planError || !plan) return res.status(404).json({ success: false, error: 'Plano não encontrado' })

    // Plano gratuito → cria/ativa assinatura sem Stripe
    if (Number(plan.price) === 0) {
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled', end_date: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active')

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          status: 'active',
          start_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (subError) throw subError

      return res.json({ success: true, data: { subscription, plan } })
    }

    // Planos pagos → criar sessão de Checkout
    if (!stripe) return res.status(500).json({ success: false, error: 'Serviço de pagamento não configurado' })

    const stripePriceId = plan.limits?.stripe_price_id
    if (!stripePriceId) return res.status(400).json({ success: false, error: 'Plano não configurado para pagamento' })

    const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_URL
    if (!baseUrl) return res.status(500).json({ success: false, error: 'FRONTEND_URL não configurada' })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${baseUrl}/plans?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/plans?canceled=true`,
      client_reference_id: userId,
      metadata: { user_id: String(userId), plan_id: String(planId) }
    })

    return res.json({ success: true, data: { checkout_url: session.url, session_id: session.id } })
  } catch (err) {
    console.error('Error creating checkout session:', err)
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
})

// POST /api/plans/process-payment  (temporário, caso queira ativar sem webhook)
router.post('/process-payment', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id
    const { planId, sessionId } = req.body

    if (!planId) return res.status(400).json({ success: false, error: 'Plan ID é obrigatório' })

    // Cancelar assinatura ativa anterior
    await supabase
      .from('subscriptions')
      .update({ status: 'canceled', end_date: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')

    // Criar nova assinatura
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_id: planId,
        status: 'active',
        start_date: new Date().toISOString(),
        stripe_subscription_id: sessionId || null,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (subError) throw subError

    return res.json({ success: true, data: { subscription } })
  } catch (err) {
    console.error('Error processing payment:', err)
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
})

// GET /api/plans/subscription
router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (error && error.code !== 'PGRST116') throw error

    return res.json({ success: true, data: { subscription: subscription || null } })
  } catch (err) {
    console.error('Error fetching subscription:', err)
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' })
  }
})

// POST /api/plans/subscription/cancel
router.post('/subscription/cancel', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id

    const { data: sub, error: fetchError } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (fetchError || !sub) return res.status(404).json({ error: 'No active subscription found' })

    if (sub.stripe_subscription_id && stripe) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
      } catch (stripeErr) {
        console.error('Error canceling Stripe subscription:', stripeErr)
        return res.status(500).json({ error: 'Failed to cancel subscription with Stripe' })
      }
    }

    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString(), end_date: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error) {
      console.error('Error updating subscription status:', error)
      return res.status(500).json({ error: 'Failed to update subscription status' })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('Cancel subscription error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/plans/webhook  (importante: este endpoint precisa do corpo RAW, sem express.json antes)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe não configurado para webhooks')
    return res.status(500).json({ error: 'Serviço de pagamento não configurado' })
  }

  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return res.status(400).send(`Webhook Error: ${err.message || String(err)}`)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session?.metadata?.user_id
        const planId = session?.metadata?.plan_id

        if (!userId || !planId) {
          console.error('Missing metadata in checkout session:', session?.id)
          break
        }

        // Cancelar assinatura ativa anterior, se existir
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('stripe_subscription_id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single()

        if (existing?.stripe_subscription_id && stripe) {
          try { await stripe.subscriptions.cancel(existing.stripe_subscription_id) } catch (e) { console.error('Error canceling previous subscription:', e) }
        }

        const { error: upsertErr } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan_id: planId,
            status: 'active',
            stripe_subscription_id: session.subscription || null,
            stripe_customer_id: session.customer || null,
            start_date: new Date().toISOString(),
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' })

        if (upsertErr) {
          console.error('Error updating subscription:', upsertErr)
          return res.status(500).json({ error: 'Database error' })
        }

        console.log(`[webhook] Subscription activated for user ${userId}, plan ${planId}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'canceled', end_date: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscription.id)
        if (error) console.error('Error updating subscription status after deletion:', error)
        break
      }

      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    return res.json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return res.status(500).json({ error: 'Webhook internal error' })
  }
})

export default router
