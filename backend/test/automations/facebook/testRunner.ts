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
 * Mostra ajuda completa do sistema de testes
 */
function showHelp() {
  console.log(`
🧪 SISTEMA DE TESTES DO FACEBOOK - PIPEFOX
==========================================

📋 COMANDOS PRINCIPAIS:
  npm run test:all           - 🚀 Executar TODOS os testes (recomendado)
  npm run test:selectors     - 🎯 Testar extração de posts (PRINCIPAL)
  npm run test:login         - 🔑 Testar apenas login/sessão
  npm run test:health        - 🏥 Health check básico
  npm run test:quick         - ⚡ Teste rápido (3 posts + login)
  npm run test:headless      - 👻 Modo headless (sem interface)

📋 COMANDOS AUXILIARES:
  npm run test:selectors-only - Seletores standalone (sem relatório)
  npm run accounts           - 📋 Listar contas disponíveis
  npm run help               - ❓ Mostrar esta ajuda
  npm run docs               - 📖 Documentação completa

🎛️ PARÂMETROS AVANÇADOS:
  --headless                 - Executar sem interface gráfica
  --max-posts=N              - Processar no máximo N posts (padrão: 5)
  --only-login               - Apenas teste de login
  --only-selectors           - Apenas teste de seletores  
  --only-health              - Apenas health check
  --list-accounts            - Listar contas disponíveis

🚀 EXEMPLOS DE USO:
  # Teste completo com IDs automáticos
  npx tsx testRunner.ts auto auto

  # Apenas seletores, modo headless, 10 posts
  npx tsx testRunner.ts auto auto --only-selectors --headless --max-posts=10

  # Teste rápido para desenvolvimento
  npm run test:quick

🔧 VARIÁVEIS DE AMBIENTE:
  WEBHOOK_URL               - URL para receber dados extraídos dos posts

🎯 FOCO PRINCIPAL:
  O teste 'selectors' é o mais importante! Ele:
  - Encontra posts no feed do Facebook
  - Clica nos timestamps (1h, 2min, etc.) para abrir posts
  - Extrai dados completos: autor, texto, imagens
  - Envia para webhook se configurado

📖 DOCUMENTAÇÃO COMPLETA:
  cat backend/test/automations/facebook/HELP.md
    `)
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
    maxPosts = 25,
    tests = ['login', 'health', 'selectors']
  } = options

  console.log('🧪 INICIANDO BATERIA DE TESTES');
  console.log('================================');
  console.log(`Usuario: ${userId}`);
  console.log(`Conta: ${accountId}`);
  console.log(`Grupo: ${groupUrl}`);
  console.log(`Max Posts: ${maxPosts}`);
  console.log(`Testes: ${tests.join(', ')}`);
  console.log('');

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

      // Se login não foi testado ou falhou, avisa mas continua (seletores tem seu próprio login)
      if (tests.includes('login') && !results.login) {
        console.log('⚠️ Login falhou, mas tentando seletores mesmo assim...')
      }

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
    const args = process.argv.slice(2);

    // Verificar comandos de ajuda
    if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
      showHelp()
      return
    }

    // Verificar se é para listar contas
    if (args.includes('--list-accounts')) {
      await listAccounts()
      return
    }

    // Parse options first
    const options: { [key: string]: string } = {};
    const nonOptionArgs: string[] = [];

    for (const arg of args) {
      if (arg.startsWith('--')) {
        const [key, value] = arg.split('=');
        options[key.substring(2)] = value || 'true';
      } else {
        nonOptionArgs.push(arg);
      }
    }

    // Suporte para execução simplificada com auto IDs
    let userId: string;
    let accountId: string;
    let groupUrl: string;

    // Caso 1: Auto discovery completo - apenas opções
    if (nonOptionArgs.length === 0) {
      console.log('🔄 Buscando IDs e URL automaticamente...');
      const testIds = await getTestIds();

      if (!testIds) {
        console.error('❌ Não foi possível obter IDs de teste');
        console.log('💡 Dica: Use --list-accounts para ver contas disponíveis');
        process.exit(1);
      }

      userId = testIds.userId;
      accountId = testIds.accountId;
      groupUrl = 'https://www.facebook.com/groups/940840924057399'; // URL padrão
      console.log(`✅ Usando conta: ${testIds.accountName} (${testIds.status})`);
    }
    // Caso 2: Argumentos tradicionais (userId accountId groupUrl)
    else if (nonOptionArgs.length >= 3) {
      userId = nonOptionArgs[0];
      accountId = nonOptionArgs[1];
      groupUrl = nonOptionArgs[2];

      // If no user/account IDs provided, fetch automatically
      if (userId === 'auto' || accountId === 'auto') {
        console.log('🔄 Buscando IDs automaticamente...');
        const testIds = await getTestIds();

        if (!testIds) {
          console.error('❌ Não foi possível obter IDs de teste');
          console.log('💡 Dica: Use --list-accounts para ver contas disponíveis');
          process.exit(1);
        }

        userId = testIds.userId;
        accountId = testIds.accountId;
        console.log(`✅ Usando conta: ${testIds.accountName} (${testIds.status})`);
      }
    }
    // Caso 3: Help/Erro
    else {
      console.log('❌ Argumentos insuficientes ou inválidos');
      console.log('');
      console.log('📖 AJUDA RÁPIDA:');
      console.log('  npx tsx testRunner.ts --help                        # Ajuda completa');
      console.log('  npx tsx testRunner.ts --list-accounts               # Ver contas');
      console.log('  npx tsx testRunner.ts --max-posts=3 --only-login    # Teste rápido');
      console.log('  npx tsx testRunner.ts                               # Auto discovery');
      console.log('');
      console.log('💡 Use --help para ver todos os comandos e funcionalidades disponíveis');
      process.exit(1);
    }

    // Parse max-posts option
    const maxPosts = options['max-posts'] ? parseInt(options['max-posts']) : 100;
    const headless = options['headless'] === 'true';

    let tests: ('login' | 'selectors' | 'health')[] = ['login', 'health', 'selectors'];
    if (options['only-login'] === 'true') tests = ['login'];
    if (options['only-health'] === 'true') tests = ['health'];
    if (options['only-selectors'] === 'true') tests = ['selectors'];

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