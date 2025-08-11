
-- Dashboard trend for 30 days
CREATE OR REPLACE FUNCTION dashboard_trend_30d(uid UUID)
RETURNS TABLE(day TEXT, posts BIGINT, comments BIGINT) AS $$
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', now() - interval '29 days'), 
      date_trunc('day', now()), 
      interval '1 day'
    )::date AS d
  )
  SELECT 
    to_char(d, 'DD/MM') AS day,
    COALESCE(COUNT(l.*), 0) AS posts,
    COALESCE(COUNT(l.*) FILTER (WHERE l.status = 'posted'), 0) AS comments
  FROM days d
  LEFT JOIN leads l ON date_trunc('day', l.created_at)::date = d
  LEFT JOIN workflow_nodes n ON n.id = l.node_id
  LEFT JOIN workflows w ON w.id = n.workflow_id AND w.user_id = uid
  GROUP BY d 
  ORDER BY d;
END;
$$ LANGUAGE plpgsql;

-- Dashboard errors for 24h
CREATE OR REPLACE FUNCTION dashboard_errors_24h(uid UUID)
RETURNS TABLE(reason TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(l.failure_reason, 'unknown') AS reason,
    COUNT(*) AS count
  FROM leads l 
  JOIN workflow_nodes n ON n.id = l.node_id 
  JOIN workflows w ON w.id = n.workflow_id 
  WHERE w.user_id = uid 
    AND l.status = 'failed' 
    AND l.created_at >= now() - interval '24 hours'
  GROUP BY l.failure_reason 
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Dashboard top nodes for 24h
CREATE OR REPLACE FUNCTION dashboard_nodes_top_24h(uid UUID)
RETURNS TABLE(id TEXT, node TEXT, posts BIGINT, comments BIGINT, success_rate NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.id::TEXT,
    COALESCE(n.group_name, n.group_url) AS node,
    COUNT(*) AS posts,
    COUNT(*) FILTER (WHERE l.status = 'posted') AS comments,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.status = 'posted') / GREATEST(COUNT(*), 1), 1) AS success_rate
  FROM leads l 
  JOIN workflow_nodes n ON n.id = l.node_id 
  JOIN workflows w ON w.id = n.workflow_id 
  WHERE w.user_id = uid 
    AND l.created_at >= now() - interval '24 hours'
  GROUP BY n.id, n.group_name, n.group_url
  ORDER BY comments DESC 
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Dashboard economy for 30d
CREATE OR REPLACE FUNCTION dashboard_economy_30d(uid UUID)
RETURNS TABLE(cost_total_30d NUMERIC, cost_per_comment NUMERIC, tokens_30d BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(l.ai_cost_usd), 0) AS cost_total_30d,
    ROUND(
      COALESCE(SUM(l.ai_cost_usd), 0) / GREATEST(SUM((l.status='posted')::INT), 1), 
      4
    ) AS cost_per_comment,
    COALESCE(SUM(l.ai_tokens_prompt + l.ai_tokens_completion), 0) AS tokens_30d
  FROM leads l 
  JOIN workflow_nodes n ON n.id = l.node_id 
  JOIN workflows w ON w.id = n.workflow_id 
  WHERE w.user_id = uid 
    AND l.created_at >= now() - interval '30 days';
END;
$$ LANGUAGE plpgsql;
