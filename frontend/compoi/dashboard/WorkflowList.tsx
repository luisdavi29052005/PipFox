
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, TrendingUp, Users, Activity, Play, Square } from 'lucide-react'
import { getWorkflows, startWorkflow, stopWorkflow } from '../../lib/api'

interface WorkflowNode {
  id: string
  group_name: string
  is_active: boolean
}

interface Workflow {
  id: string
  name: string
  status: string
  workflow_nodes: WorkflowNode[]
}

export default function WorkflowList() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [processingWorkflow, setProcessingWorkflow] = useState<string | null>(null)

  useEffect(() => {
    loadWorkflows()
  }, [])

  const loadWorkflows = async () => {
    try {
      setLoading(true)
      const response = await getWorkflows()
      setWorkflows((response || []).slice(0, 5)) // Show only 5 most recent
    } catch (error) {
      console.error('Error loading workflows:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleWorkflow = async (workflowId: string, currentStatus: string) => {
    try {
      setProcessingWorkflow(workflowId)
      
      if (currentStatus === 'running') {
        await stopWorkflow(workflowId)
      } else {
        await startWorkflow(workflowId)
      }
      
      await loadWorkflows()
    } catch (error) {
      console.error('Error toggling workflow:', error)
    } finally {
      setProcessingWorkflow(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-green-600 dark:text-green-400'
      case 'stopped':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="w-4 h-4 text-green-500" />
      case 'stopped':
        return <Square className="w-4 h-4 text-red-500" />
      default:
        return <Zap className="w-4 h-4 text-gray-500" />
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
          Workflows Recentes
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

  if (workflows.length === 0) {
    return (
      <motion.div
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg p-12 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <TrendingUp className="w-8 h-8 text-white" />
        </motion.div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Nenhum workflow encontrado
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Comece criando seu primeiro workflow para automatizar suas tarefas no Facebook
        </p>
        <motion.button
          onClick={() => window.location.href = '/workflows/create'}
          className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="mr-2">✨</span>
          Criar Primeiro Workflow
        </motion.button>
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
          Workflows Recentes
        </h3>
        <motion.button
          onClick={() => window.location.href = '/workflows'}
          className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 text-sm font-medium"
          whileHover={{ scale: 1.05 }}
        >
          Ver todos
        </motion.button>
      </div>

      <div className="space-y-4">
        {workflows.map((workflow, index) => (
          <motion.div
            key={workflow.id}
            className="flex items-center justify-between p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                {getStatusIcon(workflow.status)}
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {workflow.name}
                </h4>
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                  <Users className="w-3 h-3" />
                  <span>{workflow.workflow_nodes.length} grupos</span>
                  <span className={`font-medium ${getStatusColor(workflow.status)}`}>
                    • {workflow.status === 'running' ? 'Executando' : workflow.status === 'stopped' ? 'Parado' : 'Criado'}
                  </span>
                </div>
              </div>
            </div>
            
            <motion.button
              onClick={() => handleToggleWorkflow(workflow.id, workflow.status)}
              disabled={processingWorkflow === workflow.id}
              className={`p-2 rounded-lg transition-colors ${
                workflow.status === 'running'
                  ? 'bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400'
                  : 'bg-green-100 hover:bg-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400'
              } ${processingWorkflow === workflow.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {processingWorkflow === workflow.id ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : workflow.status === 'running' ? (
                <Square className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </motion.button>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
