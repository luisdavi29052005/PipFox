
export interface N8nPostPayload {
  postId: string | null
  permalink: string | null
  authorName: string | null
  authorUrl: string | null
  timeISO: string | null
  timeText: string | null
  text: string | null
  imageUrls: string[]
  groupUrl: string
}

export interface N8nResponse {
  shouldComment: boolean
  commentText?: string
  error?: string
}

export async function processPostWithN8n(
  payload: N8nPostPayload,
  webhookUrl: string
): Promise<N8nResponse> {
  try {
    // Verificar se é uma URL especial para captura
    if (webhookUrl === 'capture://dummy') {
      const { PostCapture } = await import('./postCapture');
      const capture = PostCapture.getInstance();

      if (capture.isCurrentlyCapturing()) {
        capture.capturePost(payload);
        return { shouldComment: false };
      }
    }

    // Verificar se é uma URL especial para processamento em tempo real
    if (webhookUrl === 'realtime://process') {
      const { RealTimePostProcessor } = await import('./realTimePostProcessor');
      const processor = RealTimePostProcessor.getInstance();

      if (processor.isProcessing()) {
        await processor.processPostInRealTime(payload);
        return { shouldComment: false };
      }
    }

    console.log('[n8nIntegration] Enviando post para análise...')

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'analyze_post',
        data: payload,
        timestamp: new Date().toISOString()
      })
    })

    if (!response.ok) {
      throw new Error(`N8n respondeu com status ${response.status}`)
    }

    const result = await response.json() as N8nResponse
    console.log('[n8nIntegration] Resposta recebida:', result)

    return result

  } catch (error) {
    console.error('[n8nIntegration] Erro ao processar com n8n:', error)
    return {
      shouldComment: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
