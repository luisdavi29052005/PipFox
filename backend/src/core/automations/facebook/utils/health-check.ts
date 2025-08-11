
import { chromium, Browser, BrowserContext, Page } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Obter __dirname para ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Carregar configuração de seletores
const SELECTORS_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'selectors.json'), 'utf-8')
)

interface HealthCheckResult {
  success: boolean
  timestamp: string
  results: {
    feed_detection: boolean
    post_detection: boolean
    strategy_results: { [key: string]: number }
    dom_stats: any
  }
  errors: string[]
}

/**
 * Health Check para validação de seletores do Facebook
 * Executa verificações sem estado para detectar mudanças na estrutura
 */
export async function runHealthCheck(headless: boolean = true): Promise<HealthCheckResult> {
  console.log('[health] 🏥 Iniciando health check dos seletores...')
  
  const result: HealthCheckResult = {
    success: false,
    timestamp: new Date().toISOString(),
    results: {
      feed_detection: false,
      post_detection: false,
      strategy_results: {},
      dom_stats: null
    },
    errors: []
  }

  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null

  try {
    // Configurar browser
    browser = await chromium.launch({ 
      headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    })
    
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })
    
    page = await context.newPage()

    // Navegar para página pública do Facebook (sem login necessário)
    console.log('[health] 🌐 Navegando para página pública do Facebook...')
    await page.goto('https://www.facebook.com/Meta', { 
      waitUntil: 'load', 
      timeout: 30000 
    })

    // Aguardar carregamento inicial
    await page.waitForTimeout(5000)

    // 1. Testar detecção de feed
    console.log('[health] 🔍 Testando detecção de feed...')
    result.results.feed_detection = await testFeedDetection(page)

    // 2. Testar detecção de posts
    console.log('[health] 📝 Testando detecção de posts...')  
    result.results.post_detection = await testPostDetection(page)

    // 3. Testar todas as estratégias
    console.log('[health] 🎯 Testando estratégias de seleção...')
    result.results.strategy_results = await testAllStrategies(page)

    // 4. Coletar estatísticas do DOM
    console.log('[health] 📊 Coletando estatísticas do DOM...')
    result.results.dom_stats = await collectDOMStats(page)

    // Determinar sucesso geral
    const hasWorkingStrategy = Object.values(result.results.strategy_results).some(count => count > 0)
    result.success = result.results.feed_detection && result.results.post_detection && hasWorkingStrategy

    console.log(`[health] ${result.success ? '✅' : '❌'} Health check ${result.success ? 'PASSOU' : 'FALHOU'}`)

  } catch (error) {
    console.error('[health] ❌ Erro durante health check:', error)
    result.errors.push(error.message)
  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }

  return result
}

async function testFeedDetection(page: Page): Promise<boolean> {
  try {
    const feedSelectors = [
      SELECTORS_CONFIG.selectors.feed.primary,
      ...SELECTORS_CONFIG.selectors.feed.fallback
    ]

    for (const selector of feedSelectors) {
      try {
        const count = await page.locator(selector).count()
        if (count > 0) {
          console.log(`[health] ✅ Feed detectado com: ${selector} (${count} elementos)`)
          return true
        }
      } catch {}
    }

    console.log('[health] ❌ Nenhum seletor de feed funcionou')
    return false
  } catch {
    return false
  }
}

async function testPostDetection(page: Page): Promise<boolean> {
  try {
    const articleCount = await page.locator('[role="article"]').count()
    console.log(`[health] 📊 ${articleCount} elementos [role="article"] encontrados`)
    return articleCount > 0
  } catch {
    return false
  }
}

