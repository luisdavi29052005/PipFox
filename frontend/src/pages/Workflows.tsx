
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Plus, Play, Square, Trash2, Users, Edit, Activity, Clock, CheckCircle } from 'lucide-react'
import { getWorkflows, startWorkflow, stopWorkflow, deleteWorkflow } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import { Link } from 'react-router-dom'

interface WorkflowNode {
  id: string
  group_name: string
  group_url: string
  is_active: boolean
}

interface Workflow {
  id: string
  name: string
  status: string
  created_at: string
  workflow_nodes: WorkflowNode[]
}

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [processingWorkflow, setProcessingWorkflow] = useState<string | null>(null)

  useEffect(() => {
    loadWorkflows()
  }, [])

  const loadWorkflows = async () => {
    try {
      setLoading(true)
      const response = await getWorkflows()
      setWorkflows(response || [])
    } catch (error) {
      console.error('Error loading workflows:', error)
      setError('Erro ao carregar workflows')
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async (workflowId: string) => {
    try {
      setProcessingWorkflow(workflowId)
      setError(null)
      
      await startWorkflow(workflowId)
      setSuccess('Workflow iniciado com sucesso!')
      await loadWorkflows()
    } catch (error) {
      console.error('Error starting workflow:', error)
      setError(error instanceof Error ? error.message : 'Erro ao iniciar workflow')
    } finally {
      setProcessingWorkflow(null)
    }
  }

  const handleStop = async (workflowId: string) => {
    try {
      setProcessingWorkflow(workflowId)
      setError(null)
      
      await stopWorkflow(workflowId)
      setSuccess('Workflow parado com sucesso!')
      await loadWorkflows()
    } catch (error) {
      console.error('Error stopping workflow:', error)
      setError(error instanceof Error ? error.message : 'Erro ao parar workflow')
    } finally {
      setProcessingWorkflow(null)
    }
  }

  const handleDelete = async (workflowId: string) => {
    if (!confirm('Tem certeza que deseja deletar este workflow?')) return

    try {
      setProcessingWorkflow(workflowId)
      setError(null)
      
      await deleteWorkflow(workflowId)
      setSuccess('Workflow deletado com sucesso!')
      await loadWorkflows()
    } catch (error) {
      console.error('Error deleting workflow:', error)
      setError(error instanceof Error ? error.message : 'Erro ao deletar workflow')
    } finally {
      setProcessingWorkflow(null)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="w-5 h-5 text-green-500" />
      case 'stopped':
        return <Square className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'running':
        return 'Executando'
      case 'stopped':
        return 'Parado'
      default:
        return 'Criado'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'stopped':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
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
                    Workflows
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    Gerencie seus workflows de automação
                  </p>
                </div>
                <Link to="/workflows/create">
                  <Button className="bg-orange-600 hover:bg-orange-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Workflow
                  </Button>
                </Link>
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

              {/* Stats Cards */}
              <motion.div 
                className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Workflows</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">{workflows.length}</p>
                    </div>
                    <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-xl">
                      <Zap className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Executando</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {workflows.filter(w => w.status === 'running').length}
                      </p>
                    </div>
                    <div className="p-3 bg-green-100 dark:bg-green-900 rounded-xl">
                      <Activity className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Grupos</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {workflows.reduce((total, w) => total + w.workflow_nodes.length, 0)}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-xl">
                      <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Workflows List */}
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                {workflows.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center shadow-lg">
                    <Zap className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Nenhum workflow encontrado
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Comece criando seu primeiro workflow para automatizar suas tarefas
                    </p>
                    <Link to="/workflows/create">
                      <Button className="bg-orange-600 hover:bg-orange-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Criar Primeiro Workflow
                      </Button>
                    </Link>
                  </div>
                ) : (
                  workflows.map((workflow, index) => (
                    <motion.div
                      key={workflow.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                              {workflow.name}
                            </h3>
                            <div className="flex items-center">
                              {getStatusIcon(workflow.status)}
                              <span className={`ml-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(workflow.status)}`}>
                                {getStatusLabel(workflow.status)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                            <span className="flex items-center">
                              <Users className="w-4 h-4 mr-1" />
                              {workflow.workflow_nodes.length} grupos
                            </span>
                            <span>
                              Criado em {new Date(workflow.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          {workflow.workflow_nodes.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Grupos:</p>
                              <div className="flex flex-wrap gap-2">
                                {workflow.workflow_nodes.slice(0, 3).map((node) => (
                                  <span
                                    key={node.id}
                                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                                  >
                                    {node.group_name}
                                  </span>
                                ))}
                                {workflow.workflow_nodes.length > 3 && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                                    +{workflow.workflow_nodes.length - 3} mais
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          {workflow.status === 'running' ? (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleStop(workflow.id)}
                              disabled={processingWorkflow === workflow.id}
                            >
                              <Square className="w-4 h-4 mr-1" />
                              Parar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleStart(workflow.id)}
                              disabled={processingWorkflow === workflow.id}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Iniciar
                            </Button>
                          )}
                          <Link to={`/workflows/${workflow.id}/edit`}>
                            <Button size="sm" variant="secondary">
                              <Edit className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(workflow.id)}
                            disabled={processingWorkflow === workflow.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            </motion.div>
          </div>
        </main>
      </div>
    </Layout>
  )
}
