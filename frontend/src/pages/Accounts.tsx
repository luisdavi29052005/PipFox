
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { User, Plus, LogIn, LogOut, Trash2, Activity, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { getAccounts, createAccount, loginAccount, logoutAccount, deleteAccount } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

interface Account {
  id: string
  name: string
  status: string
  created_at: string
  fb_user_id?: string
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [processingAccount, setProcessingAccount] = useState<string | null>(null)

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

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAccountName.trim()) return

    try {
      setCreatingAccount(true)
      setError(null)
      
      await createAccount({ name: newAccountName.trim() })
      setSuccess('Conta criada com sucesso!')
      setNewAccountName('')
      setShowCreateForm(false)
      await loadAccounts()
    } catch (error) {
      console.error('Error creating account:', error)
      setError(error instanceof Error ? error.message : 'Erro ao criar conta')
    } finally {
      setCreatingAccount(false)
    }
  }

  const handleLogin = async (accountId: string) => {
    try {
      setProcessingAccount(accountId)
      setError(null)
      
      await loginAccount(accountId)
      setSuccess('Processo de login iniciado. Uma nova janela será aberta.')
      await loadAccounts()
    } catch (error) {
      console.error('Error logging in account:', error)
      setError(error instanceof Error ? error.message : 'Erro ao fazer login')
    } finally {
      setProcessingAccount(null)
    }
  }

  const handleLogout = async (accountId: string) => {
    try {
      setProcessingAccount(accountId)
      setError(null)
      
      await logoutAccount(accountId)
      setSuccess('Logout realizado com sucesso!')
      await loadAccounts()
    } catch (error) {
      console.error('Error logging out account:', error)
      setError(error instanceof Error ? error.message : 'Erro ao fazer logout')
    } finally {
      setProcessingAccount(null)
    }
  }

  const handleDelete = async (accountId: string) => {
    if (!confirm('Tem certeza que deseja deletar esta conta?')) return

    try {
      setProcessingAccount(accountId)
      setError(null)
      
      await deleteAccount(accountId)
      setSuccess('Conta deletada com sucesso!')
      await loadAccounts()
    } catch (error) {
      console.error('Error deleting account:', error)
      setError(error instanceof Error ? error.message : 'Erro ao deletar conta')
    } finally {
      setProcessingAccount(null)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'logging_in':
        return <Clock className="w-5 h-5 text-blue-500" />
      case 'error':
      case 'conflict':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      default:
        return <Activity className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready':
        return 'Conectada'
      case 'logging_in':
        return 'Fazendo login...'
      case 'error':
        return 'Erro'
      case 'conflict':
        return 'Conflito'
      default:
        return 'Desconectada'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'logging_in':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'error':
      case 'conflict':
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
                    Contas do Facebook
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    Gerencie suas contas do Facebook para automatização
                  </p>
                </div>
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Conta
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
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Contas</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">{accounts.length}</p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-xl">
                      <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Conectadas</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {accounts.filter(acc => acc.status === 'ready').length}
                      </p>
                    </div>
                    <div className="p-3 bg-green-100 dark:bg-green-900 rounded-xl">
                      <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Com Problemas</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {accounts.filter(acc => ['error', 'conflict'].includes(acc.status)).length}
                      </p>
                    </div>
                    <div className="p-3 bg-red-100 dark:bg-red-900 rounded-xl">
                      <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Create Account Form */}
              {showCreateForm && (
                <motion.div 
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Criar Nova Conta
                  </h3>
                  <form onSubmit={handleCreateAccount} className="flex gap-4">
                    <input
                      type="text"
                      placeholder="Nome da conta"
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      required
                    />
                    <Button
                      type="submit"
                      disabled={creatingAccount}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {creatingAccount ? 'Criando...' : 'Criar'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowCreateForm(false)
                        setNewAccountName('')
                      }}
                    >
                      Cancelar
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* Accounts List */}
              <motion.div 
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                {accounts.length === 0 ? (
                  <div className="text-center py-12">
                    <User className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Nenhuma conta cadastrada
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Comece criando sua primeira conta do Facebook
                    </p>
                    <Button
                      onClick={() => setShowCreateForm(true)}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Criar Primeira Conta
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Nome
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            FB User ID
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Criada em
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {accounts.map((account, index) => (
                          <motion.tr
                            key={account.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                              {account.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {getStatusIcon(account.status)}
                                <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(account.status)}`}>
                                  {getStatusLabel(account.status)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {account.fb_user_id || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {new Date(account.created_at).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                {account.status === 'ready' ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleLogout(account.id)}
                                    disabled={processingAccount === account.id}
                                  >
                                    <LogOut className="w-4 h-4 mr-1" />
                                    Logout
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => handleLogin(account.id)}
                                    disabled={processingAccount === account.id}
                                    className="bg-blue-600 hover:bg-blue-700"
                                  >
                                    <LogIn className="w-4 h-4 mr-1" />
                                    Login
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleDelete(account.id)}
                                  disabled={processingAccount === account.id}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </motion.div>
          </div>
        </main>
      </div>
    </Layout>
  )
}
