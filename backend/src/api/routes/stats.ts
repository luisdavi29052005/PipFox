
import { Router } from 'express';
import { supabase } from '../../services/supabaseClient';
import { requireAuth } from '../../middleware/requireAuth';

const router = Router();

interface DashboardStats {
  totals: {
    workflows_active: number;
    groups_monitored: number;
    keywords_configured: number;
    posts_24h: number;
    comments_24h: number;
    success_rate_24h: number;
    backlog: number;
  };
  trend_30d: Array<{
    day: string;
    posts: number;
    comments: number;
  }>;
  errors_24h: Array<{
    reason: string;
    count: number;
  }>;
  nodes_top_24h: Array<{
    id: string;
    node: string;
    posts: number;
    comments: number;
    success_rate: number;
  }>;
  accounts_health: Array<{
    id: string;
    name: string;
    status: string;
    health: string;
    last_seen_at: string;
    errors_24h: number;
  }>;
  economy: {
    cost_total_30d: number;
    cost_per_comment: number;
    tokens_30d: number;
  };
}

// Cache for 60 seconds
const cache = new Map<string, { data: DashboardStats; timestamp: number }>();
const CACHE_DURATION = 60 * 1000; // 60 seconds

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = `stats:${userId}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    // Get totals
    const { data: workflowsActive } = await supabase
      .from('workflows')
      .select('count', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'running');

    const { data: groupsMonitored } = await supabase
      .from('workflow_nodes')
      .select('workflows!inner(user_id)', { count: 'exact', head: true })
      .eq('workflows.user_id', userId)
      .eq('is_active', true);

    const { data: keywordsResult } = await supabase
      .from('workflow_nodes')
      .select('keywords, workflows!inner(user_id)')
      .eq('workflows.user_id', userId);

    const keywordsConfigured = keywordsResult?.reduce((sum, node) => 
      sum + (node.keywords?.length || 0), 0) || 0;

    const { data: posts24h } = await supabase
      .from('leads')
      .select('workflow_nodes!inner(workflows!inner(user_id))', { count: 'exact', head: true })
      .eq('workflow_nodes.workflows.user_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { data: comments24h } = await supabase
      .from('leads')
      .select('workflow_nodes!inner(workflows!inner(user_id))', { count: 'exact', head: true })
      .eq('workflow_nodes.workflows.user_id', userId)
      .eq('status', 'posted')
      .gte('commented_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { data: allLeads24h } = await supabase
      .from('leads')
      .select('status, workflow_nodes!inner(workflows!inner(user_id))')
      .eq('workflow_nodes.workflows.user_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const successRate24h = allLeads24h?.length ? 
      Math.round(100 * allLeads24h.filter(l => l.status === 'posted').length / allLeads24h.length) : 0;

    const { data: backlog } = await supabase
      .from('leads')
      .select('workflow_nodes!inner(workflows!inner(user_id))', { count: 'exact', head: true })
      .eq('workflow_nodes.workflows.user_id', userId)
      .in('status', ['extracted', 'queued', 'generated']);

    // Get trend data for 30 days
    const { data: trendData } = await supabase.rpc('dashboard_trend_30d', { uid: userId });

    // Get errors for 24h
    const { data: errorsData } = await supabase.rpc('dashboard_errors_24h', { uid: userId });

    // Get top nodes for 24h
    const { data: topNodes } = await supabase.rpc('dashboard_nodes_top_24h', { uid: userId });

    // Get accounts health
    const { data: accountsHealth } = await supabase
      .from('accounts')
      .select('id, name, status, health, last_seen_at')
      .eq('user_id', userId);

    // Get economy data
    const { data: economyData } = await supabase.rpc('dashboard_economy_30d', { uid: userId });

    const stats: DashboardStats = {
      totals: {
        workflows_active: workflowsActive?.length || 0,
        groups_monitored: groupsMonitored?.length || 0,
        keywords_configured: keywordsConfigured,
        posts_24h: posts24h?.length || 0,
        comments_24h: comments24h?.length || 0,
        success_rate_24h: successRate24h,
        backlog: backlog?.length || 0,
      },
      trend_30d: trendData || [],
      errors_24h: errorsData || [],
      nodes_top_24h: topNodes || [],
      accounts_health: accountsHealth?.map(acc => ({
        ...acc,
        errors_24h: 0 // TODO: implement error counting
      })) || [],
      economy: economyData?.[0] || {
        cost_total_30d: 0,
        cost_per_comment: 0,
        tokens_30d: 0
      }
    };

    cache.set(cacheKey, { data: stats, timestamp: Date.now() });
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Mock endpoint for development
router.get('/stats/mock', requireAuth, async (req, res) => {
  const mockStats: DashboardStats = {
    totals: {
      workflows_active: 3,
      groups_monitored: 12,
      keywords_configured: 24,
      posts_24h: 480,
      comments_24h: 360,
      success_rate_24h: 75,
      backlog: 45,
    },
    trend_30d: Array.from({ length: 30 }, (_, i) => ({
      day: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      posts: Math.floor(Math.random() * 50) + 400,
      comments: Math.floor(Math.random() * 40) + 300,
    })),
    errors_24h: [
      { reason: 'captcha', count: 12 },
      { reason: 'checkpoint', count: 8 },
      { reason: 'rate_limit', count: 5 },
      { reason: 'permission', count: 3 },
    ],
    nodes_top_24h: [
      { id: '1', node: 'Grupo Marketing Digital', posts: 45, comments: 38, success_rate: 84.4 },
      { id: '2', node: 'Empreendedorismo Brasil', posts: 32, comments: 28, success_rate: 87.5 },
      { id: '3', node: 'Vendas Online', posts: 28, comments: 20, success_rate: 71.4 },
    ],
    accounts_health: [
      { id: '1', name: 'Conta Principal', status: 'ready', health: 'ok', last_seen_at: new Date().toISOString(), errors_24h: 0 },
      { id: '2', name: 'Conta Backup', status: 'ready', health: 'checkpoint', last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), errors_24h: 2 },
    ],
    economy: {
      cost_total_30d: 45.67,
      cost_per_comment: 0.127,
      tokens_30d: 125430,
    }
  };

  res.json(mockStats);
});

export default router;
