
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Save, Plus, Trash2, Settings, ArrowLeft, Users } from 'lucide-react'
import { getWorkflow, getWorkflowNodes, createWorkflowNode, updateWorkflowNode, deleteWorkflowNode, getAccounts } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

interface Account {
  id: string
  name: string
  status: string
}

interface WorkflowNode {
  id: string
  workflow_id: string
  group_url: string
  group_name: string
  prompt: string
  keywords: string[]
  is_active: boolean
}

interface Workflow {
  id: string
  name: string
  account_id: string
  webhook_url: string
  status: string
}

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [newNode, setNewNode] = useState({
    group_url: '',
    group_name: '',
    prompt: '',
    keywords: '',
    is_active: true
  })

  useEffect(() => {
    if (id) {
      loadWorkflowData()
    }
  }, [id])

  const loadWorkflowData = async () => {
    if (!id) return
    
    try {
      setLoading(true)
      const [workflowRes, nodesRes, accountsRes] = await Promise.all([
        getWorkflow(id),
        getWorkflowNodes(id),
        getAccounts()
      ])
      
      setWorkflow(workflowRes)
      setNodes(nodesRes || [])
      setAccounts(accountsRes || [])
    } catch (error) {
      console.error('Error loading workflow data:', error)
      setError('Erro ao carregar dados do workflow')
    } finally {
      setLoading(false)
    }
  }

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workflow || !newNode.group_url || !newNode.group_name) return

    try {
      setSaving(true)
      setError(null)
      
      const keywordsArray = newNode.keywords.split(',').map(k => k.trim()).filter(k => k)
      
      await createWorkflowNode({
        workflow_id: workflow.id,
        group_url: newNode.group_url,
        group_name: newNode.group_name,
        prompt: newNode.prompt,
        keywords: keywordsArray,
        is_active: newNode.is_active
      })
      
      setSuccess('Grupo adicionado com sucesso!')
      setNewNode({
        group_url: '',
        group_name: '',
        prompt: '',
        keywords: '',
        is_active: true
      })
      setShowAddNode(false)
      await loadWorkflowData()
    } catch (error) {
      console.error('Error adding node:', error)
      setError(error instanceof Error ? error.message : 'Erro ao adicionar grupo')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateNode = async (nodeId: string, updates: Partial<WorkflowNode>) => {
    try {
      setSaving(true)
      setError(null)
      
      await updateWorkflowNode(nodeId, updates)
      setSuccess('Grupo atualizado com sucesso!')
      await loadWorkflowData()
    } catch (error) {
      console.error('Error updating node:', error)
      setError(error instanceof Error ? error.message : 'Erro ao atualizar grupo')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNode = async (nodeId: string) => {
    if (!confirm('Tem certeza que deseja remover este grupo?')) return

    try {
      setSaving(true)
      setError(null)
      
      await deleteWorkflowNode(nodeId)
      setSuccess('Grupo removido com sucesso!')
      await loadWorkflowData()
    } catch (error) {
      console.error('Error deleting node:', error)
      setError(error instanceof Error ? error.message : 'Erro ao remover grupo')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleNode = async (nodeId: string, isActive: boolean) => {
    await handleUpdateNode(nodeId, { is_active: !isActive })
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

  if (!workflow) {
    return (
      <Layout>
        <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar />
          <main className="flex-1 p-8">
            <div className="max-w-7xl mx-auto">
              <Alert variant="error">
                Workflow não encontrado
              </Alert>
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
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <Button
                    variant="secondary"
                    onClick={() => navigate('/workflows')}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                  </Button>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                      Editar Workflow
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                      {workflow.name}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowAddNode(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Grupo
                </Button>
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

              {/* Add Node Form */}
              {showAddNode && (
                <motion.div 
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Adicionar Novo Grupo
                  </h3>
                  <form onSubmit={handleAddNode} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          URL do Grupo
                        </label>
                        <input
                          type="url"
                          placeholder="https://facebook.com/groups/..."
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          value={newNode.group_url}
                          onChange={(e) => setNewNode({ ...newNode, group_url: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Nome do Grupo
                        </label>
                        <input
                          type="text"
                          placeholder="Nome identificativo do grupo"
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          value={newNode.group_name}
                          onChange={(e) => setNewNode({ ...newNode, group_name: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Prompt para Comentários
                      </label>
                      <textarea
                        placeholder="Como o AI deve responder aos posts..."
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        rows={3}
                        value={newNode.prompt}
                        onChange={(e) => setNewNode({ ...newNode, prompt: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Palavras-chave (separadas por vírgula)
                      </label>
                      <input
                        type="text"
                        placeholder="marketing, vendas, negócio"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        value={newNode.keywords}
                        onChange={(e) => setNewNode({ ...newNode, keywords: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_active"
                        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                        checked={newNode.is_active}
                        onChange={(e) => setNewNode({ ...newNode, is_active: e.target.checked })}
                      />
                      <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Grupo ativo
                      </label>
                    </div>
                    <div className="flex gap-4">
                      <Button
                        type="submit"
                        disabled={saving}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        {saving ? 'Salvando...' : 'Adicionar Grupo'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setShowAddNode(false)
                          setNewNode({
                            group_url: '',
                            group_name: '',
                            prompt: '',
                            keywords: '',
                            is_active: true
                          })
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Nodes List */}
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                {nodes.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center shadow-lg">
                    <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Nenhum grupo configurado
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Adicione grupos do Facebook para monitorar e comentar automaticamente
                    </p>
                    <Button
                      onClick={() => setShowAddNode(true)}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Primeiro Grupo
                    </Button>
                  </div>
                ) : (
                  nodes.map((node, index) => (
                    <motion.div
                      key={node.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {node.group_name}
                            </h3>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              node.is_active 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                            }`}>
                              {node.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            <strong>URL:</strong> {node.group_url}
                          </p>
                          {node.prompt && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              <strong>Prompt:</strong> {node.prompt}
                            </p>
                          )}
                          {node.keywords.length > 0 && (
                            <div className="mb-2">
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                <strong>Palavras-chave:</strong>
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {node.keywords.map((keyword, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <Button
                            size="sm"
                            variant={node.is_active ? "secondary" : "default"}
                            onClick={() => handleToggleNode(node.id, node.is_active)}
                            disabled={saving}
                          >
                            {node.is_active ? 'Desativar' : 'Ativar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDeleteNode(node.id)}
                            disabled={saving}
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
