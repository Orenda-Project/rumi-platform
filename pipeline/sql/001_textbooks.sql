-- Migration 001: textbooks table
-- Creates the top-level registry of PDFs ingested into the pipeline.

CREATE TABLE IF NOT EXISTS textbooks (
  id                    text PRIMARY KEY,
  province              text NOT NULL,
  country               text NOT NULL,
  curriculum            text,
  subject               text NOT NULL,
  grade                 smallint NOT NULL,
  medium                text,
  title                 text,
  source                text NOT NULL DEFAULT 'local',    -- 'local' | 'stbb' | 'pctb' | ...
  source_url            text,
  pdf_r2_key            text,
  pdf_local_path        text,
  sha256                text,
  total_pages           integer,
  pdf_page_offset       integer DEFAULT 0,
  license_note          text,
  registered_at         timestamptz NOT NULL DEFAULT now(),
  pipeline_run_id       uuid,
  ingestion_status      text DEFAULT 'pending',           -- pending | ingesting | complete | failed
  ingestion_confidence  numeric                           -- mean OCR confidence across pages
);

CREATE INDEX IF NOT EXISTS textbooks_province_idx ON textbooks (province);
CREATE INDEX IF NOT EXISTS textbooks_subject_grade_idx ON textbooks (subject, grade);

COMMENT ON TABLE textbooks IS 'Pipeline-registered textbooks. One row per PDF (unique by id).';
