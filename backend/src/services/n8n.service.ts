import fetch from 'node-fetch';

export async function sendToN8n(leadId: string, imageBuffer: Buffer, webhookUrl?: string, prompt = '') {
  if (!webhookUrl) {
    console.warn(`[n8n] Webhook URL não configurado para o workflow. Lead ${leadId} não será processado.`);
    return;
  }

  const payload = {
    id: leadId,
    prompt,
    screenshot: imageBuffer.toString('base64'),
    screenshot_type: 'png',
    timestamp: new Date().toISOString()
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n respondeu com status ${response.status}: ${errorText}`);
    }

    console.log(`[n8n] Lead ${leadId} enviado com sucesso para o webhook.`);
    // O n8n agora é responsável por chamar de volta a nossa API
    // para atualizar o lead com o comentário gerado.

  } catch (error) {
    console.error(`[n8n] Falha ao enviar lead ${leadId} para o webhook:`, error);
    // Aqui você pode adicionar lógica para re-tentativas ou marcar o lead como falho
  }
}
