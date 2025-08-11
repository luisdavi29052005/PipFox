
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Users, TrendingUp, MessageCircle, Target, Eye, Activity, AlertTriangle } from 'lucide-react'
import { getDashboardSummary, getDashboardTrends, getSubscription } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import StatsCards from '../components/dashboard/StatsCards'
import TrendChart from '../components/dashboard/TrendChart'
import WorkflowList from '../components/dashboard/WorkflowList'
import AccountsHealth from '../components/dashboard/AccountsHealth'
import ErrorsPanel from '../components/dashboard/ErrorsPanel'
import Alert from '../components/ui/Alert'

interface DashboardSummary {
  totalWorkflows: number
  activeWorkflows: number
  monitoredGroups: number
  posts24h: number
  comments24h: number
  successRate: number
  backlog: number
}

interface TrendData {
  date: string
  leads: number
  comments: number
}

interface Subscription {
  plan: {
    name: string
    limits: {
      credits_per_month: number
    }
  }
}

interface Credits {
  total_credits: number
  used_credits: number
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [trends, setTrends] = useState<TrendData[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [credits, setCredits] = useState<Credits | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      const [summaryRes, trendsRes, subscriptionRes] = await Promise.all([
        getDashboardSummary(),
        getDashboardTrends(),
        getSubscription()
      ])

      setSummary(summaryRes.data)
      setTrends(trendsRes.data)
      setSubscription(subscriptionRes.data.subscription)
      setCredits(subscriptionRes.data.credits)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setError('Erro ao carregar dados do dashboard')
    } finally {
      setLoading(false)
    }
  }

  const getRemainingCredits = () => {
    if (!credits) return 0
    return credits.total_credits - credits.used_credits
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
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Dashboard
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    Acompanhe o desempenho dos seus workflows
                  </p>
                </div>
                <div className="text-right">
                  {subscription && (
                    <div className="mb-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                        Plano {subscription.plan.name}
                      </span>
                    </div>
                  )}
                  {subscription && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Limite: {formatLimit(subscription.plan.limits.workflows)} workflows, {formatLimit(subscription.plan.limits.posts_per_day)} posts/dia
                    </p>
                  )}
                </div>
              </div>

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

              {/* Stats Cards */}
              <motion.div 
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Workflows Ativos</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {summary?.activeWorkflows || 0}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        de {summary?.totalWorkflows || 0} total
                      </p>
                    </div>
                    <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-xl">
                      <Zap className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Grupos Monitorados</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {summary?.monitoredGroups || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-xl">
                      <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Posts 24h</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {summary?.posts24h || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-green-100 dark:bg-green-900 rounded-xl">
                      <Eye className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Taxa de Sucesso</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {summary?.successRate || 0}%
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {summary?.comments24h || 0} comentários
                      </p>
                    </div>
                    <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Charts and Lists */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <TrendChart data={trends} />
                <AccountsHealth />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <WorkflowList />
                <ErrorsPanel />
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </Layout>
  )
}
