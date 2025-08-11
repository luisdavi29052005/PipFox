
import express from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { supabase } from '../../services/supabaseClient';
import { v4 as uuid } from 'uuid';
import { sanitizeKeywords } from '../../core/automations/facebook/utils/utils';

const router = express.Router();

// GET workflow node by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const nodeId = req.params.id;

    const { data: node, error } = await supabase
      .from('workflow_nodes')
      .select(`
        *,
        workflows!inner(user_id)
      `)
      .eq('id', nodeId)
      .eq('workflows.user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Workflow node not found' });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json(node);
  } catch (err) {
    console.error('Error getting workflow node:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE workflow node
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      workflow_id,
      group_url,
      group_name,
      prompt = '',
      keywords = [],
      is_active = true
    } = req.body;

    if (!workflow_id || !group_url || !group_name) {
      return res.status(400).json({ 
        error: 'workflow_id, group_url, and group_name are required' 
      });
    }

    // Verify workflow belongs to user
    const { data: workflow, error: wfError } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', workflow_id)
      .eq('user_id', userId)
      .single();

    if (wfError || !workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const nodeData = {
      id: uuid(),
      workflow_id,
      group_url,
      group_name,
      prompt,
      keywords: sanitizeKeywords(keywords),
      is_active
    };

    const { data: node, error } = await supabase
      .from('workflow_nodes')
      .insert([nodeData])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(node);
  } catch (err) {
    console.error('Error creating workflow node:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE workflow node
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const nodeId = req.params.id;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.workflow_id;
    delete updates.created_at;
    delete updates.updated_at;

    // Sanitize keywords if present
    if (updates.keywords) {
      updates.keywords = sanitizeKeywords(updates.keywords);
    }

    // Verify the node belongs to a workflow owned by the user
    const { data: existingNode, error: checkError } = await supabase
      .from('workflow_nodes')
      .select(`
        id,
        workflows!inner(user_id)
      `)
      .eq('id', nodeId)
      .eq('workflows.user_id', userId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Workflow node not found' });
      }
      return res.status(500).json({ error: checkError.message });
    }

    if (!existingNode) {
      return res.status(404).json({ error: 'Workflow node not found' });
    }

    // Update the node
    const { data: updatedNode, error: updateError } = await supabase
      .from('workflow_nodes')
      .update(updates)
      .eq('id', nodeId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json(updatedNode);
  } catch (err) {
    console.error('Error updating workflow node:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE workflow node
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const nodeId = req.params.id;

    // Verify the node belongs to a workflow owned by the user
    const { data: existingNode, error: checkError } = await supabase
      .from('workflow_nodes')
      .select(`
        id,
        workflows!inner(user_id)
      `)
      .eq('id', nodeId)
      .eq('workflows.user_id', userId)
      .single();

    if (checkError || !existingNode) {
      return res.status(404).json({ error: 'Workflow node not found' });
    }

    const { error: deleteError } = await supabase
      .from('workflow_nodes')
      .delete()
      .eq('id', nodeId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting workflow node:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
