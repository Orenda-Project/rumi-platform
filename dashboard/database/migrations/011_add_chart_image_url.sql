-- Migration 011: Add chart_image_url column to ama_messages
-- Stores GPT-4o generated chart image URLs
-- Author: Claude Opus 4.5
-- Date: December 1, 2025

-- Add chart_image_url column to store GPT-4o generated chart images
ALTER TABLE ama_messages
ADD COLUMN IF NOT EXISTS chart_image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN ama_messages.chart_image_url IS 'URL or base64 data URL of GPT-4o generated chart image';
