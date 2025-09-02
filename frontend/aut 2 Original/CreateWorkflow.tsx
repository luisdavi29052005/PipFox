
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import { createWorkflow, getAccounts } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Alert from '../components/ui/Alert'

interface Account {
  id: string
  name: string
  status: string
}

interface GroupNode {
  url: string
  name: string
  prompt?: string
  keywords?: string[]
  is_active: boolean
}

export default function CreateWorkflow() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    account_id: '',
    webhook_url: ''
  })
  
  const [groups, setGroups] = useState<GroupNode[]>([
    { url: '', name: '', prompt: '', keywords: [], is_active: true }
  ])

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    try {
      setLoading(true)
      const response = await getAccounts()
      setAccounts(response || [])
    } catch (error) {
      console.error('Error loading accounts:', error)
      setError('Erro ao carregar contas')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleGroupChange = (index: number, field: string, value: string | boolean) => {
    const updatedGroups = [...groups]
    if (field === 'keywords') {
      updatedGroups[index][field] = (value as string).split(',').map(k => k.trim()).filter(k => k)
    } else {
      updatedGroups[index][field] = value
    }
    setGroups(updatedGroups)
  }

  const addGroup = () => {
    setGroups([...groups, { url: '', name: '', prompt: '', keywords: [], is_active: true }])
  }

  const removeGroup = (index: number) => {
    if (groups.length > 1) {
      setGroups(groups.filter((_, i) => i !== index))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.account_id) {
      setError('Nome e conta são obrigatórios')
      return
    }

    const validGroups = groups.filter(g => g.url && g.name)
    if (validGroups.length === 0) {
      setError('Pelo menos um grupo válido é obrigatório')
      return
    }

    try {
      setSaving(true)
      setError(null)
      
      const workflowData = {
        ...formData,
        groups: validGroups
      }
      
      await createWorkflow(workflowData)
      setSuccess('Workflow criado com sucesso!')
      
      setTimeout(() => {
        navigate('/workflows')
      }, 1500)
    } catch (error) {
      console.error('Error creating workflow:', error)
      setError(error instanceof Error ? error.message : 'Erro ao criar workflow')
    } finally {
      setSaving(false)
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
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center mb-8">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/workflows')}
                  className="mr-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Criar Novo Workflow
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    Configure um novo workflow de automação
                  </p>
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

              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Informações Básicas */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Informações Básicas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Nome do Workflow *
                      </label>
                      <Input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Ex: Automação Grupos de Vendas"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Conta do Facebook *
                      </label>
                      <select
                        value={formData.account_id}
                        onChange={(e) => handleInputChange('account_id', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        required
                      >
                        <option value="">Selecione uma conta</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} ({account.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Webhook URL (Opcional)
                    </label>
                    <Input
                      type="url"
                      value={formData.webhook_url}
                      onChange={(e) => handleInputChange('webhook_url', e.target.value)}
                      placeholder="https://seu-webhook.com/endpoint"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      URL para receber notificações quando leads forem processados
                    </p>
                  </div>
                </div>

                {/* Grupos */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Grupos do Facebook
                    </h3>
                    <Button
                      type="button"
                      onClick={addGroup}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Grupo
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {groups.map((group, index) => (
                      <motion.div
                        key={index}
                        className="border border-gray-200 dark:border-gray-600 rounded-lg p-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            Grupo {index + 1}
                          </h4>
                          {groups.length > 1 && (
                            <Button
                              type="button"
                              onClick={() => removeGroup(index)}
                              size="sm"
                              variant="danger"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              URL do Grupo *
                            </label>
                            <Input
                              type="url"
                              value={group.url}
                              onChange={(e) => handleGroupChange(index, 'url', e.target.value)}
                              placeholder="https://facebook.com/groups/exemplo"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Nome do Grupo *
                            </label>
                            <Input
                              type="text"
                              value={group.name}
                              onChange={(e) => handleGroupChange(index, 'name', e.target.value)}
                              placeholder="Nome identificador do grupo"
                            />
                          </div>
                        </div>

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Prompt para Comentários
                          </label>
                          <textarea
                            value={group.prompt || ''}
                            onChange={(e) => handleGroupChange(index, 'prompt', e.target.value)}
                            placeholder="Descreva como o bot deve responder aos posts deste grupo..."
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            rows={3}
                          />
                        </div>

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Palavras-chave (separadas por vírgula)
                          </label>
                          <Input
                            type="text"
                            value={group.keywords?.join(', ') || ''}
                            onChange={(e) => handleGroupChange(index, 'keywords', e.target.value)}
                            placeholder="vendas, marketing, negócios"
                          />
                        </div>

                        <div className="mt-4 flex items-center">
                          <input
                            type="checkbox"
                            id={`active-${index}`}
                            checked={group.is_active}
                            onChange={(e) => handleGroupChange(index, 'is_active', e.target.checked)}
                            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                          />
                          <label htmlFor={`active-${index}`} className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                            Grupo ativo
                          </label>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex justify-end space-x-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/workflows')}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Criando...' : 'Criar Workflow'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        </main>
      </div>
    </Layout>
  )
}
