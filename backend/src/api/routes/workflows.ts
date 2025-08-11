import express from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { checkWorkflowLimit } from '../../middleware/checkLimits.js';
import { supabase } from '../../services/supabaseClient';
import { v4 as uuid } from 'uuid';
import { workflowQueue } from '../../queue/queue.js';
import {
  validateGroupUrl,
  validateWebhookUrl,
  sanitizeKeywords
} from '../../core/automations/facebook/utils/utils';

const router = express.Router();

/* ------------------------------------------------------------------ */
/* LISTAR WORKFLOWS                                                   */
/* ------------------------------------------------------------------ */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: workflows, error } = await supabase
      .from('workflows')
      .select(`
        *,
        workflow_nodes(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(workflows ?? []);
  } catch (err) {
    console.error('Error listing workflows:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/* GET SINGLE WORKFLOW                                                */
/* ------------------------------------------------------------------ */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const workflowId = req.params.id;

    const { data: workflow, error } = await supabase
      .from('workflows')
      .select(`
        *,
        workflow_nodes(*)
      `)
      .eq('id', workflowId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json(workflow);
  } catch (err) {
    console.error('Error getting workflow:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/* GET WORKFLOW NODES                                                 */
/* ------------------------------------------------------------------ */
router.get('/:id/nodes', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const workflowId = req.params.id;

    // First verify the workflow belongs to the user
    const { data: workflow, error: wfError } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .single();

    if (wfError || !workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Get the nodes
    const { data: nodes, error } = await supabase
      .from('workflow_nodes')
      .select('*')
      .eq('workflow_id', workflowId);

    if (error) return res.status(500).json({ error: error.message });
    res.json(nodes ?? []);
  } catch (err) {
    console.error('Error getting workflow nodes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/* CRIAR WORKFLOW                                                     */
/* ------------------------------------------------------------------ */
router.post('/', requireAuth, checkWorkflowLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      account_id,
      name,
      webhook_url,
      groups = []
    } = req.body;

    // Validações básicas
    if (!account_id) return res.status(400).json({ error: 'Account ID is required' });
    if (!name) return res.status(400).json({ error: 'Workflow name is required' });
    if (!groups.length) return res.status(400).json({ error: 'At least one group is required' });

    for (const g of groups) {
      if (!g.url || !validateGroupUrl(g.url)) {
        return res.status(400).json({ error: `Invalid Facebook group URL: ${g.url}` });
      }
    }
    if (webhook_url && !validateWebhookUrl(webhook_url)) {
      return res.status(400).json({ error: 'Valid webhook URL is required' });
    }

    // Verifica se a conta pertence ao usuário
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', account_id)
      .eq('user_id', userId)
      .single();

    if (accErr || !account) return res.status(404).json({ error: 'Account not found' });

    // Cria workflow (UUID gerado pelo banco)
    const { data: workflow, error: wfErr } = await supabase
      .from('workflows')
      .insert([
        {
          user_id: userId,
          account_id,
          name,
          webhook_url,
          status: 'created'
        }
      ])
      .select()
      .single();

    if (wfErr) return res.status(500).json({ error: wfErr.message });

    // Cria nodes
    const nodesPayload = groups.map((g: any) => ({
      id: uuid(),
      workflow_id: workflow.id,
      group_url: g.url,
      group_name: g.name || g.url,
      prompt: g.prompt ?? '',
      keywords: sanitizeKeywords(g.keywords ?? []),
      is_active: true
    }));

    const { data: nodes, error: nodesErr } = await supabase
      .from('workflow_nodes')
      .insert(nodesPayload)
      .select();

    if (nodesErr) {
      await supabase.from('workflows').delete().eq('id', workflow.id); // rollback
      return res.status(500).json({ error: nodesErr.message });
    }

    res.json({ ...workflow, workflow_nodes: nodes });
  } catch (err) {
    console.error('Error creating workflow:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/* START WORKFLOW                                                     */
/* ------------------------------------------------------------------ */
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const workflowId = req.params.id;

    // Verificar se o workflow existe e pertence ao usuário
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select(`
        *,
        accounts(*)
      `)
      .eq('id', workflowId)
      .eq('user_id', userId)
      .single();

    if (workflowError) {
      console.error('Workflow query error:', workflowError);
      return res.status(404).json({ error: 'Workflow not found' });
    }

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Verificar se há uma conta associada
    if (!workflow.account_id) {
      return res.status(400).json({
        error: 'Workflow precisa ter uma conta do Facebook associada.'
      });
    }

    // Buscar a conta
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', workflow.account_id)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(400).json({
        error: 'Conta do Facebook não encontrada.'
      });
    }

    // Verificar se a conta está pronta
    if (account.status !== 'ready') {
      return res.status(400).json({
        error: 'A conta do Facebook precisa estar logada e pronta.'
      });
    }

    // Verificar se há nós de workflow
    const { data: nodes, error: nodesError } = await supabase
      .from('workflow_nodes')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('is_active', true);

    if (nodesError || !nodes || nodes.length === 0) {
      return res.status(400).json({
        error: 'Workflow precisa ter pelo menos um grupo ativo configurado.'
      });
    }

    // Adicionar workflow à fila
    await workflowQueue.add(`start-workflow-${workflowId}`, {
      workflowId,
      userId,
      accountId: workflow.account_id
    });

    res.json({
      message: 'Workflow iniciado com sucesso',
      status: 'queued'
    });
  } catch (err) {
    console.error('Error starting workflow:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ------------------------------------------------------------------ */
/* STOP WORKFLOW                                                      */
/* ------------------------------------------------------------------ */
router.post('/:id/stop', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const workflowId = req.params.id;

    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .single();

    if (error || !workflow) return res.status(404).json({ error: 'Workflow not found' });

    await supabase.from('workflows').update({ status: 'stopped' }).eq('id', workflowId);

   const runner = await import('../../core/automations/facebook/runner');
   await runner.stopRunner(workflowId);

    res.json({ msg: `Workflow ${workflowId} stopped successfully!` });
  } catch (err) {
    console.error('Error stopping workflow:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/workflows/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Total workflows
    const { count: totalWorkflows } = await supabase
      .from('workflows')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Active workflows
    const { count: activeWorkflows } = await supabase
      .from('workflows')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'running');

    // Total groups
    const { count: totalGroups } = await supabase
      .from('workflow_nodes')
      .select('workflow_id!inner(user_id)', { count: 'exact', head: true })
      .eq('workflow_id.user_id', userId)
      .eq('is_active', true);

    res.json({
      success: true,
      data: {
        total: totalWorkflows || 0,
        active: activeWorkflows || 0,
        totalGroups: totalGroups || 0
      }
    });
  } catch (error) {
    console.error('Error fetching workflow stats:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

export default router;