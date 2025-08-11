
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Filter, Eye, MessageCircle, Clock, CheckCircle, XCircle, Target } from 'lucide-react'
import { getLeads } from '../lib/api'
import Layout from '../components/layout/Layout'
import Sidebar from '../components/dashboard/Sidebar'
import Alert from '../components/ui/Alert'

interface Lead {
  id: string
  post_url: string
  post_author: string | null
  post_text: string | null
  generated_comment: string | null
  status: 'extracted' | 'commented' | 'failed'
  created_at: string
  commented_at: string | null
  attempts: number
  node_id: string
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadLeads()
  }, [])

  const loadLeads = async () => {
    try {
      setLoading(true)
      const response = await getLeads()
      setLeads(response || [])
    } catch (error) {
      console.error('Error loading leads:', error)
      setError('Erro ao carregar leads')
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'commented':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'commented':
        return 'Comentado'
      case 'failed':
        return 'Falhou'
      default:
        return 'Extraído'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'commented':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    }
  }

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchTerm || 
      lead.post_author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.post_text?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR')
  }

  const truncateText = (text: string | null, maxLength: number = 100) => {
    if (!text) return 'N/A'
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
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
                    Leads
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    Gerencie os posts capturados e comentários realizados
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

              {/* Stats Cards */}
              <motion.div 
                className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Leads</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">{leads.length}</p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-xl">
                      <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Comentados</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {leads.filter(lead => lead.status === 'commented').length}
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
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pendentes</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {leads.filter(lead => lead.status === 'extracted').length}
                      </p>
                    </div>
                    <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-xl">
                      <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Falharam</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {leads.filter(lead => lead.status === 'failed').length}
                      </p>
                    </div>
                    <div className="p-3 bg-red-100 dark:bg-red-900 rounded-xl">
                      <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Filters */}
              <motion.div 
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-lg mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Buscar por autor ou texto do post..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="sm:w-48">
                    <select
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">Todos os status</option>
                      <option value="extracted">Extraídos</option>
                      <option value="commented">Comentados</option>
                      <option value="failed">Falharam</option>
                    </select>
                  </div>
                </div>
              </motion.div>

              {/* Leads Table */}
              <motion.div 
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-lg overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                {filteredLeads.length === 0 ? (
                  <div className="text-center py-12">
                    <Target className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Nenhum lead encontrado
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {searchTerm || statusFilter !== 'all' 
                        ? 'Tente ajustar os filtros de busca'
                        : 'Os leads aparecerão aqui quando os workflows estiverem ativos'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Autor
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Texto do Post
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Comentário Gerado
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Data
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredLeads.map((lead, index) => (
                          <motion.tr
                            key={lead.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {getStatusIcon(lead.status)}
                                <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                                  {getStatusLabel(lead.status)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {lead.post_author || 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white max-w-xs">
                              <div className="truncate" title={lead.post_text || ''}>
                                {truncateText(lead.post_text)}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white max-w-xs">
                              <div className="truncate" title={lead.generated_comment || ''}>
                                {truncateText(lead.generated_comment)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {formatDate(lead.created_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <a
                                href={lead.post_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 flex items-center"
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Ver Post
                              </a>
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
