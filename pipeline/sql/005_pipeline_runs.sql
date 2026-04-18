-- Migration 005: pipeline_runs table
-- Tracks every pipeline execution for observability + cost audit.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  province                  text NOT NULL,
  scope                     text,                          -- scope_x | scope_y | ...
  started_at                timestamptz NOT NULL DEFAULT now(),
  completed_at              timestamptz,
  status                    text NOT NULL DEFAULT 'running',  -- running | complete | failed | needs_human_review
  stage_progression         jsonb,                         -- {"01": "complete", "02": "running", ...}
  total_cost_usd            numeric DEFAULT 0,
  model_spend_breakdown     jsonb,                         -- per-model cost + token count
  eval_summary              jsonb,                         -- per-stage pass/fail
  human_review_count        integer DEFAULT 0,
  ocr_quality_flags         integer DEFAULT 0,
  failed_regens             integer DEFAULT 0,
  book_count                integer,
  page_count                integer,
  segment_count             integer,
  slide_count               integer,
  notes                     text
);

CREATE INDEX IF NOT EXISTS pipeline_runs_province_idx ON pipeline_runs (province);
CREATE INDEX IF NOT EXISTS pipeline_runs_status_idx ON pipeline_runs (status);

-- Per-stage event log (for fine-grained audit)
CREATE TABLE IF NOT EXISTS pipeline_stage_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage             text NOT NULL,
  event             text NOT NULL,         -- started | progress | eval_pass | eval_fail | retry | complete | escalated
  detail            jsonb,
  cost_usd          numeric,
  emitted_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_stage_events_run_idx ON pipeline_stage_events (run_id);
CREATE INDEX IF NOT EXISTS pipeline_stage_events_stage_idx ON pipeline_stage_events (stage);

COMMENT ON TABLE pipeline_runs IS 'One row per pipeline execution. The audit trail that makes this a machine.';
COMMENT ON TABLE pipeline_stage_events IS 'Fine-grained stage event log for observability.';
