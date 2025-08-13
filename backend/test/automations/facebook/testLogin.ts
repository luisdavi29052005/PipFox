import { chromium, Page } from 'playwright'
import { openContextForAccount } from '../../../src/core/automations/facebook/session/context'
import { getTestIds } from './helpers/getTestIds'

export interface TestLoginOptions {
  userId: string
  accountId: string
  groupUrl?: string
  headless?: boolean
}

/**
 * Testa se a sessão salva ainda está válida
 */
export async function testLogin(options: TestLoginOptions): Promise<boolean> {
  const {
    userId,
    accountId,
    groupUrl = 'https://www.facebook.com/groups/940840924057399',
    headless = false
  } = options

  console.log('[testLogin] Iniciando teste de login...')
  console.log(`[testLogin] Usuario: ${userId}`)
  console.log(`[testLogin] Conta: ${accountId}`)
  console.log(`[testLogin] Grupo: ${groupUrl}`)

  try {
    // Abrir contexto com sessão salva
    const context = await openContextForAccount(userId, accountId, headless)
    const page = await context.newPage()

    // Navegar para o grupo
    console.log(`[testLogin] Navegando para o grupo...`);

    // Validate URL before navigation
    if (!groupUrl.startsWith('http://') && !groupUrl.startsWith('https://')) {
      throw new Error(`URL inválida: ${groupUrl}. A URL deve começar com http:// ou https://`);
    }

    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' })

    // Verificar se está logado
    const isLoggedIn = await checkLoginStatus(page)

    if (isLoggedIn) {
      console.log('[testLogin] ✅ Login bem-sucedido!')

      // Verificar se consegue acessar o feed do grupo
      try {
        await page.waitForSelector('[role="feed"]', { timeout: 10000 })
        console.log('[testLogin] ✅ Feed do grupo carregado!')
      } catch {
        console.log('[testLogin] ⚠️ Feed não carregou, mas está logado')
      }
    } else {
      console.log('[testLogin] ❌ Não está logado ou sessão expirou')
    }

    await context.close()
    return isLoggedIn

  } catch (error) {
    console.error('[testLogin] Erro:', error)
    throw error
  }
}

/**
 * Verifica se o usuário está logado
 */
async function checkLoginStatus(page: Page): Promise<boolean> {
  try {
    // Aguardar o feed aparecer (indica login ativo)
    await page.locator('div[role="feed"]').first().waitFor({ 
      state: 'visible', 
      timeout: 8000 
    })
    return true
  } catch {
    // Verificar se há indicadores de tela de login
    const loginHints = page.locator(
      'form[action*="login"], input[name="email"], input[id="email"]'
    )

    const hasLoginForm = await loginHints.first().isVisible({ timeout: 5000 }).catch(() => false)
    return !hasLoginForm
  }
}

/**
 * Mostra ajuda do teste de login
 */
function showLoginHelp() {
  console.log('🔑 TESTE DE LOGIN - AJUDA')
  console.log('==========================')
  console.log('')
  console.log('FUNÇÃO: Testa se a sessão salva do Facebook ainda está válida')
  console.log('')
  console.log('COMANDOS:')
  console.log('npx tsx testLogin.ts [userId] [accountId] [groupUrl] [options]')
  console.log('npx tsx testLogin.ts auto auto [groupUrl] [options]')
  console.log('npx tsx testLogin.ts --help')
  console.log('')
  console.log('OPÇÕES:')
  console.log('--headless          Executa sem interface gráfica')
  console.log('--help              Mostra esta ajuda')
  console.log('')
  console.log('O QUE FAZ:')
  console.log('• Abre contexto com sessão salva do Supabase')
  console.log('• Navega para URL do grupo especificado')
  console.log('• Verifica se está logado (procura por feed)')
  console.log('• Testa acesso ao feed do grupo')
  console.log('• Retorna status de sucesso/falha')
  console.log('')
  console.log('INDICADORES DE SUCESSO:')
  console.log('✅ Feed do grupo carregado = Login OK')
  console.log('⚠️  Logado mas feed não carrega = Parcial')
  console.log('❌ Tela de login detectada = Falha')
  console.log('')
}

// CLI Interface
if (require.main === module) {
  async function main() {
    // Check for help
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      showLoginHelp()
      return
    }
    let userId = process.argv[2]
    let accountId = process.argv[3]

    // Se não foram fornecidos IDs, buscar automaticamente
    if (!userId || !accountId || userId === 'auto' || accountId === 'auto') {
      console.log('🔄 Buscando IDs automaticamente...')
      const testIds = await getTestIds()

      if (!testIds) {
        console.error('❌ Não foi possível obter IDs de teste')
        process.exit(1)
      }

      userId = testIds.userId
      accountId = testIds.accountId
      console.log(`✅ Usando conta: ${testIds.accountName} (${testIds.status})`)
    }

    const groupUrl = process.argv[4] || 'https://www.facebook.com/groups/940840924057399'
    const headless = process.argv.includes('--headless')

    try {
      const success = await testLogin({
        userId,
        accountId,
        groupUrl,
        headless
      })

      console.log(`\nResultado final: ${success ? '✅ SUCESSO' : '❌ FALHA'}`)
      process.exit(success ? 0 : 1)
    } catch (err) {
      console.error('💥 Erro fatal:', err)
      process.exit(1)
    }
  }

  main().catch(err => {
    console.error('💥 Erro no main:', err)
    process.exit(1)
  })
}