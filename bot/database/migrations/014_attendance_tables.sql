-- Migration: Add Attendance Feature
-- Version: v2.10.0
-- Date: January 24, 2026
-- Description: Add voice-based attendance tracking with Excel generation for Pakistani teachers
-- Bead: bd-049

-- =============================================================================
-- STEP 1: CREATE STUDENT_LISTS TABLE (Class Rosters)
-- =============================================================================

CREATE TABLE student_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Class Information
  class_name VARCHAR(100) NOT NULL,     -- "Grade 4B", "Class 5-A"
  section VARCHAR(20),                   -- "A", "B", "C", or NULL
  academic_year VARCHAR(10) NOT NULL,    -- "2025-2026"
  attendance_frequency VARCHAR(10) DEFAULT 'once' CHECK (attendance_frequency IN ('once', 'twice')),

  -- Denormalized for quick display
  student_count INTEGER DEFAULT 0,

  -- Soft delete support
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate class names for same user in same year
CREATE UNIQUE INDEX idx_student_lists_unique_class
  ON student_lists(user_id, LOWER(class_name), academic_year)
  WHERE is_active = TRUE;

-- =============================================================================
-- STEP 2: CREATE STUDENTS TABLE (Individual Students)
-- =============================================================================

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID REFERENCES student_lists(id) ON DELETE CASCADE,

  -- Student Information
  roll_number INTEGER,
  student_name VARCHAR(200) NOT NULL,
  father_name VARCHAR(200),
  student_name_urdu TEXT,        -- Original Urdu spelling
  father_name_urdu TEXT,

  -- Soft delete (students leave mid-year)
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- STEP 3: CREATE ATTENDANCE_SESSIONS TABLE (Daily Records)
-- =============================================================================

CREATE TABLE attendance_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  list_id UUID REFERENCES student_lists(id) ON DELETE SET NULL,

  -- Session Information
  session_date DATE NOT NULL,
  session_type VARCHAR(20) DEFAULT 'full_day' CHECK (session_type IN ('morning', 'afternoon', 'full_day')),

  -- Voice Processing
  audio_url TEXT,                           -- R2: attendance_audio/{userId}/{sessionId}.{ext}
  transcript TEXT,                          -- Raw transcription from Soniox
  transcript_confidence DECIMAL(3,2),       -- 0.00-1.00 overall confidence

  -- Excel Output
  excel_url TEXT,                           -- R2: attendance_excel/{userId}/{sessionId}.xlsx

  -- Summary Statistics
  total_students INTEGER,
  present_count INTEGER,
  absent_count INTEGER,

  -- Edit Tracking
  was_manually_edited BOOLEAN DEFAULT FALSE,
  marking_method VARCHAR(20) CHECK (marking_method IN ('voice', 'tap', 'everyone_present')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One session per class per day per session_type (AM/PM or full)
CREATE UNIQUE INDEX idx_attendance_sessions_unique
  ON attendance_sessions(list_id, session_date, session_type);

-- =============================================================================
-- STEP 4: CREATE ATTENDANCE_RECORDS TABLE (Per-Student Records)
-- =============================================================================

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,

  -- Fallback if student not in list (new students)
  student_name VARCHAR(200),

  -- Attendance Status
  status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),

  -- Detection Confidence
  confidence DECIMAL(3,2) DEFAULT 1.00,     -- 0.00-1.00 how sure we are
  detected_response TEXT,                    -- What the student said ("پریزنٹ", "yes", etc.)

  -- Edit Tracking
  was_manually_changed BOOLEAN DEFAULT FALSE,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- STEP 5: CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Student Lists
CREATE INDEX idx_student_lists_user ON student_lists(user_id);
CREATE INDEX idx_student_lists_active ON student_lists(user_id, is_active) WHERE is_active = TRUE;

-- Students
CREATE INDEX idx_students_list ON students(list_id) WHERE is_active = TRUE;
CREATE INDEX idx_students_list_roll ON students(list_id, roll_number) WHERE is_active = TRUE;

-- Attendance Sessions
CREATE INDEX idx_attendance_sessions_user ON attendance_sessions(user_id);
CREATE INDEX idx_attendance_sessions_date ON attendance_sessions(session_date DESC);
CREATE INDEX idx_attendance_sessions_list_date ON attendance_sessions(list_id, session_date DESC);
CREATE INDEX idx_attendance_sessions_user_date ON attendance_sessions(user_id, session_date DESC);

-- Attendance Records
CREATE INDEX idx_attendance_records_session ON attendance_records(session_id);
CREATE INDEX idx_attendance_records_student ON attendance_records(student_id);

-- =============================================================================
-- STEP 6: ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE student_lists IS 'Class rosters for attendance tracking. Supports multiple classes per teacher.';
COMMENT ON TABLE students IS 'Individual students in a class roster. Soft delete preserves historical data.';
COMMENT ON TABLE attendance_sessions IS 'Daily attendance sessions with voice transcript and Excel output.';
COMMENT ON TABLE attendance_records IS 'Per-student attendance status with detection confidence.';

COMMENT ON COLUMN student_lists.attendance_frequency IS 'once = single daily attendance, twice = morning & afternoon';
COMMENT ON COLUMN student_lists.is_active IS 'Soft delete - FALSE hides class but preserves history';
COMMENT ON COLUMN students.student_name_urdu IS 'Original Urdu script for display, English transliteration in student_name';
COMMENT ON COLUMN attendance_sessions.session_type IS 'full_day (default), morning, or afternoon for schools with twice-daily attendance';
COMMENT ON COLUMN attendance_sessions.marking_method IS 'voice = Soniox transcription, tap = WhatsApp UI selection, everyone_present = fast path';
COMMENT ON COLUMN attendance_records.confidence IS 'ASR confidence for voice detection, 1.00 for manual marking';
COMMENT ON COLUMN attendance_records.detected_response IS 'Original audio response for debugging (پریزنٹ, yes, absent, etc.)';

