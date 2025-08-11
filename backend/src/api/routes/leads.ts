// PipeFox/backend/src/api/leads.ts
import express from 'express';
import { supabase } from '../../services/supabaseClient';
import { workflowQueue } from '../../queue/queue'; // Usaremos a mesma fila

const router = express.Router();

// Function to create or update a lead
export async function upsertLead(nodeId: string, postUrl: string) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .upsert({
        node_id: nodeId,
        post_url: postUrl,
        status: 'captured',
        created_at: new Date().toISOString()
      }, {
        onConflict: 'post_url',
        ignoreDuplicates: false
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error upserting lead:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error in upsertLead:', err);
    return null;
  }
}

// Rota que o n8n vai chamar
// A chave de API é uma forma simples de proteger o endpoint
router.post('/:id/callback', async (req, res) => {
  const leadId = req.params.id;
  const apiKey = req.headers['x-api-key'];
  const { generated_comment, status } = req.body;

  // Proteção simples do endpoint
  if (apiKey !== process.env.N8N_API_KEY) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (!generated_comment || !status) {
    return res.status(400).json({ error: 'Dados insuficientes no callback' });
  }

  try {
    // 1. Atualiza o lead no banco com o comentário e o novo status
    const { data: lead, error } = await supabase
      .from('leads')
      .update({ generated_comment, status })
      .eq('id', leadId)
      .select('id, post_url')
      .single();

    if (error || !lead) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }

    // 2. Se o status for 'ready_to_comment', enfileira um job para o bot comentar
    if (status === 'ready_to_comment') {
      await workflowQueue.add('comment-job', {
        leadId: lead.id,
        postUrl: lead.post_url,
        commentText: generated_comment,
      }, {
        jobId: `comment:${lead.id}` // Evita jobs duplicados
      });
      console.log(`[api] Job de comentário para o lead ${leadId} foi enfileirado.`);
    }

    res.json({ success: true, leadId });

  } catch (err) {
    console.error(`[api] Erro no callback para o lead ${leadId}:`, err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;