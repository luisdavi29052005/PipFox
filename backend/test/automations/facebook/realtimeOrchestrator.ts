import { testSelectors, PostData } from './selectorTester';
import { runPostProcessing, PostProcessorOptions } from './postProcessor';
import { getTestIds } from './helpers/getTestIds';
import { PostCapture } from './helpers/postCapture';
import fs from 'fs';
import path from 'path';

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const GROUP_URLS = [
    "https://www.facebook.com/groups/940840924057399",
    "https://www.facebook.com/groups/301237675753904",
];

const RUN_HEADLESS = false;

// WEBHOOK ÚNICO: Filtro + geração de comentário em um só workflow
const UNIFIED_WEBHOOK_URL = "http://localhost:5678/webhook/fb-bot-repl";

const MAX_POSTS_PER_GROUP = 10;

// =============================================================================
// TIPOS E INTERFACES
// =============================================================================

interface UnifiedWebhookResponse {
    shouldComment: boolean;
    comment?: string;
    data?: {
        nome: string;
        permalink: string;
        texto: string;
        genero: string;
    };
    success?: boolean;
}

// =============================================================================
// CLASSE PARA PROCESSAMENTO EM TEMPO REAL
// =============================================================================

class RealTimeCapture {
    private orchestrator: RealTimeOrchestrator;
    private userId: string;
    private accountId: string;
    private groupUrl: string;
    private groupResults: any;

    constructor(
        userId: string,
        accountId: string,
        groupUrl: string,
        groupResults: any,
        orchestrator: RealTimeOrchestrator
    ) {
        this.userId = userId;
        this.accountId = accountId;
        this.groupUrl = groupUrl;
        this.groupResults = groupResults;
        this.orchestrator = orchestrator;
    }

    async startRealTimeProcessing(maxPosts: number) {
        // Configurar o processador em tempo real
        const { RealTimePostProcessor } = await import('./helpers/realTimePostProcessor');
        const processor = RealTimePostProcessor.getInstance();
        processor.setProcessor(this);

        try {
            // Usar testSelectors com webhook especial que processa em tempo real
            await testSelectors({
                userId: this.userId,
                accountId: this.accountId,
                groupUrl: this.groupUrl,
                webhookUrl: "realtime://process", // URL especial para processamento em tempo real
                headless: RUN_HEADLESS,
                maxPosts: maxPosts,
                saveToJson: false,
                healthCheckOnly: false,
            });
        } finally {
            // Desativar o processador
            processor.stopProcessor();
        }
    }