-- =============================================================================
-- STEP 7: CREATE TRIGGERS FOR AUTO-UPDATE
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_student_lists_updated_at
BEFORE UPDATE ON student_lists
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update student_count on student changes
CREATE OR REPLACE FUNCTION update_student_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE student_lists
    SET student_count = (
      SELECT COUNT(*) FROM students
      WHERE list_id = NEW.list_id AND is_active = TRUE
    )
    WHERE id = NEW.list_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE student_lists
    SET student_count = (
      SELECT COUNT(*) FROM students
      WHERE list_id = OLD.list_id AND is_active = TRUE
    )
    WHERE id = OLD.list_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_student_count
AFTER INSERT OR UPDATE OR DELETE ON students
FOR EACH ROW EXECUTE FUNCTION update_student_count();

-- =============================================================================
-- STEP 8: ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE student_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (bot uses service_role key)
CREATE POLICY "Service role full access on student_lists" ON student_lists
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on students" ON students
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on attendance_sessions" ON attendance_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on attendance_records" ON attendance_records
  FOR ALL USING (auth.role() = 'service_role');

-- Users can view their own data (for portal)
CREATE POLICY "Users can view own student_lists" ON student_lists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own students" ON students
  FOR SELECT USING (
    list_id IN (SELECT id FROM student_lists WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can view own attendance_sessions" ON attendance_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own attendance_records" ON attendance_records
  FOR SELECT USING (
    session_id IN (SELECT id FROM attendance_sessions WHERE user_id = auth.uid())
  );

-- =============================================================================
-- STEP 9: HELPER FUNCTIONS
-- =============================================================================

-- Calculate attendance percentage for a session
CREATE OR REPLACE FUNCTION calculate_attendance_percentage(
  p_present_count INTEGER,
  p_total_students INTEGER
)
RETURNS DECIMAL(5,2) AS $$
BEGIN
  IF p_total_students <= 0 THEN
    RETURN 0;
  END IF;
  RETURN ROUND((p_present_count::DECIMAL / p_total_students * 100), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get attendance summary for a class over a date range
CREATE OR REPLACE FUNCTION get_attendance_summary(
  p_list_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_sessions INTEGER,
  avg_attendance_percentage DECIMAL(5,2),
  total_present INTEGER,
  total_absent INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_sessions,
    ROUND(AVG(
      CASE WHEN total_students > 0
        THEN (present_count::DECIMAL / total_students * 100)
        ELSE 0
      END
    ), 2) as avg_attendance_percentage,
    SUM(present_count)::INTEGER as total_present,
    SUM(absent_count)::INTEGER as total_absent
  FROM attendance_sessions
  WHERE list_id = p_list_id
    AND session_date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_attendance_percentage IS 'Calculate attendance percentage from present count and total students';
COMMENT ON FUNCTION get_attendance_summary IS 'Get attendance summary for a class over a date range';

-- =============================================================================
-- STEP 10: UPDATE SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('v2.10.0', 'Add Attendance feature with voice-based roll call and Excel generation');

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================

-- This migration adds:
-- 1. student_lists table for class rosters (supports multiple classes per teacher)
-- 2. students table with soft delete (students leave mid-year)
-- 3. attendance_sessions for daily attendance with voice/tap/everyone_present methods
-- 4. attendance_records for per-student status with ASR confidence tracking
-- 5. Helper functions for attendance percentage and summary calculations
-- 6. Full RLS support for service role and user portal access

-- Key Features:
-- - Multiple classes per teacher with unique constraint
-- - AM/PM attendance for schools with twice-daily attendance
-- - Three marking methods: voice (Soniox), tap (WhatsApp UI), everyone_present (fast path)
-- - ASR confidence tracking for voice detection
-- - Soft delete pattern preserves historical data
-- - Automatic student_count updates via trigger
-- - Pakistani register format compatibility (Excel output)

-- Processing Architecture:
-- - Redis state machine for conversation flow
-- - Soniox V3 with speaker diarization for voice processing
-- - GPT-4o-mini for name extraction and normalization
-- - ExcelJS for Pakistani register format Excel generation
-- - R2 storage for audio and Excel files

-- =============================================================================
-- TO APPLY THIS MIGRATION
-- =============================================================================

-- 1. Run this SQL in Supabase SQL Editor (staging first!)
-- 2. Verify tables created successfully:
--    SELECT * FROM schema_versions WHERE version = 'v2.10.0';
-- 3. Test helper functions:
--    SELECT calculate_attendance_percentage(20, 25); -- Should return 80.00
-- 4. Deploy attendance service code
-- 5. Monitor attendance health:
--    SELECT COUNT(*) FROM student_lists;
--    SELECT COUNT(*) FROM attendance_sessions;

-- =============================================================================
-- ROLLBACK (if needed - use with caution!)
-- =============================================================================

-- To rollback this migration:
-- DROP FUNCTION IF EXISTS get_attendance_summary(UUID, DATE, DATE);
-- DROP FUNCTION IF EXISTS calculate_attendance_percentage(INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS update_student_count();
-- DROP TABLE IF EXISTS attendance_records CASCADE;
-- DROP TABLE IF EXISTS attendance_sessions CASCADE;
-- DROP TABLE IF EXISTS students CASCADE;
-- DROP TABLE IF EXISTS student_lists CASCADE;
-- DELETE FROM schema_versions WHERE version = 'v2.10.0';
