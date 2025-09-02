
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Wifi, Users, Shield, Zap, Clock } from 'lucide-react'
import { getLeads } from '../../lib/api'

interface ErrorItem {
  type: string
  message: string
  count: number
  lastOccurred: string
}

export default function ErrorsPanel() {
  const [errors, setErrors] = useState<ErrorItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadErrors()
  }, [])

  const loadErrors = async () => {
    try {
      setLoading(true)
      const response = await getLeads()
      
      // Process leads to extract error information
      const failedLeads = (response || []).filter((lead: any) => lead.status === 'failed')
      
      // Group errors by type (simplified for now)
      const errorGroups = failedLeads.reduce((acc: any, lead: any) => {
        const errorType = 'comment_failed' // We could extract this from error logs if available
        
        if (!acc[errorType]) {
          acc[errorType] = {
            type: errorType,
            message: 'Falha ao comentar no post',
            count: 0,
            lastOccurred: lead.created_at
          }
        }
        
        acc[errorType].count++
        if (new Date(lead.created_at) > new Date(acc[errorType].lastOccurred)) {
          acc[errorType].lastOccurred = lead.created_at
        }
        
        return acc
      }, {})
      
      setErrors(Object.values(errorGroups))
    } catch (error) {
      console.error('Error loading errors:', error)
    } finally {
      setLoading(false)
    }
  }

  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'connection_failed':
        return Wifi
      case 'account_blocked':
        return Users
      case 'rate_limit':
        return Clock
      case 'comment_failed':
        return Zap
      default:
        return AlertTriangle
    }
  }

  const getErrorColor = (type: string) => {
    switch (type) {
      case 'connection_failed':
        return 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
      case 'account_blocked':
        return 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
      case 'rate_limit':
        return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'
      case 'comment_failed':
        return 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
      default:
        return 'bg-gray-100 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400'
    }
  }

  const getErrorLabel = (type: string) => {
    switch (type) {
      case 'connection_failed':
        return 'Falha de conexão'
      case 'account_blocked':
        return 'Conta bloqueada'
      case 'rate_limit':
        return 'Limite de taxa'
      case 'comment_failed':
        return 'Falha ao comentar'
      default:
        return 'Erro desconhecido'
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    
    if (diffHours > 24) {
      return `${Math.floor(diffHours / 24)}d atrás`
    } else if (diffHours > 0) {
      return `${diffHours}h atrás`
    } else {
      return `${diffMinutes}min atrás`
    }
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
          Erros Recentes
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

  return (
    <motion.div
      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Erros Recentes
        </h3>
        <motion.button
          onClick={() => window.location.href = '/leads'}
          className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-medium"
          whileHover={{ scale: 1.05 }}
        >
          Ver detalhes
        </motion.button>
      </div>

      {errors.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">Nenhum erro nas últimas 24h</p>
        </div>
      ) : (
        <div className="space-y-3">
          {errors.map((error, index) => {
            const IconComponent = getErrorIcon(error.type)
            const colorClasses = getErrorColor(error.type)
            
            return (
              <motion.div
                key={error.type}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-md ${colorClasses}`}>
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getErrorLabel(error.type)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {error.message}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {error.count}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(error.lastOccurred)}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Summary */}
      {errors.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: {errors.reduce((sum, error) => sum + error.count, 0)} erros
            </span>
            <motion.button
              onClick={() => window.location.href = '/leads?status=failed'}
              className="text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-1 rounded-md transition-colors"
              whileHover={{ scale: 1.05 }}
            >
              Investigar
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
