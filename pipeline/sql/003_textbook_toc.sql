-- Migration 003: textbook_toc table
-- Chapter-level table of contents per textbook, populated by Stage 03.

CREATE TABLE IF NOT EXISTS textbook_toc (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id         text NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_number      integer NOT NULL,
  title               text NOT NULL,
  title_urdu          text,
  page_start          integer NOT NULL,
  page_end            integer NOT NULL,
  learning_outcomes   text,
  slo_codes           text[],                        -- populated by Stage 04
  primary_skill_type  text,
  notes               jsonb,
  audited_at          timestamptz,
  UNIQUE (textbook_id, chapter_number),
  CHECK (page_end >= page_start)
);

CREATE INDEX IF NOT EXISTS textbook_toc_textbook_idx ON textbook_toc (textbook_id);

COMMENT ON TABLE textbook_toc IS 'Chapter ToC per textbook. Populated by Stage 03 (Gemini Flash) + audited.';
