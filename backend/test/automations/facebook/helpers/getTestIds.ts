
import { supabase } from '../../../../src/services/supabaseClient'

interface TestIds {
  userId: string
  accountId: string
  accountName?: string
  status?: string
}

/**
 * Busca automaticamente um userId e accountId válidos para testes
 */
export async function getTestIds(): Promise<TestIds | null> {
  try {
    console.log('🔍 Buscando contas disponíveis para teste...')
    
    // Buscar a primeira conta ativa
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, user_id, name, status')
      .eq('status', 'ready')
      .limit(1)
      
    if (error) {
      console.error('❌ Erro ao buscar contas:', error)
      return null
    }
    
    if (!accounts || accounts.length === 0) {
      // Se não tem conta "ready", buscar qualquer conta
      console.log('⚠️ Nenhuma conta "ready" encontrada, buscando qualquer conta...')
      
      const { data: anyAccounts, error: anyError } = await supabase
        .from('accounts')
        .select('id, user_id, name, status')
        .limit(1)
        
      if (anyError || !anyAccounts || anyAccounts.length === 0) {
        console.error('❌ Nenhuma conta encontrada no banco')
        return null
      }
      
      const account = anyAccounts[0]
      console.log(`📝 Usando conta: ${account.name} (${account.status})`)
      
      return {
        userId: account.user_id,
        accountId: account.id,
        accountName: account.name,
        status: account.status
      }
    }
    
    const account = accounts[0]
    console.log(`✅ Conta encontrada: ${account.name} (${account.status})`)
    
    return {
      userId: account.user_id,
      accountId: account.id,
      accountName: account.name,
      status: account.status
    }
    
  } catch (error) {
    console.error('💥 Erro ao buscar IDs:', error)
    return null
  }
}

/**
 * Lista todas as contas disponíveis
 */
export async function listAccounts(): Promise<void> {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, user_id, name, status, created_at')
      .order('created_at', { ascending: false })
      
    if (error) {
      console.error('❌ Erro ao listar contas:', error)
      return
    }
    
    if (!accounts || accounts.length === 0) {
      console.log('📝 Nenhuma conta encontrada')
      return
    }
    
    console.log('\n📋 CONTAS DISPONÍVEIS:')
    console.log('=====================')
    
    accounts.forEach((account, index) => {
      const status = account.status === 'ready' ? '✅' : 
                    account.status === 'not_ready' ? '⚠️' : '❌'
      
      console.log(`${index + 1}. ${account.name}`)
      console.log(`   User ID: ${account.user_id}`)
      console.log(`   Account ID: ${account.id}`)
      console.log(`   Status: ${status} ${account.status}`)
      console.log(`   Criada: ${new Date(account.created_at).toLocaleString('pt-BR')}`)
      console.log('')
    })
    
  } catch (error) {
    console.error('💥 Erro ao listar contas:', error)
  }
}
