-- migrations/015_exam_checker.sql
-- Exam Checker Feature Tables
-- Created: 2026-01-24
-- Bead: bd-080
-- Note: Uses existing students table from Attendance feature

BEGIN;

-- ==================== EXAM SESSIONS TABLE ====================
-- One session per exam checking request
CREATE TABLE IF NOT EXISTS exam_check_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Session state
    status VARCHAR(50) NOT NULL DEFAULT 'collecting_images'
        CHECK (status IN ('collecting_images', 'processing_ocr', 'confirming_students',
                          'detecting_questions', 'collecting_answers', 'confirming_scheme',
                          'grading', 'delivering_results', 'completed', 'error', 'cancelled')),

    -- Exam metadata
    subject VARCHAR(100),
    class_name VARCHAR(100),
    exam_date DATE DEFAULT CURRENT_DATE,
    board VARCHAR(50) CHECK (board IN ('FBISE', 'Cambridge', 'Punjab_Matric', 'Custom', NULL)),

    -- Image storage (R2 URLs)
    original_images JSONB NOT NULL DEFAULT '[]',  -- [{url, uploadedAt, pageNumber}]

    -- Marking scheme (teacher-provided answers)
    marking_scheme JSONB,  -- {questions: [{id, type, answer, marks, rubric}], totalMarks}

    -- Detected data from OCR
    detected_students TEXT[],  -- Names extracted from exams
    confirmed_students TEXT[], -- Teacher-confirmed names
    detected_questions JSONB,  -- [{id, type, text, position}]

    -- Processing state
    ocr_provider VARCHAR(20) CHECK (ocr_provider IN ('mistral', 'chandra', NULL)),
    ocr_confidence DECIMAL(3,2),
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session lookup by user
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON exam_check_sessions(user_id, created_at DESC);
-- Active sessions
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_check_sessions(status) WHERE status NOT IN ('completed', 'cancelled', 'error');

-- ==================== EXAM SUBMISSIONS TABLE ====================
-- One row per student exam in a session
CREATE TABLE IF NOT EXISTS exam_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES exam_check_sessions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id),  -- Links to existing students table (NULL if ad-hoc)

    -- Student info (denormalized for ad-hoc students)
    student_name VARCHAR(255) NOT NULL,

    -- Images for this student's exam
    image_urls TEXT[] NOT NULL,
    page_numbers INTEGER[],

    -- OCR extracted text
    extracted_text TEXT,
    extracted_answers JSONB,  -- {q1: "answer", q2: "answer", ...}

    -- Position mapping (for annotations)
    answer_positions JSONB,  -- {q1: {bbox: [x1,y1,x2,y2], page: 0}, ...}

    -- Annotated output
    annotated_image_urls TEXT[],
    thumbnail_urls TEXT[],

    -- Processing
    status VARCHAR(30) DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'graded', 'delivered', 'error')),
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_submissions_session ON exam_submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student ON exam_submissions(student_id) WHERE student_id IS NOT NULL;

