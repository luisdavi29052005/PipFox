import express from 'express';
import { supabase } from '../../services/supabaseClient';
import { requireAuth } from '../../middleware/requireAuth';
import Stripe from 'stripe';

const router = express.Router();

// --- Configuração do Stripe ---
// Inicializa o Stripe de forma segura, checando a existência da chave.
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️ STRIPE_SECRET_KEY não encontrada no ambiente. Funcionalidades de pagamento estarão desabilitadas.');
}
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// --- Rotas da API ---

/**
 * @route GET /api/plans
 * @description Retorna todos os planos disponíveis.
 */
router.get('/', async (req, res) => {
  try {
    const { data: plans, error } = await supabase
      .from('plans')
      .select('*')
      .order('price');

    if (error) throw error;

    // Se não houver planos, executa o script de setup uma vez.
    if (!plans || plans.length === 0) {
      console.log('Nenhum plano encontrado, executando setup...');
      const { setupPlans } = await import('../../../scripts/setup-plans.js');
      await setupPlans();
      const { data: newPlans } = await supabase.from('plans').select('*').order('price');
      return res.json({ success: true, data: newPlans || [] });
    }

    return res.json({ success: true, data: plans });
  } catch (err: any) {
    console.error('Erro ao buscar planos:', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor ao buscar planos.' });
  }
});

/**
 * @route POST /api/plans/checkout
 * @description Cria uma sessão de checkout do Stripe para um plano pago.
 */
router.post('/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(500).json({ success: false, error: 'Serviço de pagamento não configurado.' });

  try {
    const userId = req.user.id;
    const { planId } = req.body;

    if (!planId) return res.status(400).json({ success: false, error: 'ID do plano é obrigatório.' });

    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) return res.status(404).json({ success: false, error: 'Plano não encontrado.' });

    const stripePriceId = plan.limits?.stripe_price_id;
    if (!stripePriceId) return res.status(400).json({ success: false, error: 'Plano não configurado para pagamento.' });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${baseUrl}/plans?success=true`,
      cancel_url: `${baseUrl}/plans?canceled=true`,
      // Passa os metadados para a assinatura para que o webhook possa usá-los
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_id: planId.toString(),
        },
      },
    });

    return res.json({ success: true, data: { checkout_url: session.url } });
  } catch (err: any) {
    console.error('Erro ao criar sessão de checkout:', err.message);
    return res.status(500).json({ success: false, error: 'Erro ao iniciar o processo de pagamento.' });
  }
});

/**
 * @route GET /api/plans/subscription
 * @description Retorna a assinatura ativa do usuário.
 */
router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignora erro de "nenhum resultado"

    return res.json({ success: true, data: { subscription: subscription || null } });
  } catch (err: any) {
    console.error('Erro ao buscar assinatura:', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor.' });
  }
});

/**
 * @route POST /api/plans/webhook
 * @description Endpoint para receber eventos do Stripe.
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Webhook do Stripe não configurado.' });
  }

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Falha na verificação da assinatura do webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Função auxiliar para ativar a assinatura no banco de dados
  const activateSubscription = async (customerId: string, subscriptionId: string) => {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)

      // Find subscription by customer_id
      const { data: existingSubscription, error: subError } = await supabase
        .from('subscriptions')
        .select('id, user_id, plan_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (subError || !existingSubscription) {
        console.error('Subscription not found for customer:', customerId)
        return
      }

      // Validate the timestamp before creating Date object
      const endTimestamp = subscription.current_period_end
      const startTimestamp = subscription.current_period_start
      
      if (!endTimestamp || isNaN(endTimestamp)) {
        console.error('Invalid subscription end timestamp:', endTimestamp)
        return
      }

      const endDate = new Date(endTimestamp * 1000)
      const startDate = new Date(startTimestamp * 1000)

      // Validate the created Date object
      if (isNaN(endDate.getTime())) {
        console.error('Invalid date created from timestamp:', endTimestamp)
        return
      }

      // Get the plan by stripe_price_id
      const priceId = subscription.items.data[0]?.price?.id
      let planId = existingSubscription.plan_id // Default to current plan
      
      if (priceId) {
        const { data: plan } = await supabase
          .from('plans')
          .select('id')
          .eq('limits->>stripe_price_id', priceId)
          .single()
          
        if (plan) {
          planId = plan.id
        }
      }

      // Update subscription
      const { error } = await supabase
        .from('subscriptions')
        .update({
          plan_id: planId,
          status: 'active',
          stripe_subscription_id: subscriptionId,
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          end_date: null // Clear end_date since it's active
        })
        .eq('id', existingSubscription.id)

      if (error) {
        console.error('Error updating subscription:', error)
      } else {
        console.log(`✅ Subscription activated for user ${existingSubscription.user_id}`)
      }
    } catch (error) {
      console.error('Error in activateSubscription:', error)
    }
  }

  // Trata os eventos relevantes do Stripe
  switch (event.type) {
    case 'customer.subscription.created':
        console.log('🔔 Subscription created:', event.data.object.id)
        try {
          await activateSubscription(event.data.object.customer as string, event.data.object.id)
        } catch (error) {
          console.error('Error handling subscription.created:', error)
          return res.status(500).json({ error: 'Failed to process subscription creation' })
        }
        break

      case 'customer.subscription.updated':
        console.log('🔔 Subscription updated:', event.data.object.id)
        try {
          await activateSubscription(event.data.object.customer as string, event.data.object.id)
        } catch (error) {
          console.error('Error handling subscription.updated:', error)
          return res.status(500).json({ error: 'Failed to process subscription update' })
        }
        break

    case 'checkout.session.completed': {
      console.log('🔔 Checkout session completed:', event.data.object.id)
      const session = event.data.object as Stripe.CheckoutSession
      
      try {
        // Recupera a sessão completa com os metadados da subscription
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['subscription']
        })

        if (fullSession.subscription && typeof fullSession.subscription === 'object') {
          const subscription = fullSession.subscription as Stripe.Subscription
          const customerId = session.customer as string
          const userId = subscription.metadata?.user_id
          const planId = subscription.metadata?.plan_id

          if (userId && customerId && planId) {
            // Check if subscription already exists
            const { data: existingSub } = await supabase
              .from('subscriptions')
              .select('id')
              .eq('user_id', userId)
              .single()

            if (existingSub) {
              // Update existing subscription
              const { error: updateError } = await supabase
                .from('subscriptions')
                .update({ 
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscription.id,
                  plan_id: planId,
                  status: 'active'
                })
                .eq('id', existingSub.id)

              if (updateError) {
                console.error('Error updating subscription:', updateError)
              } else {
                console.log(`✅ Subscription updated for user ${userId}`)
              }
            } else {
              // Create new subscription
              const { error: createError } = await supabase
                .from('subscriptions')
                .insert({
                  user_id: userId,
                  plan_id: planId,
                  stripe_customer_id: customerId,
                  stripe_subscription_id: subscription.id,
                  status: 'active',
                  start_date: new Date().toISOString()
                })

              if (createError) {
                console.error('Error creating subscription:', createError)
              } else {
                console.log(`✅ Subscription created for user ${userId}`)
              }
            }

            // Agora ativa a subscription com todos os detalhes
            await activateSubscription(customerId, subscription.id)
          } else {
            console.error('Missing metadata in checkout session:', { userId, customerId, planId })
          }
        }
      } catch (error) {
        console.error('Error handling checkout.session.completed:', error)
        return res.status(500).json({ error: 'Failed to process checkout completion' })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', end_date: new Date().toISOString() })
        .eq('stripe_subscription_id', subscription.id);
      console.log(`🔌 Assinatura ${subscription.id} cancelada.`);
      break;
    }
    default:
      console.log(`🔔 Evento Stripe não tratado: ${event.type}`);
  }

  res.json({ received: true });
});

export default router;