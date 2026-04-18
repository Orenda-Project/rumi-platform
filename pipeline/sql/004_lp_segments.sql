-- Migration 004: lp_segments table
-- Lesson-plan-sized content segments. Stage 05 output.

CREATE TABLE IF NOT EXISTS lp_segments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id                 text NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_id                  uuid REFERENCES textbook_toc(id) ON DELETE CASCADE,
  segment_index               integer NOT NULL,
  topic                       text NOT NULL,
  topic_urdu                  text,
  skill_type                  text NOT NULL,               -- per provincial taxonomy
  cpa_phase                   text,                         -- maths only: concrete | pictorial_abstract | abstract
  page_start                  integer NOT NULL,
  page_end                    integer NOT NULL,
  numeral_system              text,                         -- urdu_arabic | arabic | mixed
  estimated_duration_min      integer DEFAULT 30,
  target_slide_count          integer DEFAULT 6,
  slo_codes                   text[],
  is_revision                 boolean DEFAULT false,
  revision_source_segments    uuid[],
  enriched_content            jsonb,                        -- Stage 06 output
  enrichment_confidence       numeric,
  enrichment_model            text,                         -- sonnet-4.6 | opus-4.7 | ...
  voice_script                text,                         -- Stage 10 output
  voice_r2_key                text,                         -- Stage 11 output
  slides_r2_prefix            text,                         -- Stage 08 output — directory
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (textbook_id, segment_index),
  CHECK (page_end >= page_start)
);

CREATE INDEX IF NOT EXISTS lp_segments_textbook_idx ON lp_segments (textbook_id);
CREATE INDEX IF NOT EXISTS lp_segments_chapter_idx ON lp_segments (chapter_id);
CREATE INDEX IF NOT EXISTS lp_segments_skill_type_idx ON lp_segments (skill_type);

COMMENT ON TABLE lp_segments IS 'Chunked LP-sized segments per chapter. Hub for Stages 05–12.';
