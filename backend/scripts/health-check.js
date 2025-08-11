
const { runHealthCheck, printHealthReport } = require('../src/fb_bot/health-check.ts')

console.log('🔍 Facebook Selectors Health Check v2.0')
console.log('Baseado no Guia Definitivo para Layout Comet 2025')
console.log('=' .repeat(60))

async function main() {
  try {
    const startTime = Date.now()
    
    console.log('⚡ Iniciando verificação dos seletores WAI-ARIA...\n')
    
    const results = await runHealthCheck()
    
    const totalTime = Date.now() - startTime
    console.log(`\n⏱️  Tempo total: ${totalTime}ms`)
    
    printHealthReport(results)
    
    // Status code baseado nos resultados
    const successCount = results.filter(r => r.success).length
    const successRate = results.length > 0 ? successCount / results.length : 0
    
    if (successRate >= 0.8) {
      console.log('\n🎉 Health check PASSOU! Seletores funcionando bem.')
      process.exit(0)
    } else if (successRate >= 0.5) {
      console.log('\n⚠️  Health check PARCIAL. Alguns seletores precisam de atenção.')
      process.exit(1)
    } else {
      console.log('\n❌ Health check FALHOU! Revisão urgente necessária.')
      process.exit(2)
    }
    
  } catch (error) {
    console.error('💥 Erro fatal no health check:', error.message)
    console.error(error.stack)
    process.exit(3)
  }
}

main()
