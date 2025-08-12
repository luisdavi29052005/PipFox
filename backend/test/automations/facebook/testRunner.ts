
import { testLogin } from './testLogin'
import { testSelectors, SelectorTestOptions } from './selectorTester'
import { runHealthCheck } from '../../../src/core/automations/facebook/utils/health-check'
import { getTestIds, listAccounts } from './helpers/getTestIds'

interface TestRunnerOptions {
  userId: string
  accountId: string
  groupUrl?: string
  webhookUrl?: string
  headless?: boolean
  maxPosts?: number
  tests?: ('login' | 'selectors' | 'health')[]
}

/**
 * Executor principal de testes integrado com o sistema oficial
 */
export async function runTests(options: TestRunnerOptions) {
  const {
    userId,
    accountId,
    groupUrl = 'https://www.facebook.com/groups/940840924057399',
    webhookUrl,
    headless = false,
    maxPosts = 5,
    tests = ['login', 'health', 'selectors']
  } = options

  console.log('🧪 INICIANDO BATERIA DE TESTES')
  console.log('================================')
  console.log(`Usuario: ${userId}`)
  console.log(`Conta: ${accountId}`)
  console.log(`Grupo: ${groupUrl}`)
  console.log(`Testes: ${tests.join(', ')}`)
  console.log('')

  const results: { [key: string]: boolean } = {}

  try {
    // 1. Teste de Login
    if (tests.includes('login')) {
      console.log('🔑 TESTE DE LOGIN')
      console.log('------------------')
      try {
        const loginSuccess = await testLogin({
          userId,
          accountId,
          groupUrl,
          headless
        })
        results.login = loginSuccess
        console.log(`Resultado: ${loginSuccess ? '✅ SUCESSO' : '❌ FALHA'}`)
      } catch (error) {
        console.error('❌ Erro no teste de login:', error)
        results.login = false
      }
      console.log('')
    }

    // 2. Health Check
    if (tests.includes('health')) {
      console.log('🏥 HEALTH CHECK DOS SELETORES')
      console.log('------------------------------')
      try {
        const healthResult = await runHealthCheck(headless)
        results.health = healthResult.success
        console.log(`Feed Detection: ${healthResult.results.feed_detection ? '✅' : '❌'}`)
        console.log(`Post Detection: ${healthResult.results.post_detection ? '✅' : '❌'}`)
        console.log(`Resultado: ${healthResult.success ? '✅ SUCESSO' : '❌ FALHA'}`)
      } catch (error) {
        console.error('❌ Erro no health check:', error)
        results.health = false
      }
      console.log('')
    }

    // 3. Teste de Seletores
    if (tests.includes('selectors')) {
      console.log('🎯 TESTE DE SELETORES')
      console.log('----------------------')
      if (!results.login) {
        console.log('❌ Pulando teste de seletores - login falhou')
        results.selectors = false
      } else {
        try {
          await testSelectors({
            userId,
            accountId,
            groupUrl,
            webhookUrl,
            headless,
            maxPosts
          })
          results.selectors = true
          console.log('✅ Teste de seletores concluído')
        } catch (error) {
          console.error('❌ Erro no teste de seletores:', error)
          results.selectors = false
        }
      }
      console.log('')
    }

    // Relatório Final
    console.log('📊 RELATÓRIO FINAL')
    console.log('==================')
    const totalTests = tests.length
    const successCount = Object.values(results).filter(Boolean).length
    
    for (const test of tests) {
      const status = results[test] ? '✅' : '❌'
      console.log(`${status} ${test.toUpperCase()}`)
    }
    
    console.log('')
    console.log(`Testes executados: ${totalTests}`)
    console.log(`Sucessos: ${successCount}`)
    console.log(`Falhas: ${totalTests - successCount}`)
    console.log(`Taxa de sucesso: ${Math.round((successCount / totalTests) * 100)}%`)
    
    const overallSuccess = successCount === totalTests
    console.log(`Status geral: ${overallSuccess ? '✅ TODOS PASSARAM' : '❌ ALGUMAS FALHAS'}`)
    
    return {
      success: overallSuccess,
      results,
      totalTests,
      successCount
    }

  } catch (error) {
    console.error('💥 Erro fatal nos testes:', error)
    throw error
  }
}

// CLI Interface
if (require.main === module) {
  async function main() {
    // Verificar se é para listar contas
    if (process.argv.includes('--list-accounts')) {
      await listAccounts()
      return
    }

    // Obter IDs - usar dos argumentos ou buscar automaticamente
    let userId = process.argv[2]
    let accountId = process.argv[3]
    
    // Se não foram fornecidos IDs, buscar automaticamente
    if (!userId || !accountId || userId === 'auto' || accountId === 'auto') {
      console.log('🔄 Buscando IDs automaticamente...')
      const testIds = await getTestIds()
      
      if (!testIds) {
        console.error('❌ Não foi possível obter IDs de teste')
        console.log('💡 Dica: Use --list-accounts para ver contas disponíveis')
        process.exit(1)
      }
      
      userId = testIds.userId
      accountId = testIds.accountId
      console.log(`✅ Usando conta: ${testIds.accountName} (${testIds.status})`)
    }
    
    const groupUrl = process.argv[4] || 'https://www.facebook.com/groups/940840924057399'
    const headless = process.argv.includes('--headless')
    const maxPosts = parseInt(process.argv.find(arg => arg.startsWith('--max-posts='))?.split('=')[1] || '5')
    
    let tests: ('login' | 'selectors' | 'health')[] = ['login', 'health', 'selectors']
    if (process.argv.includes('--only-login')) tests = ['login']
    if (process.argv.includes('--only-health')) tests = ['health']
    if (process.argv.includes('--only-selectors')) tests = ['selectors']

    try {
      const result = await runTests({
        userId,
        accountId,
        groupUrl,
        headless,
        maxPosts,
        tests
      })
      process.exit(result.success ? 0 : 1)
    } catch (err) {
      console.error('💥 Erro fatal:', err)
      process.exit(1)
    }
  }

  main().catch(err => {
    console.error('💥 Erro fatal no main:', err)
    process.exit(1)
  })
}
