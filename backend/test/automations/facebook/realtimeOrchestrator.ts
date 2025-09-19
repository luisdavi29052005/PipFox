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

// WEBHOOK 1: Filtro de gênero (análise inicial)
const FILTER_WEBHOOK_URL = "http://localhost:5678/webhook/fb-bot-repl";

// WEBHOOK 2: Geração de comentário personalizado 
const COMMENT_WEBHOOK_URL = "http://localhost:5678/webhook/comment-generator";

const MAX_POSTS_PER_GROUP = 10;

// =============================================================================
// TIPOS E INTERFACES
// =============================================================================

interface FilterResponse {
    shouldComment: boolean;
    data?: {
        nome: string;
        permalink: string;
        texto: string;
        genero: string;
    };
}

interface CommentResponse {
    comment: string;
    success: boolean;
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
            // ETAPA 1: Filtrar no N8N imediatamente
            console.log(`[TEMPO-REAL] 🔍 Analisando post: ${post.authorName}`);
            const filterResult = await this.orchestrator.callFilterWebhook(post);

            if (filterResult.shouldComment && filterResult.data) {
                const approvedPost = { ...post, filterData: filterResult.data };
                this.groupResults.approvedPosts.push(approvedPost);
                this.orchestrator.stats.filtered++;
                this.groupResults.stats.approved++;

                console.log(`[TEMPO-REAL] ✅ Post aprovado: ${post.authorName} (${filterResult.data.genero})`);

                // ETAPA 2: Processar imediatamente se aprovado
                try {
                    console.log(`[TEMPO-REAL] 🤖 Processando imediatamente: ${post.postId}`);

                    // Gerar comentário personalizado
                    const commentResult = await this.orchestrator.callCommentWebhook(filterResult.data);

                    if (commentResult.success && commentResult.comment) {
                        console.log(`[TEMPO-REAL] 💬 Comentário gerado: "${commentResult.comment.substring(0, 50)}..."`);

                        // Comentar no post
                        const processingOptions: PostProcessorOptions = {
                            userId: this.userId,
                            accountId: this.accountId,
                            headless: RUN_HEADLESS,
                            commentMessage: commentResult.comment,
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
                            comment: commentResult,
                            processing: result,
                            processedAt: new Date().toISOString()
                        };

                        if (result.success) {
                            this.orchestrator.stats.processed++;
                            this.groupResults.stats.processed++;
                            this.groupResults.processedPosts.push(processedPost);
                            console.log(`[TEMPO-REAL] ✅ Post ${post.postId} comentado com sucesso`);
                        } else {
                            this.orchestrator.stats.failed++;
                            this.groupResults.stats.failed++;
                            processedPost.processing.failed = true;
                            this.groupResults.processedPosts.push(processedPost);
                            console.log(`[TEMPO-REAL] ❌ Falha ao comentar post ${post.postId}: ${result.error}`);
                        }

                        // Pausa entre processamentos
                        await this.orchestrator.sleep(this.orchestrator.rand(5000, 10000));

                    } else {
                        this.orchestrator.stats.failed++;
                        this.groupResults.stats.failed++;
                        console.log(`[TEMPO-REAL] ❌ Falha ao gerar comentário para ${post.postId}`);
                    }

                } catch (error) {
                    this.orchestrator.stats.failed++;
                    this.groupResults.stats.failed++;
                    console.error(`[TEMPO-REAL] ❌ Erro ao processar post ${post.postId}:`, error);
                }

            } else {
                console.log(`[TEMPO-REAL] ❌ Post rejeitado: ${post.authorName}`);
            }

        } catch (error) {
            console.error(`[TEMPO-REAL] ❌ Erro ao filtrar post ${post.postId}:`, error);
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
        console.log("--- Orchestrator v7.0 (Clean Dual Webhook) ---");
        console.log("Fluxo: Extração → Filtro N8N → Processamento → Comentário N8N");
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
            const { saveContextSession } = await import('../../../src/core/automations/facebook/session/context');
            await saveContextSession(this.accountId!);
            console.log(`[GRUPO-${groupId}] 🏁 Processamento finalizado`);
        }
    }

    public async callFilterWebhook(post: PostData & { groupUrl: string }): Promise<FilterResponse> {
        try {
            console.log(`[FILTRO] 🔄 Enviando para análise: ${post.authorName}`);

            // Formato correto esperado pelo n8n workflow
            // CÓDIGO CORRIGIDO E LIMPO
            const payload = {
                data: { // <-- Enviando os dados diretamente
                    postId: post.postId,
                    permalink: post.permalink,
                    authorName: post.authorName,
                    text: post.text
                },
                timestamp: new Date().toISOString()
            };
            const response = await fetch(FILTER_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Webhook respondeu com status ${response.status}`);
            }

            // Tentar fazer parse da resposta
            let result;
            const responseText = await response.text();

            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                // Se não conseguir fazer parse, pode ser uma lista vazia ou resposta inválida
                console.log(`[FILTRO] ⚠️ Resposta não é JSON válido: "${responseText}"`);
                return { shouldComment: false };
            }

            // Verificar se o resultado indica que deve comentar (genero === "homem")
            if (result && Array.isArray(result) && result.length > 0) {
                const data = result[0];
                console.log(`[FILTRO] ✅ Post aprovado pelo N8N:`, data);
                return {
                    shouldComment: true,
                    data: {
                        nome: data.nome || post.authorName,
                        permalink: data.permalink || post.permalink,
                        texto: data.texto || post.text,
                        genero: data.genero || 'homem'
                    }
                };
            } else {
                console.log(`[FILTRO] ❌ Post rejeitado pelo N8N (lista vazia ou gênero não é homem)`);
                return { shouldComment: false };
            }

        } catch (error) {
            console.error('[FILTRO] ❌ Erro na chamada do webhook:', error);
            return { shouldComment: false };
        }
    }

    public async callCommentWebhook(filterData: any): Promise<CommentResponse> {
        try {
            console.log(`[COMENTÁRIO] 🔄 Gerando comentário personalizado para: ${filterData.nome}`);

            const payload = {
                body: {
                    data: {
                        nome: filterData.nome,
                        permalink: filterData.permalink,
                        texto: filterData.texto,
                        genero: filterData.genero
                    }
                },
                timestamp: new Date().toISOString()
            };

            const response = await fetch(COMMENT_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Webhook respondeu com status ${response.status}`);
            }

            let result;
            const responseText = await response.text();

            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.log(`[COMENTÁRIO] ⚠️ Resposta não é JSON válido, usando comentário padrão`);
                return {
                    success: true,
                    comment: `Olá ${filterData.nome}! 👋 Posso ajudar você com isso! 😊`
                };
            }

            const comment = result.comment ||
                result.message ||
                `Olá ${filterData.nome}! 👋 Posso ajudar você com isso! 😊`;

            console.log(`[COMENTÁRIO] ✅ Comentário gerado: "${comment.substring(0, 50)}..."`);

            return {
                success: true,
                comment: comment
            };

        } catch (error) {
            console.error('[COMENTÁRIO] ❌ Erro na geração do comentário:', error);
            return {
                success: true,
                comment: `Olá ${filterData.nome}! 👋 Posso ajudar você com isso! 😊` // Fallback personalizado
            };
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
                    filterWebhookUrl: FILTER_WEBHOOK_URL,
                    commentWebhookUrl: COMMENT_WEBHOOK_URL,
                    orchestratorVersion: "v7.0",
                    flowType: "Extração → Filtro N8N → Processamento → Comentário N8N"
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