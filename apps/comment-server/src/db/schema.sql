CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id TEXT NOT NULL,
  component_id TEXT NOT NULL,

  surface_type TEXT NOT NULL,
  surface_id TEXT,

  environment TEXT NOT NULL,

  message TEXT NOT NULL,
  author_name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'open',

  resolved_at TIMESTAMP NULL,
  resolved_by TEXT NULL,
  delete_after TIMESTAMP NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT comments_status_check CHECK (status IN ('open', 'resolved'))
);

CREATE TABLE IF NOT EXISTS comment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  comment_id UUID NOT NULL,

  project_id TEXT NOT NULL,
  component_id TEXT NOT NULL,

  event_type TEXT NOT NULL,

  payload JSONB NOT NULL,

  actor_name TEXT NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_project_component_status_idx
  ON comments (project_id, component_id, status, created_at);

CREATE INDEX IF NOT EXISTS comments_delete_after_idx
  ON comments (delete_after)
  WHERE status = 'resolved';

CREATE INDEX IF NOT EXISTS comment_events_project_component_created_idx
  ON comment_events (project_id, component_id, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comments_set_updated_at ON comments;

CREATE TRIGGER comments_set_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
