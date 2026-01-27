-- Add pdf_url column to lesson_plans table
-- Date: 2025-11-14
-- Purpose: Store Gamma-generated PDF URLs for lesson plans and presentations

ALTER TABLE lesson_plans
ADD COLUMN pdf_url TEXT;

-- Add index for faster queries when filtering by PDF availability
CREATE INDEX idx_lesson_plans_pdf_url
ON lesson_plans(pdf_url)
WHERE pdf_url IS NOT NULL;

-- Add column comment for documentation
COMMENT ON COLUMN lesson_plans.pdf_url IS 'Gamma-generated PDF download URL (from Gamma API pdfUrl field)';
