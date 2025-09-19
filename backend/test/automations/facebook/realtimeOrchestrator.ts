import { spawn, ChildProcess } from 'child_process';
import { getTestIds } from './helpers/getTestIds';

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const GROUP_URLS = [
  "https://www.facebook.com/groups/940840924057399",
  "https://www.facebook.com/groups/301237675753904",
  // Adicione mais URLs de grupos para monitorar
];

const MAX_POSTS_PER_CYCLE = 15; // Buscar até 15 posts *novos* por grupo, a cada ciclo
const RUN_HEADLESS = false;     // `false` para ver o navegador, `true` para rodar em background
const CYCLE_PAUSE_MS = 60000;   // Pausa de 60 segundos entre o fim de um ciclo e o início do próximo

const WEBHOOK_EXTRACTOR_TO_N8N = "http://localhost:5678/webhook/dd50047c-1753-4146-bac1-52cd26335fd2";


// =============================================================================
// ORQUESTRADOR
// =============================================================================

/**
 * Inicia e gerencia um processo filho (worker).
 */
function runWorker(command: string, args: string[], name: string): ChildProcess {
    console.log(`[ORQUESTRADOR] 🚀 Iniciando worker: ${name}`);
    const workerProcess = spawn(command, args, { stdio: 'pipe', shell: true });

    workerProcess.stdout.on('data', (data) => {
      process.stdout.write(`[${name}] ${data.toString()}`);
    });

    workerProcess.stderr.on('data', (data) => {
      process.stderr.write(`[${name}] stderr: ${data.toString()}`);
    });

    workerProcess.on('close', (code) => {
        if (code === 0) {
            console.log(`[ORQUESTRADOR] ✅ Worker ${name} finalizou.`);
        } else {
            console.error(`[ORQUESTRADOR] ❌ Worker ${name} finalizou com erro (código: ${code}). Reiniciando se necessário...`);
        }
    });
    
    return workerProcess;
}

/**
 * Função principal que orquestra a execução em tempo real.
 */
async function main() {
    console.log("--- Orchestrator v2.0 (Ciclo Contínuo) ---");
    console.log("Iniciando sistema de processamento em tempo real...");
    console.log("---------------------------------\n");

    const testIds = await getTestIds();
    if (!testIds) {
        console.error("[ORQUESTRADOR] ❌ Não foi possível obter IDs de teste. Abortando.");
        return;
    }
    const { userId, accountId } = testIds;

    // 1. Inicia o worker do PROCESSADOR para rodar continuamente em background.
    const processorWorker = runWorker('npx', ['tsx', 'postProcessor.ts'], 'PROCESSADOR');
    
    // Handler para garantir que o processador seja encerrado junto com o orquestrador.
    process.on('exit', () => processorWorker.kill());

    console.log("[ORQUESTRADOR] Worker PROCESSADOR iniciado. Aguardando estabilização...");
    await new Promise(resolve => setTimeout(resolve, 3000)); // Espera o servidor do processador subir.

    // 2. Inicia o ciclo infinito de extração.
    console.log("[ORQUESTRADOR] 🔄 Iniciando ciclo de extração contínuo. Pressione Ctrl+C para parar.");
    
    let cycleCount = 0;
    while (true) {
        cycleCount++;
        console.log(`\n================== CICLO DE EXTRAÇÃO #${cycleCount} - ${new Date().toLocaleTimeString()} ==================`);
        
        // Roda a extração para cada grupo, UM DE CADA VEZ, para evitar conflitos.
        for (const groupUrl of GROUP_URLS) {
            const groupName = new URL(groupUrl).pathname.split('/')[2] || 'extrator';
            console.log(`\n[ORQUESTRADOR] --- Verificando Grupo: ${groupName} ---`);
            
            const extractorArgs = [
                'tsx',
                'selectorTester.ts',
                groupUrl,
                `--userId=${userId}`,
                `--accountId=${accountId}`,
                `--maxPosts=${MAX_POSTS_PER_CYCLE}`,
                `--webhookUrl=${WEBHOOK_EXTRACTOR_TO_N8N}`,
                RUN_HEADLESS ? '--headless' : ''
            ].filter(Boolean);

            // Criamos uma promessa para aguardar a finalização do extrator deste grupo.
            await new Promise<void>((resolve) => {
                const extractorProcess = runWorker('npx', extractorArgs, `EXTRATOR-${groupName}`);
                extractorProcess.on('close', () => resolve());
            });
        }

        console.log(`\n[ORQUESTRADOR] ✅ Ciclo de extração #${cycleCount} concluído.`);
        console.log(`[ORQUESTRADOR] ⏸️  Aguardando ${CYCLE_PAUSE_MS / 1000} segundos antes do próximo ciclo...`);
        await new Promise(resolve => setTimeout(resolve, CYCLE_PAUSE_MS));
    }
}

main().catch(error => {
    console.error("\n[ORQUESTRADOR] 💥 Erro fatal e não tratado:", error);
    process.exit(1);
});

