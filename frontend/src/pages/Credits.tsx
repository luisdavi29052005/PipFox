
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Coins, Plus, TrendingUp, Calendar, CreditCard } from 'lucide-react'
import { getCredits, addCredits, getSubscription } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

interface Credits {
  total_credits: number
  used_credits: number
  reset_date: string | null
}

interface Subscription {
  plan: {
    name: string
    limits: {
      credits_per_month: number
    }
  }
}

export default function Credits() {
  const [credits, setCredits] = useState<Credits | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingCredits, setAddingCredits] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedAmount, setSelectedAmount] = useState(1000)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [creditsRes, subscriptionRes] = await Promise.all([
        getCredits(),
        getSubscription()
      ])
      
      setCredits(creditsRes.data)
      setSubscription(subscriptionRes.data.subscription)
    } catch (error) {
      console.error('Error loading credits:', error)
      setError('Erro ao carregar créditos')
    } finally {
      setLoading(false)
    }
  }

  const handleAddCredits = async () => {
    try {
      setAddingCredits(true)
      setError(null)
      
      await addCredits(selectedAmount)
      setSuccess(`${selectedAmount} créditos adicionados com sucesso!`)
      await loadData()
    } catch (error) {
      console.error('Error adding credits:', error)
      setError(error instanceof Error ? error.message : 'Erro ao adicionar créditos')
    } finally {
      setAddingCredits(false)
    }
  }

  const getUsagePercentage = () => {
    if (!credits || credits.total_credits === 0) return 0
    return Math.round((credits.used_credits / credits.total_credits) * 100)
  }

  const getRemainingCredits = () => {
    if (!credits) return 0
    return credits.total_credits - credits.used_credits
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('pt-BR')
  }

  const creditPackages = [
    { amount: 1000, price: 9.90, bonus: 0 },
    { amount: 5000, price: 39.90, bonus: 500 },
    { amount: 10000, price: 69.90, bonus: 1500 },
    { amount: 25000, price: 149.90, bonus: 5000 }
  ]

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
                Gerenciar Créditos
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Acompanhe e recarregue seus créditos
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

              {/* Current Credits Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <motion.div 
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Créditos Disponíveis</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {getRemainingCredits().toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-green-100 dark:bg-green-900 rounded-xl">
                      <Coins className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${100 - getUsagePercentage()}%` }}
                    ></div>
                  </div>
                </motion.div>

                <motion.div 
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Usado</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {credits?.used_credits.toLocaleString() || 0}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {getUsagePercentage()}% utilizado
                      </p>
                    </div>
                    <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Próxima Renovação</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        {formatDate(credits?.reset_date)}
                      </p>
                      {subscription && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          +{subscription.plan.limits.credits_per_month.toLocaleString()} créditos
                        </p>
                      )}
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-xl">
                      <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Credit Packages */}
              <motion.div
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8 shadow-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Comprar Créditos Extras
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  {creditPackages.map((pkg, index) => (
                    <div
                      key={pkg.amount}
                      className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                        selectedAmount === pkg.amount + pkg.bonus
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                      onClick={() => setSelectedAmount(pkg.amount + pkg.bonus)}
                    >
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {(pkg.amount + pkg.bonus).toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          créditos
                        </p>
                        {pkg.bonus > 0 && (
                          <p className="text-xs text-green-600 dark:text-green-400 mb-2">
                            +{pkg.bonus} bônus
                          </p>
                        )}
                        <p className="text-lg font-semibold text-orange-600">
                          R$ {pkg.price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-center">
                  <Button
                    onClick={handleAddCredits}
                    disabled={addingCredits}
                    className="bg-orange-600 hover:bg-orange-700 px-8 py-3"
                  >
                    {addingCredits ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processando...
                      </div>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5 mr-2" />
                        Comprar {selectedAmount.toLocaleString()} Créditos
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </main>
      </div>
    </Layout>
  )
}
