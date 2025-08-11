
import express from 'express';
import { supabase } from '../../services/supabaseClient';
import { requireAuth } from '../../middleware/requireAuth';

const router = express.Router();

// GET /api/dashboard/summary
router.get('/summary', requireAuth, async (req, res) => {
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

    // Total groups monitored
    const { count: monitoredGroups } = await supabase
      .from('workflow_nodes')
      .select('workflow_id!inner(user_id)', { count: 'exact', head: true })
      .eq('workflow_id.user_id', userId)
      .eq('is_active', true);

    // Posts and comments in last 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { count: posts24h } = await supabase
      .from('leads')
      .select('node_id!inner(workflow_id!inner(user_id))', { count: 'exact', head: true })
      .eq('node_id.workflow_id.user_id', userId)
      .gte('created_at', yesterday);

    const { count: comments24h } = await supabase
      .from('leads')
      .select('node_id!inner(workflow_id!inner(user_id))', { count: 'exact', head: true })
      .eq('node_id.workflow_id.user_id', userId)
      .eq('status', 'commented')
      .gte('commented_at', yesterday);

    // Success rate
    const { count: totalProcessed } = await supabase
      .from('leads')
      .select('node_id!inner(workflow_id!inner(user_id))', { count: 'exact', head: true })
      .eq('node_id.workflow_id.user_id', userId)
      .in('status', ['commented', 'failed']);

    const successRate = totalProcessed > 0 ? Math.round((comments24h / totalProcessed) * 100) : 0;

    // Backlog
    const { count: backlog } = await supabase
      .from('leads')
      .select('node_id!inner(workflow_id!inner(user_id))', { count: 'exact', head: true })
      .eq('node_id.workflow_id.user_id', userId)
      .eq('status', 'extracted');

    res.json({
      success: true,
      data: {
        totalWorkflows: totalWorkflows || 0,
        activeWorkflows: activeWorkflows || 0,
        monitoredGroups: monitoredGroups || 0,
        posts24h: posts24h || 0,
        comments24h: comments24h || 0,
        successRate,
        backlog: backlog || 0
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// GET /api/dashboard/trends
router.get('/trends', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: trends, error } = await supabase
      .from('leads')
      .select(`
        created_at,
        status,
        node_id!inner(workflow_id!inner(user_id))
      `)
      .eq('node_id.workflow_id.user_id', userId)
      .gte('created_at', startDate)
      .order('created_at');

    if (error) throw error;

    // Group by date
    const trendsByDate = trends.reduce((acc, lead) => {
      const date = new Date(lead.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { leads: 0, comments: 0 };
      }
      acc[date].leads++;
      if (lead.status === 'commented') {
        acc[date].comments++;
      }
      return acc;
    }, {});

    res.json({
      success: true,
      data: Object.entries(trendsByDate).map(([date, stats]) => ({
        date,
        ...stats
      }))
    });
  } catch (error) {
    console.error('Error fetching dashboard trends:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// GET /api/dashboard/top-groups
router.get('/top-groups', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 10;

    const { data: topGroups, error } = await supabase
      .from('workflow_nodes')
      .select(`
        group_name,
        group_url,
        workflow_id!inner(user_id),
        leads:leads(count)
      `)
      .eq('workflow_id.user_id', userId)
      .eq('is_active', true)
      .limit(limit);

    if (error) throw error;

    const groupStats = topGroups.map(group => ({
      groupName: group.group_name,
      groupUrl: group.group_url,
      interactions: group.leads?.length || 0
    })).sort((a, b) => b.interactions - a.interactions);

    res.json({
      success: true,
      data: groupStats
    });
  } catch (error) {
    console.error('Error fetching top groups:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

export default router;
