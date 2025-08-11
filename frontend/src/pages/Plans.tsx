import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Zap, Crown, Users, CreditCard } from 'lucide-react'
import { getPlans, checkout, getSubscription } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import { toast, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  interval: string
  limits: {
    workflows: number
    facebook_accounts: number
    posts_per_day: number
  }
  stripe_price_id: string
  stripe_product_id: string
}

interface Subscription {
  plan: Plan
}

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    
    // Verificar se retornou do checkout com sucesso
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      const sessionId = urlParams.get('session_id');
      processSuccessfulPayment(sessionId);
    }
  }, [])

  const processSuccessfulPayment = async (sessionId: string | null) => {
    try {
      // Aqui você pode buscar os detalhes da sessão se necessário
      // Por enquanto, vamos apenas mostrar sucesso e recarregar
      toast.success('Pagamento processado com sucesso!');
      
      // Remove os parâmetros da URL
      window.history.replaceState({}, document.title, '/plans');
      
      // Recarrega os dados
      setTimeout(() => {
        loadData();
      }, 2000);
    } catch (error) {
      console.error('Error processing successful payment:', error);
      toast.error('Erro ao processar pagamento');
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const [plansRes, subscriptionRes] = await Promise.all([
        getPlans(),
        getSubscription()
      ])

      setPlans(plansRes.data)
      setSubscription(subscriptionRes.data.subscription)
    } catch (error) {
      console.error('Error loading data:', error)
      setError('Erro ao carregar planos')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckout = async (planId: string) => {
    try {
      setProcessing(planId)
      const result = await checkout(planId, 'card')

      // Se retornou checkout_url, redireciona para Stripe
      if (result?.data?.checkout_url) {
        window.location.href = result.data.checkout_url
        return
      }

      // Se não tem checkout_url, é plano grátis
      if (result?.success) {
        toast.success('Plano ativado com sucesso!')
        // Refresh user data
        window.location.reload()
      } else {
        toast.error(result?.error || 'Erro ao processar pagamento')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Erro ao processar pagamento')
    } finally {
      setProcessing(null)
    }
  }

  const isCurrentPlan = (planId: string) => {
    return subscription?.plan?.id === planId
  }

  const getPlanIcon = (planName: string) => {
    switch (planName.toLowerCase()) {
      case 'free':
        return <Zap className="w-8 h-8 text-blue-600" />
      case 'pro':
        return <Crown className="w-8 h-8 text-purple-600" />
      case 'enterprise':
        return <Users className="w-8 h-8 text-orange-600" />
      default:
        return <Zap className="w-8 h-8 text-gray-600" />
    }
  }

  const formatLimit = (value: number) => {
    return value === -1 ? 'Ilimitado' : value.toLocaleString()
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar />
          <main className="flex-1 p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          </main>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Planos e Assinaturas
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Escolha o plano ideal para suas necessidades
              </p>

              {error && (
                <motion.div 
                  className="mb-6"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Alert variant="error" onClose={() => setError(null)}>
                    {error}
                  </Alert>
                </motion.div>
              )}

              {success && (
                <motion.div 
                  className="mb-6"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Alert variant="success" onClose={() => setSuccess(null)}>
                    {success}
                  </Alert>
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {plans.map((plan, index) => (
                  <motion.div
                    key={plan.id}
                    className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-8 shadow-lg relative ${
                      isCurrentPlan(plan.id) 
                        ? 'border-orange-500 ring-2 ring-orange-200 dark:ring-orange-800' 
                        : 'border-gray-200 dark:border-gray-700'
                    } ${plan.name === 'Pro' ? 'transform scale-105' : ''}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                  >
                    {plan.name === 'Pro' && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <span className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                          Mais Popular
                        </span>
                      </div>
                    )}

                    {isCurrentPlan(plan.id) && (
                      <div className="absolute -top-4 right-4">
                        <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                          Plano Atual
                        </span>
                      </div>
                    )}

                    <div className="text-center mb-6">
                      {getPlanIcon(plan.name)}
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-4 mb-2">
                        {plan.name}
                      </h3>
                      <div className="flex items-baseline justify-center">
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">
                          R$ {(plan.price * 5.5).toFixed(0)}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400 ml-1">
                          /{plan.interval === 'month' ? 'mês' : 'ano'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4 mb-8">
                      <div className="flex items-center">
                        <Check className="w-5 h-5 text-green-500 mr-3" />
                        <span className="text-gray-600 dark:text-gray-400">
                          {formatLimit(plan.limits.workflows)} workflows
                        </span>
                      </div>
                      <div className="flex items-center">
                        <Check className="w-5 h-5 text-green-500 mr-3" />
                        <span className="text-gray-600 dark:text-gray-400">
                          {formatLimit(plan.limits.facebook_accounts)} contas Facebook
                        </span>
                      </div>
                      <div className="flex items-center">
                        <Check className="w-5 h-5 text-green-500 mr-3" />
                        <span className="text-gray-600 dark:text-gray-400">
                          {formatLimit(plan.limits.posts_per_day)} posts/dia
                        </span>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleCheckout(plan.id)}
                      disabled={processing === plan.id || isCurrentPlan(plan.id)}
                      className={`w-full ${
                        plan.name === 'Pro' 
                          ? 'bg-orange-600 hover:bg-orange-700' 
                          : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      {processing === plan.id ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processando...
                        </div>
                      ) : isCurrentPlan(plan.id) ? (
                        'Plano Atual'
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          {plan.price === 0 ? 'Selecionar Gratuito' : 'Assinar Agora'}
                        </>
                      )}
                    </Button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </main>
      </div>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </Layout>
  )
}