async function testAllStrategies(page: Page): Promise<{ [key: string]: number }> {
  const results: { [key: string]: number } = {}

  for (const [key, strategy] of Object.entries(SELECTORS_CONFIG.strategies)) {
    try {
      const count = await page.locator(strategy.selector).count()
      results[strategy.name] = count
      
      const status = count > 0 ? '✅' : '❌'
      console.log(`[health] ${status} Estratégia "${strategy.name}": ${count} elementos`)
      
      // Se encontrou elementos, testar visibilidade
      if (count > 0) {
        const visibleCount = await page.locator(strategy.selector).locator(':visible').count()
        console.log(`[health]    └─ ${visibleCount} visíveis de ${count} total`)
      }
      
    } catch (error) {
      console.log(`[health] ❌ Erro na estratégia "${strategy.name}": ${error.message}`)
      results[strategy.name] = -1 // -1 indica erro
    }
  }

  return results
}

async function collectDOMStats(page: Page): Promise<any> {
  try {
    return await page.evaluate(() => {
      return {
        // Contadores gerais
        total_divs: document.querySelectorAll('div').length,
        total_articles: document.querySelectorAll('[role="article"]').length,
        total_feeds: document.querySelectorAll('[role="feed"]').length,
        
        // Atributos específicos do Facebook
        data_testids: document.querySelectorAll('[data-testid]').length,
        data_pagelets: document.querySelectorAll('[data-pagelet]').length,
        aria_labels: document.querySelectorAll('[aria-label]').length,
        
        // Informações da página
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scroll: {
          current: window.scrollY,
          max: document.body.scrollHeight
        },
        
        // Verificações específicas
        has_fb_root: !!document.getElementById('facebook'),
        has_mount_point: !!document.querySelector('[data-testid="mount-point"]'),
        
        // Amostra de classes CSS (para detectar mudanças de obfuscação)
        sample_classes: Array.from(document.querySelectorAll('div[class]'))
          .slice(0, 10)
          .map(el => el.className)
          .filter(cn => cn.length < 100) // Filtrar classes muito longas
      }
    })
  } catch (error) {
    console.error('[health] Erro ao coletar stats do DOM:', error)
    return { error: error.message }
  }
}

/**
 * Executa health check com alertas
 */
export async function runHealthCheckWithAlerts(): Promise<void> {
  const result = await runHealthCheck()
  
  // Log detalhado dos resultados
  console.log('\n[health] 📋 RELATÓRIO COMPLETO:')
  console.log('=====================================')
  console.log(`Status: ${result.success ? '✅ PASSOU' : '❌ FALHOU'}`)
  console.log(`Timestamp: ${result.timestamp}`)
  console.log(`Feed Detection: ${result.results.feed_detection ? '✅' : '❌'}`)
  console.log(`Post Detection: ${result.results.post_detection ? '✅' : '❌'}`)
  
  console.log('\nEstratégias:')
  for (const [name, count] of Object.entries(result.results.strategy_results)) {
    const status = count > 0 ? '✅' : (count === 0 ? '⚠️' : '❌')
    console.log(`  ${status} ${name}: ${count} elementos`)
  }
  
  if (result.results.dom_stats) {
    console.log(`\nDOM Stats:`)
    console.log(`  - Articles: ${result.results.dom_stats.total_articles}`)
    console.log(`  - Feeds: ${result.results.dom_stats.total_feeds}`)
    console.log(`  - Test IDs: ${result.results.dom_stats.data_testids}`)
    console.log(`  - URL: ${result.results.dom_stats.url}`)
  }
  
  if (result.errors.length > 0) {
    console.log(`\nErros:`)
    result.errors.forEach(error => console.log(`  ❌ ${error}`))
  }
  
  // Se falhou, sugerir ações
  if (!result.success) {
    console.log('\n🚨 AÇÃO NECESSÁRIA:')
    console.log('Os seletores podem estar quebrados. Considere:')
    console.log('1. Verificar se o Facebook mudou sua estrutura')
    console.log('2. Atualizar os seletores em selectors.json')
    console.log('3. Executar testes manuais no navegador')
    console.log('4. Verificar logs detalhados acima')
  }
  
  console.log('=====================================\n')
}

// Permitir execução direta do script
if (import.meta.url === `file://${process.argv[1]}`) {
  runHealthCheckWithAlerts().catch(error => {
    console.error('❌ Erro fatal no health check:', error)
    process.exit(1)
  })
}