-- ==================== EXAM GRADES TABLE ====================
-- Individual question grades for each submission
CREATE TABLE IF NOT EXISTS exam_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES exam_submissions(id) ON DELETE CASCADE,

    -- Question reference
    question_id VARCHAR(50) NOT NULL,  -- Q1, Q2a, etc.
    question_type VARCHAR(30) NOT NULL
        CHECK (question_type IN ('mcq', 'short', 'long', 'fill_blank', 'true_false')),

    -- Grading
    max_marks DECIMAL(5,2) NOT NULL,
    awarded_marks DECIMAL(5,2) NOT NULL,
    is_correct BOOLEAN,
    is_partial BOOLEAN DEFAULT FALSE,

    -- AI reasoning
    grading_rationale TEXT,  -- "Method correct (+2), calculation error (-1)"
    confidence DECIMAL(3,2),

    -- Feedback (Feed Up/Back/Forward)
    feedback_up TEXT,      -- Learning objective
    feedback_back TEXT,    -- What happened
    feedback_forward TEXT, -- Next steps

    -- Position for annotation
    answer_bbox JSONB,  -- {x1, y1, x2, y2, page}

    -- Audit trail
    original_marks DECIMAL(5,2),  -- Before any edits
    edited_by UUID REFERENCES users(id),
    edited_at TIMESTAMPTZ,
    edit_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_grades_submission ON exam_grades(submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_grades_unique ON exam_grades(submission_id, question_id);

-- ==================== GRADE AUDIT LOG ====================
-- Track all grade changes for accountability
CREATE TABLE IF NOT EXISTS grade_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id UUID NOT NULL REFERENCES exam_grades(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    old_value DECIMAL(5,2) NOT NULL,
    new_value DECIMAL(5,2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grade_audit_grade ON grade_audit_log(grade_id);

-- ==================== EXAM TEMPLATES TABLE ====================
-- Reusable marking schemes for returning teachers
CREATE TABLE IF NOT EXISTS exam_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100),
    class_name VARCHAR(100),
    board VARCHAR(50) CHECK (board IN ('FBISE', 'Cambridge', 'Punjab_Matric', 'Custom', NULL)),

    marking_scheme JSONB NOT NULL,
    total_marks DECIMAL(5,2),

    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_templates_user ON exam_templates(user_id, last_used_at DESC);

-- ==================== ROW LEVEL SECURITY ====================
ALTER TABLE exam_check_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS sessions_policy ON exam_check_sessions;
DROP POLICY IF EXISTS submissions_policy ON exam_submissions;
DROP POLICY IF EXISTS grades_policy ON exam_grades;
DROP POLICY IF EXISTS audit_log_policy ON grade_audit_log;
DROP POLICY IF EXISTS templates_policy ON exam_templates;

-- Teachers can only see their own sessions
CREATE POLICY sessions_policy ON exam_check_sessions
    FOR ALL USING (user_id = auth.uid());

-- Submissions belong to session owner
CREATE POLICY submissions_policy ON exam_submissions
    FOR ALL USING (
        session_id IN (SELECT id FROM exam_check_sessions WHERE user_id = auth.uid())
    );

-- Grades belong to submission owner (Optimized - using EXISTS for better performance)
CREATE POLICY grades_policy ON exam_grades
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM exam_submissions es
            JOIN exam_check_sessions ecs ON es.session_id = ecs.id
            WHERE es.id = exam_grades.submission_id
            AND ecs.user_id = auth.uid()
        )
    );

-- Audit log policy
CREATE POLICY audit_log_policy ON grade_audit_log
    FOR ALL USING (user_id = auth.uid());

-- Templates policy
CREATE POLICY templates_policy ON exam_templates
    FOR ALL USING (user_id = auth.uid());

-- ==================== SERVICE ROLE POLICIES ====================
-- Allow service role to bypass RLS for background processing

DROP POLICY IF EXISTS service_sessions_policy ON exam_check_sessions;
DROP POLICY IF EXISTS service_submissions_policy ON exam_submissions;
DROP POLICY IF EXISTS service_grades_policy ON exam_grades;
DROP POLICY IF EXISTS service_templates_policy ON exam_templates;
DROP POLICY IF EXISTS service_audit_log_policy ON grade_audit_log;

CREATE POLICY service_sessions_policy ON exam_check_sessions
    FOR ALL TO service_role USING (true);

CREATE POLICY service_submissions_policy ON exam_submissions
    FOR ALL TO service_role USING (true);

CREATE POLICY service_grades_policy ON exam_grades
    FOR ALL TO service_role USING (true);

CREATE POLICY service_templates_policy ON exam_templates
    FOR ALL TO service_role USING (true);

CREATE POLICY service_audit_log_policy ON grade_audit_log
    FOR ALL TO service_role USING (true);

-- ==================== TRIGGERS ====================
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_exam_checker_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS exam_sessions_updated_at ON exam_check_sessions;
CREATE TRIGGER exam_sessions_updated_at
    BEFORE UPDATE ON exam_check_sessions
    FOR EACH ROW EXECUTE FUNCTION update_exam_checker_updated_at();

DROP TRIGGER IF EXISTS exam_submissions_updated_at ON exam_submissions;
CREATE TRIGGER exam_submissions_updated_at
    BEFORE UPDATE ON exam_submissions
    FOR EACH ROW EXECUTE FUNCTION update_exam_checker_updated_at();

DROP TRIGGER IF EXISTS exam_templates_updated_at ON exam_templates;
CREATE TRIGGER exam_templates_updated_at
    BEFORE UPDATE ON exam_templates
    FOR EACH ROW EXECUTE FUNCTION update_exam_checker_updated_at();

COMMIT;