    async processPostInRealTime(post: any) {
        const groupName = new URL(this.groupUrl).pathname.split('/')[2] || 'unknown';

        console.log(`[TEMPO-REAL] ⚡ Post extraído: ${post.authorName} - ${post.postId}`);
        this.orchestrator.stats.extracted++;
        this.groupResults.stats.extracted++;

        // Verificar se tem dados necessários
        if (!post.postId || !post.permalink || !post.text || !post.authorName) {
            console.log(`[TEMPO-REAL] ⚠️ Post ${post.postId} sem dados necessários, pulando...`);
            return;
        }

        try {
            // ETAPA ÚNICA: Processar no N8N (filtro + geração de comentário)
            console.log(`[TEMPO-REAL] 🔍 Enviando para análise completa: ${post.authorName}`);
            const webhookResult = await this.orchestrator.callUnifiedWebhook(post);

            if (webhookResult.shouldComment && webhookResult.comment && webhookResult.data) {
                const approvedPost = { ...post, filterData: webhookResult.data };
                this.groupResults.approvedPosts.push(approvedPost);
                this.orchestrator.stats.filtered++;
                this.groupResults.stats.approved++;

                console.log(`[APROVADO] ✅ ${post.authorName} (${webhookResult.data.genero})`);
                console.log(`[IA] ✅ Comentário gerado: "${webhookResult.comment.substring(0, 80)}..."`);
                console.log(`[PROCESSADOR] 🚀 Iniciando comentário no Facebook...`);

                // Comentar no post
                const processingOptions: PostProcessorOptions = {
                    userId: this.userId,
                    accountId: this.accountId,
                    headless: RUN_HEADLESS,
                    commentMessage: webhookResult.comment,
                    post: {
                        postId: post.postId,
                        permalink: post.permalink,
                        authorName: post.authorName,
                        text: post.text,
                        imageUrls: post.imageUrls || []
                    }
                };

                const result = await runPostProcessing(processingOptions);

                const processedPost = {
                    ...approvedPost,
                    comment: { comment: webhookResult.comment, success: true },
                    processing: result,
                    processedAt: new Date().toISOString()
                };

                if (result.success) {
                    this.orchestrator.stats.processed++;
                    this.groupResults.stats.processed++;
                    this.groupResults.processedPosts.push(processedPost);
                    console.log(`[SUCESSO] ✅ Post comentado: ${post.authorName} - "${webhookResult.comment.substring(0, 50)}..."`);
                } else {
                    this.orchestrator.stats.failed++;
                    this.groupResults.stats.failed++;
                    processedPost.processing.failed = true;
                    this.groupResults.processedPosts.push(processedPost);
                    console.log(`[ERRO] ❌ Falha ao comentar: ${result.error}`);
                }

                // Pausa entre processamentos
                await this.orchestrator.sleep(this.orchestrator.rand(5000, 10000));

            } else {
                console.log(`[TEMPO-REAL] ❌ Post rejeitado ou sem comentário: ${post.authorName}`);
                if (webhookResult.data) {
                    console.log(`[FILTRO] Motivo: gênero "${webhookResult.data.genero}" ou comentário vazio`);
                }
            }

        } catch (error) {
            console.error(`[TEMPO-REAL] ❌ Erro ao processar post ${post.postId}:`, error);
            this.orchestrator.stats.failed++;
            this.groupResults.stats.failed++;
        }
    }
}

// =============================================================================
// ORQUESTRADOR SIMPLIFICADO
// =============================================================================

class RealTimeOrchestrator {
    private outputDir: string;
    public stats = {
        extracted: 0,
        filtered: 0,
        processed: 0,
        failed: 0,
        startTime: new Date().toISOString()
    };
    private userId: string | null = null;
    private accountId: string | null = null;

    // Variáveis para acumular estatísticas totais
    private totalExtracted: number = 0;
    private totalFiltered: number = 0;
    private totalProcessed: number = 0;
    private totalFailures: number = 0;

