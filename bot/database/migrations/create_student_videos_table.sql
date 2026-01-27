-- Migration: Create student_videos table for media library
-- Date: 2025-11-07
-- Purpose: Store 975+ educational videos for students with full-text search capability

-- Create student_videos table
CREATE TABLE IF NOT EXISTS student_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade VARCHAR(50) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  topic VARCHAR(200) NOT NULL,
  subtopic VARCHAR(200),
  video_url TEXT NOT NULL,
  original_filename TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_student_videos_grade ON student_videos(grade);
CREATE INDEX IF NOT EXISTS idx_student_videos_subject ON student_videos(subject);
CREATE INDEX IF NOT EXISTS idx_student_videos_topic ON student_videos(topic);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_student_videos_grade_subject ON student_videos(grade, subject);

-- Add full-text search column and index
ALTER TABLE student_videos ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_student_videos_search ON student_videos USING GIN(search_vector);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_student_videos_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.grade, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.topic, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.subtopic, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.notes, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search vector on insert/update
DROP TRIGGER IF EXISTS trigger_update_student_videos_search_vector ON student_videos;
CREATE TRIGGER trigger_update_student_videos_search_vector
  BEFORE INSERT OR UPDATE ON student_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_student_videos_search_vector();

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_student_videos_updated_at ON student_videos;
CREATE TRIGGER trigger_update_student_videos_updated_at
  BEFORE UPDATE ON student_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE student_videos IS 'Educational videos for students from Taleemabad library';
COMMENT ON COLUMN student_videos.grade IS 'Grade level (e.g., NURSERY, Grade 1, Grade 2, etc.)';
COMMENT ON COLUMN student_videos.subject IS 'Subject area (e.g., English, Maths, Science)';
COMMENT ON COLUMN student_videos.topic IS 'Main topic of the video';
COMMENT ON COLUMN student_videos.subtopic IS 'Specific subtopic or lesson';
COMMENT ON COLUMN student_videos.video_url IS 'S3 URL to the video file';
COMMENT ON COLUMN student_videos.search_vector IS 'Full-text search vector for semantic search';
