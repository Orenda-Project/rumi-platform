-- Migration 002: textbook_pages table
-- Per-page OCR output from Stage 02 (Gemini Flash VLM or escalation).

CREATE TABLE IF NOT EXISTS textbook_pages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id              text NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  page_number              integer NOT NULL,          -- PDF page index (1-based)
  textbook_page_number     text,                       -- printed page number (can be Urdu numerals)
  printed_numeral_system   text,                       -- urdu_arabic | arabic | tamil | sinhala | mixed
  language_detected        text[],
  script                   text,                       -- nastaliq | naskh | latin | tamil | sinhala | mixed
  text_blocks              jsonb,                      -- [{role, content, confidence}, ...]
  illustrations            jsonb,                      -- [{description, pedagogical_role, object_count, bbox}]
  exercises                jsonb,                      -- [{type, description}]
  honorifics_detected      text[],
  special_features         text[],
  ocr_confidence_overall   numeric,
  ocr_model                text,                       -- gemini-2.5-flash | qari-v0.2 | gemini-2.5-pro
  fallback_trail           jsonb,                      -- models tried + reasons
  tokens_in                integer,
  tokens_out               integer,
  tokens_thinking          integer,
  cost_usd                 numeric,
  ingested_at              timestamptz NOT NULL DEFAULT now(),
  pipeline_run_id          uuid,
  UNIQUE (textbook_id, page_number)
);

CREATE INDEX IF NOT EXISTS textbook_pages_textbook_idx ON textbook_pages (textbook_id);
CREATE INDEX IF NOT EXISTS textbook_pages_confidence_idx ON textbook_pages (ocr_confidence_overall);

COMMENT ON TABLE textbook_pages IS 'Per-page structured OCR output. One row per PDF page.';
