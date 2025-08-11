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
  const activateSubscription = async (subscription: Stripe.Subscription) => {
    const userId = subscription.metadata.user_id;
    const planId = subscription.metadata.plan_id;

    if (!userId || !planId) {
      console.error(`ERRO CRÍTICO: Faltando metadados na assinatura ${subscription.id}`);
      return;
    }

    const subscriptionData = {
      user_id: userId,
      plan_id: planId,
      status: 'active',
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer.toString(),
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      end_date: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('subscriptions')
      .upsert(subscriptionData, { onConflict: 'user_id' });

    if (error) {
      console.error(`Erro ao ativar assinatura para o usuário ${userId}:`, error);
    } else {
      console.log(`✅ Assinatura ativada com sucesso para o usuário ${userId}.`);
    }
  };

  // Trata os eventos relevantes do Stripe
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.status === 'active') {
        await activateSubscription(subscription);
      }
      break;
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