    constructor() {
        this.outputDir = path.join(process.cwd(), "output", "realtime");
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    async start() {
        console.log("--- Orchestrator v8.0 (Unified Webhook) ---");
        console.log("Fluxo: Extração → N8N Unificado (Filtro + IA) → Processamento");
        console.log("---------------------------------\n");

        const testIds = await getTestIds();
        if (!testIds) {
            console.error("[ORQUESTRADOR] ❌ Não foi possível obter IDs de teste. Abortando.");
            return;
        }

        this.userId = testIds.userId;
        this.accountId = testIds.accountId;

        // Processar cada grupo sequencialmente
        for (const groupUrl of GROUP_URLS) {
            await this.processGroupWithDualWebhooks(groupUrl);
        }

        this.showFinalStats();
    }

    private extractGroupId(url: string): string {
        return new URL(url).pathname.split('/')[2] || 'unknown';
    }

    async processGroupWithDualWebhooks(groupUrl: string): Promise<void> {
        const groupId = this.extractGroupId(groupUrl);
        console.log(`[GRUPO-${groupId}] 🚀 Iniciando processamento em TEMPO REAL...`);
        console.log(`[GRUPO-${groupId}] ⚡ Iniciando extração e processamento em tempo real...`);

        const groupResults = {
            groupName: groupId,
            groupUrl: groupUrl,
            processedAt: new Date().toISOString(),
            stats: {
                extracted: 0,
                approved: 0,
                processed: 0,
                failed: 0
            },
            approvedPosts: [],
            processedPosts: []
        };

        try {
            const realTimeCapture = new RealTimeCapture(
                this.userId!,
                this.accountId!,
                groupUrl,
                groupResults,
                this
            );

            await realTimeCapture.startRealTimeProcessing(MAX_POSTS_PER_GROUP);

            console.log(`[GRUPO-${groupId}] ✅ Posts extraídos: ${groupResults.stats.extracted}`);
            console.log(`[GRUPO-${groupId}] 🔍 Posts aprovados: ${groupResults.stats.approved}`);
            console.log(`[GRUPO-${groupId}] ✅ Posts processados: ${groupResults.stats.processed}`);

            // Acumular resultados
            this.totalExtracted += groupResults.stats.extracted;
            this.totalFiltered += groupResults.stats.approved;
            this.totalProcessed += groupResults.stats.processed;
            this.totalFailures += groupResults.stats.failed;

            // Salvar resultados se houver posts processados
            if (groupResults.stats.processed > 0) {
                await this.saveGroupResults(groupResults);
            } else {
                console.log(`[GRUPO-${groupId}] ⚠️ Nenhum post foi processado. Nenhum arquivo será salvo.`);
            }

        } catch (error) {
            console.error(`[GRUPO-${groupId}] ❌ Erro geral:`, error);
            this.totalFailures++;
        } finally {
            // Salvar sessão antes de processar próximo grupo
            try {
                const { saveContextSession } = await import('../../../src/core/automations/facebook/session/context');
                if (saveContextSession) {
                    await saveContextSession(this.accountId!);
                }
            } catch (error) {
                console.log(`[GRUPO-${groupId}] ⚠️ Não foi possível salvar sessão:`, error);
            }
            console.log(`[GRUPO-${groupId}] 🏁 Processamento finalizado`);
        }
    }

    public async callUnifiedWebhook(extractedData: PostData): Promise<UnifiedWebhookResponse> {
        try {
            const payload = {
                data: {
                    postId: extractedData.postId,
                    permalink: extractedData.permalink,
                    authorName: extractedData.authorName,
                    text: extractedData.text,
                    groupUrl: extractedData.groupUrl
                },
                timestamp: new Date().toISOString()
            };

            console.log(`[WEBHOOK] 🔄 Enviando para análise unificada: ${extractedData.authorName}`);
            console.log(`[WEBHOOK] 📝 Texto: "${extractedData.text.substring(0, 100)}..."`);

            const response = await fetch(UNIFIED_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 45000 // 45 segundos para processamento completo
            });

            if (!response.ok) {
                console.log(`[WEBHOOK] ❌ Webhook retornou status ${response.status}`);
                throw new Error(`Webhook respondeu com status ${response.status}`);
            }

            const responseText = await response.text();
            console.log(`[WEBHOOK] 📥 Resposta bruta: "${responseText}"`);

            let result;
            try {
                result = JSON.parse(responseText);
                console.log(`[WEBHOOK] 📋 Resposta parseada:`, result);
            } catch (parseError) {
                console.log(`[WEBHOOK] ⚠️ Resposta não é JSON válido: "${responseText}"`);
                return { shouldComment: false };
            }

            // Processar a resposta unificada
            if (result.shouldComment !== false && result.genero && result.genero.toLowerCase() === 'homem' && result.comment) {
                console.log(`[WEBHOOK] ✅ Aprovado: ${result.nome || extractedData.authorName} (${result.genero})`);
                console.log(`[WEBHOOK] 💬 Comentário: "${result.comment.substring(0, 80)}..."`);

                return {
                    shouldComment: true,
                    comment: result.comment,
                    data: {
                        nome: result.nome || extractedData.authorName,
                        permalink: result.permalink || extractedData.permalink,
                        texto: result.texto || extractedData.text,
                        genero: result.genero
                    },
                    success: true
                };
            } else {
                const motivo = !result.genero ? 'gênero não identificado' :
                    result.genero.toLowerCase() !== 'homem' ? `gênero: ${result.genero}` :
                        !result.comment ? 'sem comentário gerado' : 'condições não atendidas';
                console.log(`[WEBHOOK] ❌ Rejeitado: ${extractedData.authorName} (${motivo})`);

                return {
                    shouldComment: false,
                    data: result.genero ? {
                        nome: result.nome || extractedData.authorName,
                        permalink: result.permalink || extractedData.permalink,
                        texto: result.texto || extractedData.text,
                        genero: result.genero
                    } : undefined
                };
            }

        } catch (error) {
            console.error('[WEBHOOK] ❌ Erro na comunicação com N8N:', error);
            console.log(`[WEBHOOK] 🔧 Verifique se o N8N está rodando e o webhook está ativo em: ${UNIFIED_WEBHOOK_URL}`);
            return { shouldComment: false };
        }
    }

