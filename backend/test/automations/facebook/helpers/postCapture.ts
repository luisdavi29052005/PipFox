
import { PostData } from '../selectorTester';

// =============================================================================
// POST CAPTURE HELPER
// =============================================================================

export class PostCapture {
  private static instance: PostCapture;
  private capturedPosts: Array<PostData & { groupUrl: string }> = [];
  private isCapturing: boolean = false;

  static getInstance(): PostCapture {
    if (!PostCapture.instance) {
      PostCapture.instance = new PostCapture();
    }
    return PostCapture.instance;
  }

  startCapture(): void {
    this.isCapturing = true;
    this.capturedPosts = [];
    console.log('[CAPTURE] 🎯 Iniciando captura de posts...');
  }

  stopCapture(): Array<PostData & { groupUrl: string }> {
    this.isCapturing = false;
    const posts = [...this.capturedPosts];
    this.capturedPosts = [];
    console.log(`[CAPTURE] 🏁 Captura finalizada. ${posts.length} posts capturados.`);
    return posts;
  }

  capturePost(post: PostData & { groupUrl: string }): void {
    if (this.isCapturing) {
      this.capturedPosts.push(post);
      console.log(`[CAPTURE] 📥 Post capturado: ${post.postId} - ${post.authorName}`);
    }
  }

  isCurrentlyCapturing(): boolean {
    return this.isCapturing;
  }
}

// Função helper para usar no processPostWithN8n
export async function interceptPostForCapture(payload: any, originalWebhookUrl: string): Promise<any> {
  const capture = PostCapture.getInstance();
  
  if (capture.isCurrentlyCapturing()) {
    // Capturar o post
    capture.capturePost(payload);
    
    // Retornar resposta neutra para não processar ainda
    return { shouldComment: false };
  }
  
  // Se não está capturando, usar o webhook original
  const { processPostWithN8n } = await import('./n8nIntegration');
  return processPostWithN8n(payload, originalWebhookUrl);
}
