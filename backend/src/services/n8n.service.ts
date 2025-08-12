import fetch from 'node-fetch';

/**
 * Envia um payload genérico para um webhook do n8n.
 * @param leadId O ID do lead para referência.
 * @param payload O objeto de dados a ser enviado.
 * @param webhookUrl A URL do webhook para este workflow específico.
 */
export async function sendToN8n(leadId: string, payload: object, webhookUrl?: string) {
  if (!webhookUrl) {
    console.warn(`[n8n] Webhook URL não configurado. Lead ${leadId} não será processado.`);
    return;
  }

  // Adiciona metadados ao payload
  const finalPayload = {
    lead_id: leadId,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n respondeu com status ${response.status}: ${errorText}`);
    }

    console.log(`[n8n] Lead ${leadId} enviado com sucesso para o webhook.`);
  } catch (error) {
    console.error(`[n8n] Falha ao enviar lead ${leadId} para o webhook:`, error);
  }
}