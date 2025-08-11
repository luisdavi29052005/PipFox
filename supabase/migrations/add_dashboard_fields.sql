
-- Add dashboard tracking fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS processing_ms INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_tokens_prompt INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_tokens_completion INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_cost_usd NUMERIC(8,4);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS commented_at TIMESTAMPTZ;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS health TEXT DEFAULT 'ok';

ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Update leads status to be more granular
-- existing: 'captured' | 'processed' | 'commented' | 'failed'
-- new: 'extracted' | 'queued' | 'generated' | 'posted' | 'skipped' | 'failed'
