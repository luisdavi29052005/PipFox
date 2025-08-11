
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { User, AlertTriangle, CheckCircle, Clock, Shield } from 'lucide-react'
import { getAccountsStats } from '../../lib/api'

interface AccountStats {
  total: number
  connected: number
  disconnected: number
  error: number
}

export default function AccountsHealth() {
  const [stats, setStats] = useState<AccountStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAccountsStats()
  }, [])

  const loadAccountsStats = async () => {
    try {
      setLoading(true)
      const response = await getAccountsStats()
      setStats(response.data)
    } catch (error) {
      console.error('Error loading accounts stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const getHealthColor = () => {
    if (!stats || stats.total === 0) return 'text-gray-500'
    
    const healthPercent = (stats.connected / stats.total) * 100
    
    if (healthPercent >= 80) return 'text-green-500'
    if (healthPercent >= 60) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getHealthLabel = () => {
    if (!stats || stats.total === 0) return 'Sem dados'
    
    const healthPercent = (stats.connected / stats.total) * 100
    
    if (healthPercent >= 80) return 'Excelente'
    if (healthPercent >= 60) return 'Boa'
    if (healthPercent >= 40) return 'Regular'
    return 'Precisa de atenção'
  }

  if (loading) {
    return (
      <motion.div
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Saúde das Contas
        </h3>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </motion.div>
    )
  }

  if (!stats || stats.total === 0) {
    return (
      <motion.div
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          Saúde das Contas
        </h3>
        
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">Nenhuma conta configurada</p>
          <motion.button
            onClick={() => window.location.href = '/accounts'}
            className="mt-4 text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-medium"
            whileHover={{ scale: 1.05 }}
          >
            Configurar contas
          </motion.button>
        </div>
      </motion.div>
    )
  }

  const healthPercent = stats.total > 0 ? (stats.connected / stats.total) * 100 : 0

  const accountItems = [
    {
      label: 'Conectadas',
      count: stats.connected,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/20'
    },
    {
      label: 'Desconectadas',
      count: stats.disconnected,
      icon: Clock,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20'
    },
    {
      label: 'Com problemas',
      count: stats.error,
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/20'
    }
  ]

  return (
    <motion.div
      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Saúde das Contas
        </h3>
        <motion.button
          onClick={() => window.location.href = '/accounts'}
          className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-medium"
          whileHover={{ scale: 1.05 }}
        >
          Ver todas
        </motion.button>
      </div>

      {/* Overall Health */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Saúde geral
          </span>
          <span className={`text-sm font-semibold ${getHealthColor()}`}>
            {getHealthLabel()}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            className={`h-2 rounded-full transition-all duration-500 ${
              healthPercent >= 80 ? 'bg-green-500' :
              healthPercent >= 60 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${healthPercent}%` }}
            transition={{ duration: 1, delay: 0.2 }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
          <span>0%</span>
          <span>{Math.round(healthPercent)}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Account Details */}
      <div className="space-y-3">
        {accountItems.map((item, index) => {
          const IconComponent = item.icon
          
          return (
            <motion.div
              key={item.label}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-md ${item.bgColor}`}>
                  <IconComponent className={`w-4 h-4 ${item.color}`} />
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {item.label}
                </span>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {item.count}
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Total: {stats.total} contas
          </span>
          {stats.error > 0 && (
            <motion.button
              onClick={() => window.location.href = '/accounts'}
              className="text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-1 rounded-md transition-colors"
              whileHover={{ scale: 1.05 }}
            >
              Resolver problemas
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