    private async saveGroupResults(groupResults: any) {
        try {
            // Só salva se houver posts aprovados
            if (groupResults.approvedPosts.length === 0) {
                console.log(`[SAVE] ⚠️ Nenhum post aprovado para ${groupResults.groupName}. Arquivo não será salvo.`);
                return;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const fileName = `results_${groupResults.groupName}_${timestamp}.json`;
            const filePath = path.join(this.outputDir, fileName);

            const dataToSave = {
                meta: {
                    groupName: groupResults.groupName,
                    groupUrl: groupResults.groupUrl,
                    processedAt: groupResults.processedAt,
                    unifiedWebhookUrl: UNIFIED_WEBHOOK_URL,
                    orchestratorVersion: "v8.0",
                    flowType: "Extração → N8N Unificado (Filtro + IA) → Processamento"
                },
                stats: groupResults.stats,
                results: {
                    approvedPosts: groupResults.approvedPosts,
                    processedPosts: groupResults.processedPosts
                }
            };

            fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
            console.log(`[SAVE] 💾 Resultados consolidados salvos: ${fileName}`);
            console.log(`[SAVE] 📊 Posts aprovados: ${groupResults.stats.approved}, Processados: ${groupResults.stats.processed}`);
        } catch (error) {
            console.error("[SAVE] ❌ Erro ao salvar resultados consolidados:", error);
        }
    }

    private showFinalStats() {
        const duration = (Date.now() - new Date(this.stats.startTime).getTime()) / 1000;

        console.log('\n📊 RESULTADOS FINAIS');
        console.log('====================');
        console.log(`⏱️ Duração: ${Math.round(duration)}s`);
        console.log(`📥 Posts extraídos: ${this.totalExtracted}`);
        console.log(`🔍 Posts filtrados: ${this.totalFiltered}`);
        console.log(`✅ Posts processados: ${this.totalProcessed}`);
        console.log(`❌ Falhas: ${this.totalFailures}`);
        console.log(`📁 Arquivos salvos em: ${this.outputDir}`);
        console.log('====================');
    }

    public sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public rand(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

async function sendToWebhook(url: string, data: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`
            };
        }

        const responseText = await response.text();

        if (!responseText.trim()) {
            return {
                success: false,
                error: 'Resposta vazia do webhook'
            };
        }

        // Tentar fazer parse do JSON
        try {
            const jsonData = JSON.parse(responseText);
            return {
                success: true,
                data: jsonData
            };
        } catch (parseError) {
            // Se não conseguir fazer parse, retornar como string
            console.log(`[Webhook] ⚠️ Resposta não é JSON válido, tratando como texto: "${responseText}"`);
            return {
                success: true,
                data: responseText
            };
        }

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
    const orchestrator = new RealTimeOrchestrator();

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Parando orquestrador...');
        process.exit(0);
    });

    await orchestrator.start();
}

main().catch(error => {
    console.error("\n[ORQUESTRADOR] 💥 Erro fatal:", error);
    process.exit(1);
});