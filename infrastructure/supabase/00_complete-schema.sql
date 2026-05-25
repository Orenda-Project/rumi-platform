-- =============================================================================
-- Rumi Platform - Complete Database Schema
-- Version: 2.0.0
-- Generated from production on 2026-02-17
-- Tables: 60 | Functions: 38 | Triggers: 27 | Indexes: 186+
-- =============================================================================
--
-- This file creates the complete Rumi Platform database schema.
-- It is safe to run on an empty database (uses IF NOT EXISTS / OR REPLACE).
--
-- Sections:
--   1. Extensions
--   2. Tables (organized by domain)
--   3. Unique Constraints
--   4. Foreign Key Constraints
--   5. Functions
--   6. Triggers
--   7. Indexes
--   8. PostgREST Reload
-- =============================================================================

-- =============================================================================
-- SECTION 1: Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA public;


-- =============================================================================
-- SECTION 2: Tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Core User Management
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) NOT NULL,
    name VARCHAR(100),
    grades_taught VARCHAR(100),
    registration_completed BOOLEAN DEFAULT false,
    registration_started_at TIMESTAMP,
    registration_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    school_name VARCHAR(200),
    subjects_taught JSONB DEFAULT '[]',
    source VARCHAR(50) DEFAULT 'direct',
    session_id VARCHAR(255),
    first_message_at TIMESTAMP,
    registered_at TIMESTAMP,
    registration_state TEXT DEFAULT 'unregistered',
    registration_state_updated_at TIMESTAMPTZ,
    preferred_language VARCHAR(10) DEFAULT 'en',
    portal_password_hash TEXT,
    portal_invite_token TEXT,
    portal_invite_expires_at TIMESTAMPTZ,
    portal_activated BOOLEAN DEFAULT false,
    portal_last_login TIMESTAMPTZ,
    password_reset_code VARCHAR(6),
    password_reset_expires_at TIMESTAMPTZ,
    language_locked BOOLEAN DEFAULT false,
    is_test_user BOOLEAN DEFAULT false,
    language_nudge_sent BOOLEAN DEFAULT false,
    registration_pending_name BOOLEAN DEFAULT false,
    country VARCHAR(100),
    region VARCHAR(100),
    organization VARCHAR(200),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS dashboard_users (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    invited_by UUID,
    invite_token VARCHAR(255),
    invite_expires_at TIMESTAMPTZ,
    password_reset_token VARCHAR(255),
    password_reset_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    byof_role VARCHAR(20),
    organization_id UUID,
    invited_for_organization VARCHAR(255),
    access_scope_summary TEXT,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS portal_organizations (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    default_scope_type VARCHAR(20),
    default_scope_value JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    is_active BOOLEAN DEFAULT true,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS access_scopes (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    dashboard_user_id UUID NOT NULL,
    scope_type VARCHAR(20) NOT NULL,
    scope_value JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS feature_permissions (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    role VARCHAR(20) NOT NULL,
    feature_key VARCHAR(50) NOT NULL,
    can_access BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS invitations (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    scope_config JSONB NOT NULL,
    token VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    invited_by UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    created_user_id UUID,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    last_sent_at TIMESTAMPTZ,
    send_count INTEGER DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS user_feature_first_use (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID,
    feature TEXT NOT NULL,
    video_shown_at TIMESTAMPTZ DEFAULT now(),
    feature_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Chat & Conversations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    started_at TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    session_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    turn_count INTEGER DEFAULT 0,
    registration_triggered BOOLEAN DEFAULT false,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT now(),
    session_id UUID,
    input_format VARCHAR(10),
    input_language VARCHAR(10),
    output_format VARCHAR(10),
    output_language VARCHAR(10),
    current_state VARCHAR(50),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS chat_starts (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    phone_number VARCHAR(20) NOT NULL,
    session_id VARCHAR(255),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cta_clicks (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    button_location VARCHAR(100),
    whatsapp_link TEXT,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Coaching & Audio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coaching_sessions (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    session_id UUID,
    audio_url VARCHAR(500),
    audio_duration_seconds INTEGER,
    audio_format VARCHAR(20),
    audio_size_bytes BIGINT,
    transcript_text TEXT,
    transcript_language VARCHAR(10),
    diarization_data JSONB,
    diarization_confidence DOUBLE PRECISION,
    lesson_plan_url VARCHAR(500),
    lesson_plan_text TEXT,
    lesson_plan_format VARCHAR(20),
    has_lesson_plan BOOLEAN DEFAULT false,
    analysis_data JSONB,
    conversation_state JSONB,
    report_pdf_url VARCHAR(500),
    report_generated_at TIMESTAMPTZ,
    voice_debrief_url VARCHAR(500),
    voice_debrief_duration_seconds INTEGER,
    voice_debrief_language VARCHAR(10),
    status VARCHAR(50) DEFAULT 'initiated',
    last_successful_step VARCHAR(50),
    failed_step VARCHAR(50),
    error_message TEXT,
    can_resume BOOLEAN DEFAULT true,
    transcription_cost NUMERIC,
    analysis_cost NUMERIC,
    total_cost NUMERIC,
    gpt5_input_tokens INTEGER,
    gpt5_output_tokens INTEGER,
    gpt5_cached_tokens INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    transcription_started_at TIMESTAMPTZ,
    transcription_completed_at TIMESTAMPTZ,
    analysis_started_at TIMESTAMPTZ,
    analysis_completed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    audio_id VARCHAR(255),
    report_gamma_url VARCHAR(500),
    lesson_plan_r2_key TEXT,
    lesson_plan_excerpt TEXT,
    lesson_plan_structured JSONB,
    lesson_plan_word_count INTEGER,
    lesson_plan_extraction_status VARCHAR(20),
    lesson_plan_extraction_error TEXT,
    reminder_sent_at TIMESTAMPTZ,
    tokens_raw JSONB,
    silence_markers JSONB,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS coaching_jobs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    coaching_session_id UUID NOT NULL,
    job_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ DEFAULT now(),
    worker_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    error_stack TEXT,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS coaching_processing_queue (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    coaching_session_id UUID,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    processing_worker_id TEXT,
    error_message TEXT,
    error_stack TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS coaching_quality_metrics (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    coaching_session_id UUID,
    diarization_confidence DOUBLE PRECISION,
    processing_time_seconds INTEGER,
    transcription_time_seconds INTEGER,
    analysis_time_seconds INTEGER,
    report_generation_time_seconds INTEGER,
    user_satisfaction_rating INTEGER,
    user_feedback TEXT,
    worker_id TEXT,
    retry_count INTEGER DEFAULT 0,
    had_errors BOOLEAN DEFAULT false,
    session_cost NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS audio_sessions (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    audio_url VARCHAR(500),
    audio_duration_seconds INTEGER,
    transcript TEXT,
    analysis_report JSONB,
    voice_summary_url VARCHAR(500),
    pdf_report_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'processing',
    created_at TIMESTAMP DEFAULT now(),
    completed_at TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS teacher_progress (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    dimension VARCHAR(50),
    score DOUBLE PRECISION,
    evidence TEXT,
    session_id UUID,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS teacher_facts (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    fact TEXT NOT NULL,
    category VARCHAR(50),
    confidence DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Lesson Plans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lesson_plans (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    topic VARCHAR(200) NOT NULL,
    grade VARCHAR(20),
    subject VARCHAR(50),
    type VARCHAR(20),
    gamma_url VARCHAR(500),
    content JSONB,
    created_at TIMESTAMP DEFAULT now(),
    pdf_url TEXT,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS lesson_plan_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    topic VARCHAR(500) NOT NULL,
    full_message TEXT,
    language VARCHAR(10) DEFAULT 'en',
    content_type VARCHAR(20) DEFAULT 'lesson_plan',
    status VARCHAR(20) DEFAULT 'pending',
    gamma_generation_id VARCHAR(100),
    gamma_url TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Reading Assessments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reading_assessments (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    session_id UUID,
    student_identifier VARCHAR(100),
    student_number INTEGER,
    concurrent_session_count INTEGER DEFAULT 0,
    redis_session_key VARCHAR(255),
    grade_level INTEGER NOT NULL,
    language VARCHAR(5) NOT NULL,
    passage_type VARCHAR(20) NOT NULL,
    passage_text TEXT NOT NULL,
    passage_image_url TEXT,
    passage_generated_at TIMESTAMPTZ,
    passage_word_count INTEGER,
    audio_url TEXT,
    audio_duration_seconds DOUBLE PRECISION,
    audio_format VARCHAR(20),
    audio_size_bytes BIGINT,
    audio_uploaded_at TIMESTAMPTZ,
    num_speakers_detected INTEGER,
    detected_language VARCHAR(5),
    audio_quality_score DOUBLE PRECISION,
    audio_validation_warnings JSONB,
    transcript_text TEXT,
    transcript_confidence DOUBLE PRECISION,
    word_timestamps JSONB,
    total_words_in_passage INTEGER,
    words_read INTEGER,
    words_correct INTEGER,
    wcpm DOUBLE PRECISION,
    accuracy_percentage DOUBLE PRECISION,
    time_elapsed_seconds DOUBLE PRECISION,
    pronunciation_data JSONB,
    prosody_analysis JSONB,
    errors JSONB,
    self_corrections_count INTEGER DEFAULT 0,
    grade_benchmark_min INTEGER,
    grade_benchmark_max INTEGER,
    percentile_rank VARCHAR(20),
    on_track BOOLEAN,
    is_second_language BOOLEAN DEFAULT true,
    report_pdf_url TEXT,
    report_generated_at TIMESTAMPTZ,
    voice_feedback_url TEXT,
    voice_feedback_duration_seconds INTEGER,
    voice_feedback_language VARCHAR(10),
    diagnostic_summary TEXT,
    comprehension_requested BOOLEAN DEFAULT false,
    comprehension_questions JSONB,
    comprehension_answers JSONB,
    comprehension_analysis JSONB,
    comprehension_score DOUBLE PRECISION,
    status VARCHAR(50) DEFAULT 'pending',
    processing_started_at TIMESTAMPTZ,
    last_successful_step VARCHAR(50),
    failed_step VARCHAR(50),
    error_message TEXT,
    can_resume BOOLEAN DEFAULT true,
    parent_shared BOOLEAN DEFAULT false,
    parent_shared_at TIMESTAMPTZ,
    parent_message_generated TEXT,
    transcription_cost NUMERIC,
    pronunciation_cost NUMERIC,
    analysis_cost NUMERIC,
    report_cost NUMERIC,
    voice_feedback_cost NUMERIC,
    total_cost NUMERIC,
    gpt4_input_tokens INTEGER,
    gpt4_output_tokens INTEGER,
    azure_api_calls INTEGER,
    soniox_duration_seconds DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    pronunciation_accuracy DOUBLE PRECISION,
    passage_title VARCHAR(200),
    assessment_mode VARCHAR(10) DEFAULT 'manual',
    starting_level VARCHAR(20),
    final_level VARCHAR(20),
    level_attempts JSONB DEFAULT '{}',
    auto_level_history JSONB DEFAULT '[]',
    current_level_attempt INTEGER DEFAULT 1,
    max_attempts_per_level INTEGER DEFAULT 2,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS lcpm_benchmarks (
    id INTEGER NOT NULL DEFAULT nextval('lcpm_benchmarks_id_seq'::regclass),
    grade_level INTEGER NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    season VARCHAR(10) NOT NULL,
    percentile_5 INTEGER NOT NULL,
    percentile_10 INTEGER NOT NULL,
    percentile_25 INTEGER NOT NULL,
    percentile_50 INTEGER NOT NULL,
    percentile_75 INTEGER NOT NULL,
    percentile_90 INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS wcpm_percentiles (
    id INTEGER NOT NULL DEFAULT nextval('wcpm_percentiles_id_seq'::regclass),
    grade_level INTEGER NOT NULL,
    language VARCHAR(5) NOT NULL DEFAULT 'en',
    season VARCHAR(10) NOT NULL,
    percentile INTEGER NOT NULL,
    wcpm_threshold INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Student Management
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS student_lists (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    class_name VARCHAR(100) NOT NULL,
    section VARCHAR(20),
    academic_year VARCHAR(10) NOT NULL,
    attendance_frequency VARCHAR(10) DEFAULT 'once',
    student_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS students (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    list_id UUID,
    roll_number INTEGER,
    student_name VARCHAR(200) NOT NULL,
    father_name VARCHAR(200),
    student_name_urdu TEXT,
    father_name_urdu TEXT,
    -- Optional parent/guardian contact (E.164). Used by the quiz subsystem to
    -- deliver quizzes and by the edit-class flow's add/edit-student forms.
    parent_phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS student_videos (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    grade VARCHAR(50) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(200) NOT NULL,
    subtopic VARCHAR(200),
    video_url TEXT NOT NULL,
    original_filename TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    search_vector TSVECTOR,
    PRIMARY KEY (id)
);

-- Post-delivery thumbs-up / thumbs-down micro-survey on Student Video Library
-- deliveries. One row per (user, video) button tap; reason_text is UPDATEd on
-- the same row when the teacher replies to the follow-up within the 10-min window.
CREATE TABLE IF NOT EXISTS student_video_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    video_id UUID REFERENCES student_videos(id) ON DELETE SET NULL,
    useful BOOLEAN NOT NULL,
    reason_text TEXT,
    reason_received_at TIMESTAMPTZ,
    reason_language TEXT,
    reason_polarity TEXT CHECK (reason_polarity IN ('liked', 'disliked', 'unknown')),
    -- Snapshot of the video context so feedback stays queryable if the
    -- student_videos row is later updated.
    grade VARCHAR(50),
    subject VARCHAR(100),
    topic VARCHAR(200),
    subtopic VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_video_feedback_user_time
    ON student_video_feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_video_feedback_useful_time
    ON student_video_feedback (useful, created_at DESC);

-- Pre-rendered homework chapter PDFs (one row per grade × subject × chapter).
-- The homework request flow looks these up and the bundle worker pdf-lib-merges
-- the selected chapters' r2_key files into one document.
CREATE TABLE IF NOT EXISTS homework_chapters (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    grade INTEGER NOT NULL,
    subject VARCHAR(100) NOT NULL,
    chapter_number INTEGER NOT NULL,
    chapter_title VARCHAR(300),
    lang VARCHAR(20) DEFAULT 'en',
    r2_key TEXT NOT NULL,
    version VARCHAR(20) DEFAULT 'v7',
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_homework_chapters_lookup
    ON homework_chapters (grade, subject, version, chapter_number);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attendance_sessions (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    list_id UUID,
    session_date DATE NOT NULL,
    session_type VARCHAR(20) DEFAULT 'full_day',
    audio_url TEXT,
    transcript TEXT,
    transcript_confidence NUMERIC,
    excel_url TEXT,
    total_students INTEGER,
    present_count INTEGER,
    absent_count INTEGER,
    was_manually_edited BOOLEAN DEFAULT false,
    marking_method VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    session_id UUID,
    student_id UUID,
    student_name VARCHAR(200),
    status VARCHAR(20) NOT NULL,
    confidence NUMERIC DEFAULT 1.00,
    detected_response TEXT,
    was_manually_changed BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Exam Checker
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exam_check_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'collecting_images',
    subject VARCHAR(100),
    class_name VARCHAR(100),
    exam_date DATE DEFAULT CURRENT_DATE,
    board VARCHAR(50),
    original_images JSONB NOT NULL DEFAULT '[]',
    marking_scheme JSONB,
    detected_students TEXT[],
    confirmed_students TEXT[],
    detected_questions JSONB,
    ocr_provider VARCHAR(20),
    ocr_confidence NUMERIC,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS exam_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100),
    class_name VARCHAR(100),
    board VARCHAR(50),
    marking_scheme JSONB NOT NULL,
    total_marks NUMERIC,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS exam_submissions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    student_id UUID,
    student_name VARCHAR(255) NOT NULL,
    image_urls TEXT[] NOT NULL,
    page_numbers INTEGER[],
    extracted_text TEXT,
    extracted_answers JSONB,
    answer_positions JSONB,
    annotated_image_urls TEXT[],
    thumbnail_urls TEXT[],
    status VARCHAR(30) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS exam_grades (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL,
    question_id VARCHAR(50) NOT NULL,
    question_type VARCHAR(30) NOT NULL,
    max_marks NUMERIC NOT NULL,
    awarded_marks NUMERIC NOT NULL,
    is_correct BOOLEAN,
    is_partial BOOLEAN DEFAULT false,
    grading_rationale TEXT,
    confidence NUMERIC,
    feedback_up TEXT,
    feedback_back TEXT,
    feedback_forward TEXT,
    answer_bbox JSONB,
    original_marks NUMERIC,
    edited_by UUID,
    edited_at TIMESTAMPTZ,
    edit_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS grade_audit_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    grade_id UUID NOT NULL,
    user_id UUID NOT NULL,
    old_value NUMERIC NOT NULL,
    new_value NUMERIC NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Image Analysis
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS image_analysis_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    image_metadata JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    analysis_result JSONB,
    tokens_used INTEGER,
    correlation_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Video Generation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS video_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_id UUID,
    topic TEXT NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    status VARCHAR(50) DEFAULT 'pending',
    current_step INTEGER DEFAULT 0,
    script_data JSONB,
    slide_urls TEXT[],
    video_segment_urls TEXT[],
    pdf_url TEXT,
    video_url TEXT,
    generation_time_seconds INTEGER,
    estimated_cost NUMERIC,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    customization TEXT,
    style VARCHAR(20) DEFAULT 'infographic',
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS video_tasks (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    video_request_id UUID NOT NULL,
    filename TEXT NOT NULL,
    task_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'polling',
    result_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    ephemeral_url TEXT,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS videos (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    filename VARCHAR(200) NOT NULL,
    url VARCHAR(500) NOT NULL,
    grade VARCHAR(20),
    subject VARCHAR(50),
    topic VARCHAR(100),
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- A/B Testing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    test_name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    test_type TEXT DEFAULT 'bandit',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    winner_variant TEXT,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ab_test_variants (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    test_id UUID,
    variant_name TEXT NOT NULL,
    variant_content JSONB,
    successes INTEGER DEFAULT 1,
    failures INTEGER DEFAULT 1,
    impressions INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ab_test_events (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    test_id UUID,
    variant_name TEXT NOT NULL,
    user_id UUID,
    phone_number TEXT,
    event_type TEXT NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- AMA (Ask Me Anything) Portal
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ama_conversations (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(255) DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    message_count INTEGER DEFAULT 0,
    context_summary TEXT,
    is_archived BOOLEAN DEFAULT false,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ama_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    thinking_content TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    tokens_used INTEGER,
    model_used VARCHAR(50),
    response_time_ms INTEGER,
    sql_query TEXT,
    query_result JSONB,
    chart_type VARCHAR(50),
    chart_data JSONB,
    tracer_user_id UUID,
    tracer_report JSONB,
    chart_image_url TEXT,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ama_query_audit (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    message_id UUID,
    user_id UUID NOT NULL,
    original_question TEXT NOT NULL,
    generated_sql TEXT NOT NULL,
    sql_validated BOOLEAN DEFAULT false,
    validation_errors TEXT[],
    execution_status VARCHAR(20),
    execution_time_ms INTEGER,
    row_count INTEGER,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- BYOF (Build Your Own Feature)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS byof_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL,
    title TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS byof_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS byof_plans (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    affected_files TEXT[] DEFAULT '{}'::text[],
    summary_embedding vector,
    status VARCHAR(20) DEFAULT 'draft',
    pr_url TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    staging_merged_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS byof_approval_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    performed_by UUID NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Broadcasts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS broadcast_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    admin_user_id UUID,
    admin_username TEXT NOT NULL,
    admin_ip_address TEXT,
    admin_user_agent TEXT,
    message_content TEXT NOT NULL,
    filters JSONB NOT NULL,
    template_id TEXT,
    template_name TEXT,
    template_status TEXT,
    template_rejected_reason TEXT,
    template_submitted_at TIMESTAMPTZ,
    total_recipients INTEGER NOT NULL,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    replied_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    errors JSONB,
    error_message TEXT,
    audit_trail JSONB DEFAULT '[]',
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS broadcast_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    broadcast_id UUID,
    user_id UUID,
    phone_number TEXT NOT NULL,
    message_id TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- QA & Testing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS qa_test_runs (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    run_number INTEGER NOT NULL DEFAULT nextval('qa_test_runs_run_number_seq'::regclass),
    trigger_type VARCHAR(50) NOT NULL,
    triggered_by VARCHAR(100),
    scenarios JSONB NOT NULL,
    results JSONB,
    status VARCHAR(20) DEFAULT 'running',
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    evidence JSONB,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS qa_analyst_proposals (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    hypothesis TEXT,
    proposed_changes JSONB,
    expected_impact TEXT,
    data_points JSONB,
    status VARCHAR(30) DEFAULT 'pending',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    implementation_pr VARCHAR(200),
    implemented_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS qa_bug_patterns (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    pattern_name VARCHAR(200) NOT NULL,
    error_signature TEXT NOT NULL,
    root_cause TEXT,
    resolution TEXT,
    affected_files TEXT[],
    severity VARCHAR(20) DEFAULT 'medium',
    is_resolved BOOLEAN DEFAULT false,
    times_seen INTEGER DEFAULT 1,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Dashboard & Audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dashboard_audit_log (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    organization_id UUID,
    affected_user_id UUID,
    query_filters JSONB,
    resource_type VARCHAR(50),
    resource_id UUID,
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Feature Suggestions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feature_suggestions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID,
    suggested_feature TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    confidence_score NUMERIC,
    message_context TEXT,
    was_shown BOOLEAN DEFAULT true,
    was_clicked BOOLEAN DEFAULT false,
    led_to_feature_use BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- API & Operations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_usage_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    service VARCHAR(50) NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    units_consumed NUMERIC,
    estimated_cost NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS failed_operations (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id VARCHAR(20),
    operation VARCHAR(100),
    error_message TEXT,
    context JSONB,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Release Management
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS release_notes (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    details TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'feature',
    environment VARCHAR(20) NOT NULL DEFAULT 'staging',
    icon VARCHAR(50) DEFAULT 'sparkles',
    is_highlighted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    created_by VARCHAR(100) DEFAULT 'release-notes-agent',
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS schema_versions (
    version VARCHAR(20) NOT NULL,
    applied_at TIMESTAMP DEFAULT now(),
    description TEXT,
    PRIMARY KEY (version)
);

-- ---------------------------------------------------------------------------
-- Website
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS website_visits (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    ip_hash VARCHAR(64),
    user_agent TEXT,
    referrer TEXT,
    landing_page TEXT,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Migration & Utility
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS migration_test (
    id INTEGER NOT NULL DEFAULT nextval('migration_test_id_seq'::regclass),
    test_message TEXT,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);


-- =============================================================================
-- SECTION 3: Unique Constraints
-- =============================================================================

DO $$ BEGIN
    ALTER TABLE ab_test_variants ADD CONSTRAINT ab_test_variants_test_id_variant_name_key UNIQUE (variant_name, test_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ab_tests ADD CONSTRAINT ab_tests_test_name_key UNIQUE (test_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_users ADD CONSTRAINT dashboard_users_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_users ADD CONSTRAINT dashboard_users_invite_token_key UNIQUE (invite_token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_users ADD CONSTRAINT dashboard_users_password_reset_token_key UNIQUE (password_reset_token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_users ADD CONSTRAINT dashboard_users_username_key UNIQUE (username);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE invitations ADD CONSTRAINT invitations_token_key UNIQUE (token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE lcpm_benchmarks ADD CONSTRAINT lcpm_benchmarks_grade_level_language_season_key UNIQUE (grade_level, season, language);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE portal_organizations ADD CONSTRAINT portal_organizations_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE teacher_facts ADD CONSTRAINT teacher_facts_user_id_fact_key UNIQUE (user_id, fact);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE feature_permissions ADD CONSTRAINT unique_role_feature UNIQUE (feature_key, role);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE access_scopes ADD CONSTRAINT unique_user_scope UNIQUE (dashboard_user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_feature_first_use ADD CONSTRAINT user_feature_first_use_user_id_feature_key UNIQUE (user_id, feature);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT users_phone_number_key UNIQUE (phone_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT users_portal_invite_token_key UNIQUE (portal_invite_token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE video_tasks ADD CONSTRAINT video_tasks_video_request_id_filename_key UNIQUE (video_request_id, filename);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE wcpm_percentiles ADD CONSTRAINT wcpm_percentiles_grade_level_language_season_percentile_key UNIQUE (season, language, grade_level, percentile);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE website_visits ADD CONSTRAINT website_visits_session_id_key UNIQUE (session_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- SECTION 4: Foreign Key Constraints
-- =============================================================================

DO $$ BEGIN
    ALTER TABLE ab_test_events
        ADD CONSTRAINT ab_test_events_test_id_fkey
        FOREIGN KEY (test_id) REFERENCES ab_tests(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ab_test_events
        ADD CONSTRAINT ab_test_events_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ab_test_variants
        ADD CONSTRAINT ab_test_variants_test_id_fkey
        FOREIGN KEY (test_id) REFERENCES ab_tests(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE access_scopes
        ADD CONSTRAINT access_scopes_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE access_scopes
        ADD CONSTRAINT access_scopes_dashboard_user_id_fkey
        FOREIGN KEY (dashboard_user_id) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ama_conversations
        ADD CONSTRAINT ama_conversations_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ama_messages
        ADD CONSTRAINT ama_messages_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES ama_conversations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ama_messages
        ADD CONSTRAINT ama_messages_tracer_user_id_fkey
        FOREIGN KEY (tracer_user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ama_query_audit
        ADD CONSTRAINT ama_query_audit_message_id_fkey
        FOREIGN KEY (message_id) REFERENCES ama_messages(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ama_query_audit
        ADD CONSTRAINT ama_query_audit_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE attendance_records
        ADD CONSTRAINT attendance_records_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES attendance_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE attendance_records
        ADD CONSTRAINT attendance_records_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES students(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE attendance_sessions
        ADD CONSTRAINT attendance_sessions_list_id_fkey
        FOREIGN KEY (list_id) REFERENCES student_lists(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE attendance_sessions
        ADD CONSTRAINT attendance_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE audio_sessions
        ADD CONSTRAINT audio_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE broadcast_logs
        ADD CONSTRAINT broadcast_logs_admin_user_id_fkey
        FOREIGN KEY (admin_user_id) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE broadcast_messages
        ADD CONSTRAINT broadcast_messages_broadcast_id_fkey
        FOREIGN KEY (broadcast_id) REFERENCES broadcast_logs(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE broadcast_messages
        ADD CONSTRAINT broadcast_messages_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE byof_approval_log
        ADD CONSTRAINT byof_approval_log_performed_by_fkey
        FOREIGN KEY (performed_by) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE byof_approval_log
        ADD CONSTRAINT byof_approval_log_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES byof_plans(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE byof_messages
        ADD CONSTRAINT byof_messages_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES byof_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE byof_plans
        ADD CONSTRAINT byof_plans_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE byof_plans
        ADD CONSTRAINT byof_plans_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES byof_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE byof_sessions
        ADD CONSTRAINT byof_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE chat_sessions
        ADD CONSTRAINT chat_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE chat_starts
        ADD CONSTRAINT chat_starts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coaching_jobs
        ADD CONSTRAINT coaching_jobs_coaching_session_id_fkey
        FOREIGN KEY (coaching_session_id) REFERENCES coaching_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coaching_processing_queue
        ADD CONSTRAINT coaching_processing_queue_coaching_session_id_fkey
        FOREIGN KEY (coaching_session_id) REFERENCES coaching_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coaching_quality_metrics
        ADD CONSTRAINT coaching_quality_metrics_coaching_session_id_fkey
        FOREIGN KEY (coaching_session_id) REFERENCES coaching_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coaching_sessions
        ADD CONSTRAINT coaching_sessions_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coaching_sessions
        ADD CONSTRAINT coaching_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE conversations
        ADD CONSTRAINT conversations_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE conversations
        ADD CONSTRAINT conversations_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_audit_log
        ADD CONSTRAINT dashboard_audit_log_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES portal_organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_audit_log
        ADD CONSTRAINT dashboard_audit_log_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_users
        ADD CONSTRAINT dashboard_users_invited_by_fkey
        FOREIGN KEY (invited_by) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE dashboard_users
        ADD CONSTRAINT dashboard_users_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES portal_organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exam_check_sessions
        ADD CONSTRAINT exam_check_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exam_grades
        ADD CONSTRAINT exam_grades_edited_by_fkey
        FOREIGN KEY (edited_by) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exam_grades
        ADD CONSTRAINT exam_grades_submission_id_fkey
        FOREIGN KEY (submission_id) REFERENCES exam_submissions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exam_submissions
        ADD CONSTRAINT exam_submissions_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES exam_check_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exam_submissions
        ADD CONSTRAINT exam_submissions_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES students(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exam_templates
        ADD CONSTRAINT exam_templates_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE feature_suggestions
        ADD CONSTRAINT feature_suggestions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE grade_audit_log
        ADD CONSTRAINT grade_audit_log_grade_id_fkey
        FOREIGN KEY (grade_id) REFERENCES exam_grades(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE grade_audit_log
        ADD CONSTRAINT grade_audit_log_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE image_analysis_requests
        ADD CONSTRAINT image_analysis_requests_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE invitations
        ADD CONSTRAINT invitations_created_user_id_fkey
        FOREIGN KEY (created_user_id) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE invitations
        ADD CONSTRAINT invitations_invited_by_fkey
        FOREIGN KEY (invited_by) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE invitations
        ADD CONSTRAINT invitations_revoked_by_fkey
        FOREIGN KEY (revoked_by) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE lesson_plan_requests
        ADD CONSTRAINT lesson_plan_requests_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE lesson_plans
        ADD CONSTRAINT lesson_plans_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE portal_organizations
        ADD CONSTRAINT portal_organizations_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES dashboard_users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE reading_assessments
        ADD CONSTRAINT reading_assessments_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE reading_assessments
        ADD CONSTRAINT reading_assessments_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE student_lists
        ADD CONSTRAINT student_lists_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE students
        ADD CONSTRAINT students_list_id_fkey
        FOREIGN KEY (list_id) REFERENCES student_lists(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE teacher_facts
        ADD CONSTRAINT teacher_facts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE teacher_progress
        ADD CONSTRAINT teacher_progress_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES audio_sessions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE teacher_progress
        ADD CONSTRAINT teacher_progress_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_feature_first_use
        ADD CONSTRAINT user_feature_first_use_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE video_requests
        ADD CONSTRAINT video_requests_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE video_tasks
        ADD CONSTRAINT video_tasks_video_request_id_fkey
        FOREIGN KEY (video_request_id) REFERENCES video_requests(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- SECTION 5: Functions
-- =============================================================================

-- Function: acquire_assessment_lock
CREATE OR REPLACE FUNCTION public.acquire_assessment_lock(p_assessment_id uuid, p_expected_status character varying)
 RETURNS TABLE(locked boolean, assessment_data jsonb, error_message text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_assessment RECORD;
  v_locked BOOLEAN := FALSE;
  v_data JSONB;
  v_error TEXT := NULL;
BEGIN
  -- Attempt to acquire row-level lock with SKIP LOCKED
  -- If another worker already holds the lock, this will return immediately
  SELECT * INTO v_assessment
  FROM reading_assessments
  WHERE id = p_assessment_id
    AND status = p_expected_status
  FOR UPDATE SKIP LOCKED;

  IF v_assessment.id IS NULL THEN
    -- Lock not acquired (either assessment doesn't exist, status changed, or already locked)

    -- Check if assessment exists at all
    SELECT status INTO v_assessment
    FROM reading_assessments
    WHERE id = p_assessment_id;

    IF v_assessment.status IS NULL THEN
      v_error := 'Assessment not found';
    ELSIF v_assessment.status != p_expected_status THEN
      v_error := format('Status mismatch: expected %s, found %s', p_expected_status, v_assessment.status);
    ELSE
      v_error := 'Assessment locked by another worker';
    END IF;

    locked := FALSE;
    assessment_data := NULL;
    error_message := v_error;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock acquired successfully
  -- Validate assessment age (reject if >30 minutes old)
  IF v_assessment.created_at < NOW() - INTERVAL '30 minutes' THEN
    v_error := format('Assessment too old: %s minutes',
                     EXTRACT(EPOCH FROM (NOW() - v_assessment.created_at)) / 60);
    locked := FALSE;
    assessment_data := NULL;
    error_message := v_error;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Convert assessment record to JSONB
  v_data := jsonb_build_object(
    'id', v_assessment.id,
    'user_id', v_assessment.user_id,
    'session_id', v_assessment.session_id,
    'student_identifier', v_assessment.student_identifier,
    'grade_level', v_assessment.grade_level,
    'language', v_assessment.language,
    'passage_text', v_assessment.passage_text,
    'passage_word_count', v_assessment.passage_word_count,
    'audio_url', v_assessment.audio_url,
    'audio_duration_seconds', v_assessment.audio_duration_seconds,
    'status', v_assessment.status,
    'created_at', v_assessment.created_at,
    'processing_started_at', v_assessment.processing_started_at
  );

  -- Return success
  locked := TRUE;
  assessment_data := v_data;
  error_message := NULL;
  RETURN NEXT;
END;
$function$
;

-- Function: acquire_broadcast_lock
CREATE OR REPLACE FUNCTION public.acquire_broadcast_lock(p_broadcast_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_advisory_lock(hashtext(p_broadcast_id::text));
  RETURN TRUE;
END;
$function$
;

-- Function: auto_title_conversation
CREATE OR REPLACE FUNCTION public.auto_title_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_is_first_user_message BOOLEAN;
  v_conversation_title VARCHAR(255);
BEGIN
  -- Only process user messages
  IF NEW.role != 'user' THEN
    RETURN NEW;
  END IF;

  -- Check if this is the first user message in the conversation
  SELECT NOT EXISTS (
    SELECT 1 FROM ama_messages
    WHERE conversation_id = NEW.conversation_id
    AND role = 'user'
    AND id != NEW.id
  ) INTO v_is_first_user_message;

  IF v_is_first_user_message THEN
    -- Truncate content to create title (max 60 chars)
    v_conversation_title := CASE
      WHEN LENGTH(NEW.content) > 60 THEN LEFT(NEW.content, 57) || '...'
      ELSE NEW.content
    END;

    UPDATE ama_conversations
    SET title = v_conversation_title
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$function$
;

-- Function: backfill_chat_sessions
CREATE OR REPLACE FUNCTION public.backfill_chat_sessions(p_session_timeout_minutes integer DEFAULT 30)
 RETURNS TABLE(total_conversations bigint, sessions_created bigint, users_processed bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_record RECORD;
  v_conversation_record RECORD;
  v_current_session_id UUID;
  v_last_message_time TIMESTAMP;
  v_time_gap INTERVAL;
  v_sessions_created BIGINT := 0;
  v_conversations_processed BIGINT := 0;
  v_users_processed BIGINT := 0;
BEGIN
  -- Process each user
  FOR v_user_record IN
    SELECT DISTINCT user_id FROM conversations WHERE session_id IS NULL ORDER BY user_id
  LOOP
    v_users_processed := v_users_processed + 1;
    v_current_session_id := NULL;
    v_last_message_time := NULL;

    -- Process conversations for this user in chronological order
    FOR v_conversation_record IN
      SELECT id, created_at
      FROM conversations
      WHERE user_id = v_user_record.user_id AND session_id IS NULL
      ORDER BY created_at ASC
    LOOP
      -- Calculate time gap
      IF v_last_message_time IS NOT NULL THEN
        v_time_gap := v_conversation_record.created_at - v_last_message_time;
      END IF;

      -- Create new session if needed
      IF v_current_session_id IS NULL OR
         (v_time_gap IS NOT NULL AND v_time_gap > (p_session_timeout_minutes || ' minutes')::INTERVAL) THEN

        -- End previous session if exists
        IF v_current_session_id IS NOT NULL THEN
          UPDATE chat_sessions
          SET ended_at = v_last_message_time
          WHERE id = v_current_session_id;
        END IF;

        -- Create new session
        INSERT INTO chat_sessions (user_id, started_at, last_activity_at)
        VALUES (v_user_record.user_id, v_conversation_record.created_at, v_conversation_record.created_at)
        RETURNING id INTO v_current_session_id;

        v_sessions_created := v_sessions_created + 1;
      END IF;

      -- Assign conversation to current session
      UPDATE conversations
      SET session_id = v_current_session_id
      WHERE id = v_conversation_record.id;

      -- Update session's last_activity_at
      UPDATE chat_sessions
      SET last_activity_at = v_conversation_record.created_at,
          message_count = message_count + 1
      WHERE id = v_current_session_id;

      v_last_message_time := v_conversation_record.created_at;
      v_conversations_processed := v_conversations_processed + 1;
    END LOOP;

    -- Mark the last session as ended
    IF v_current_session_id IS NOT NULL THEN
      UPDATE chat_sessions
      SET ended_at = v_last_message_time
      WHERE id = v_current_session_id AND ended_at IS NULL;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_conversations_processed, v_sessions_created, v_users_processed;
END;
$function$
;

-- Function: calculate_attendance_percentage
CREATE OR REPLACE FUNCTION public.calculate_attendance_percentage(p_present_count integer, p_total_students integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p_total_students <= 0 THEN
    RETURN 0;
  END IF;
  RETURN ROUND((p_present_count::DECIMAL / p_total_students * 100), 2);
END;
$function$
;

-- Function: calculate_retention
CREATE OR REPLACE FUNCTION public.calculate_retention(p_feature_type text DEFAULT 'overall'::text, p_start_date date DEFAULT (CURRENT_DATE - '84 days'::interval), p_end_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(cohort_week date, cohort_size bigint, day0_activation_pct numeric, week1_users bigint, week1_pct numeric, week2_users bigint, week2_pct numeric, week3_users bigint, week3_pct numeric, week4_users bigint, week4_pct numeric, week5_8_users bigint, week5_8_pct numeric, week9_12_users bigint, week9_12_pct numeric, has_week2_data boolean, has_week3_data boolean, has_week4_data boolean, has_week5_8_data boolean, has_week9_12_data boolean)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH cohorts AS (
    -- Define weekly cohorts using created_at (ALL users)
    SELECT
      u.id as user_id,
      DATE_TRUNC('week', u.created_at)::DATE as cohort_week,
      u.created_at as user_start_date
    FROM users u
    WHERE u.created_at IS NOT NULL
      AND u.created_at >= p_start_date
      AND u.created_at <= p_end_date
  ),
  activity_timeline AS (
    -- Build activity timeline based on feature type
    SELECT
      user_id,
      created_at as activity_date,
      'coaching' as activity_type
    FROM coaching_sessions
    WHERE status = 'completed'
      AND (p_feature_type = 'overall' OR p_feature_type = 'coaching')

    UNION ALL

    SELECT
      user_id,
      created_at as activity_date,
      'lesson_plan' as activity_type
    FROM lesson_plans
    WHERE (p_feature_type = 'overall' OR p_feature_type = 'lesson_plans')

    UNION ALL

    SELECT
      user_id,
      created_at as activity_date,
      'reading_assessment' as activity_type
    FROM reading_assessments
    WHERE status = 'completed'
      AND (p_feature_type = 'overall' OR p_feature_type = 'reading')

    UNION ALL

    -- Include conversations for overall activity tracking
    SELECT
      user_id,
      created_at as activity_date,
      'conversation' as activity_type
    FROM conversations
    WHERE p_feature_type = 'overall'
  ),
  retention_buckets AS (
    SELECT
      c.cohort_week,
      c.user_id,

      -- Day 0 (registration day) activity
      BOOL_OR(CASE
        WHEN a.activity_date::DATE = c.user_start_date::DATE
        THEN true ELSE false
      END) as active_day0,

      -- Week 1 (days 1-7) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.user_start_date + INTERVAL '1 day'
          AND a.activity_date < c.user_start_date + INTERVAL '8 days'
        THEN true ELSE false
      END) as active_week1,

      -- Week 2 (days 8-14) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.user_start_date + INTERVAL '8 days'
          AND a.activity_date < c.user_start_date + INTERVAL '15 days'
        THEN true ELSE false
      END) as active_week2,

      -- Week 3 (days 15-21) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.user_start_date + INTERVAL '15 days'
          AND a.activity_date < c.user_start_date + INTERVAL '22 days'
        THEN true ELSE false
      END) as active_week3,

      -- Week 4 (days 22-28) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.user_start_date + INTERVAL '22 days'
          AND a.activity_date < c.user_start_date + INTERVAL '29 days'
        THEN true ELSE false
      END) as active_week4,

      -- Week 5-8 (days 29-56) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.user_start_date + INTERVAL '29 days'
          AND a.activity_date < c.user_start_date + INTERVAL '57 days'
        THEN true ELSE false
      END) as active_week5_8,

      -- Week 9-12 (days 57-84) activity
      BOOL_OR(CASE
        WHEN a.activity_date >= c.user_start_date + INTERVAL '57 days'
          AND a.activity_date < c.user_start_date + INTERVAL '85 days'
        THEN true ELSE false
      END) as active_week9_12

    FROM cohorts c
    LEFT JOIN activity_timeline a ON c.user_id = a.user_id
    GROUP BY c.cohort_week, c.user_id
  )
  SELECT
    rb.cohort_week,
    COUNT(DISTINCT rb.user_id) as cohort_size,

    -- Day 0 activation percentage (feature usage on registration day)
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_day0) / COUNT(DISTINCT rb.user_id), 1) as day0_activation_pct,

    -- Week 1 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week1) as week1_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week1) / COUNT(DISTINCT rb.user_id), 1) as week1_pct,

    -- Week 2 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week2) as week2_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week2) / COUNT(DISTINCT rb.user_id), 1) as week2_pct,

    -- Week 3 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week3) as week3_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week3) / COUNT(DISTINCT rb.user_id), 1) as week3_pct,

    -- Week 4 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week4) as week4_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week4) / COUNT(DISTINCT rb.user_id), 1) as week4_pct,

    -- Week 5-8 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week5_8) as week5_8_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week5_8) / COUNT(DISTINCT rb.user_id), 1) as week5_8_pct,

    -- Week 9-12 retention
    COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week9_12) as week9_12_users,
    ROUND(100.0 * COUNT(DISTINCT rb.user_id) FILTER (WHERE rb.active_week9_12) / COUNT(DISTINCT rb.user_id), 1) as week9_12_pct,

    -- Maturity flags (is cohort old enough for this time bucket?)
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '14 days') as has_week2_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '21 days') as has_week3_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '28 days') as has_week4_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '56 days') as has_week5_8_data,
    (CURRENT_DATE >= rb.cohort_week + INTERVAL '84 days') as has_week9_12_data

  FROM retention_buckets rb
  GROUP BY rb.cohort_week
  ORDER BY rb.cohort_week DESC;
END;
$function$
;

-- Function: calculate_wcpm
CREATE OR REPLACE FUNCTION public.calculate_wcpm(p_words_correct integer, p_time_seconds double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p_time_seconds <= 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((p_words_correct::FLOAT / p_time_seconds * 60)::NUMERIC, 2);
END;
$function$
;

-- Function: check_benchmark_status
CREATE OR REPLACE FUNCTION public.check_benchmark_status(p_wcpm double precision, p_grade integer, p_language character varying DEFAULT 'en'::character varying, p_is_l2 boolean DEFAULT true)
 RETURNS TABLE(benchmark_min integer, benchmark_max integer, on_track boolean, percentile_rank integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_season VARCHAR(10);
  v_language VARCHAR(5);
  v_wcpm INTEGER;
  v_percentile INTEGER;
  v_min INTEGER;
  v_max INTEGER;
  v_on_track BOOLEAN;
BEGIN
  -- Determine season based on current month (approximate)
  -- Fall: Aug-Nov, Winter: Dec-Feb, Spring: Mar-Jun
  CASE EXTRACT(MONTH FROM CURRENT_DATE)
    WHEN 8, 9, 10, 11 THEN v_season := 'fall';
    WHEN 12, 1, 2 THEN v_season := 'winter';
    ELSE v_season := 'spring';
  END CASE;

  -- Adjust language for lookup (Urdu uses L2-adjusted norms)
  IF p_language = 'ur' AND p_is_l2 THEN
    v_language := 'ur';
  ELSE
    v_language := 'en';
  END IF;

  -- Round WCPM for lookup
  v_wcpm := ROUND(p_wcpm);

  -- Get benchmark range (25th and 75th percentile)
  SELECT
    p25.wcpm_threshold,
    p75.wcpm_threshold
  INTO v_min, v_max
  FROM wcpm_percentiles p25
  CROSS JOIN wcpm_percentiles p75
  WHERE p25.grade_level = p_grade
    AND p25.language = v_language
    AND p25.season = v_season
    AND p25.percentile = 25
    AND p75.grade_level = p_grade
    AND p75.language = v_language
    AND p75.season = v_season
    AND p75.percentile = 75;

  -- If no data found, use fallback benchmarks
  IF v_min IS NULL THEN
    CASE p_grade
      WHEN 1 THEN v_min := 12; v_max := 34;
      WHEN 2 THEN v_min := 51; v_max := 89;
      WHEN 3 THEN v_min := 71; v_max := 107;
      ELSE v_min := 50; v_max := 100;
    END CASE;

    -- Adjust for Urdu L2
    IF v_language = 'ur' THEN
      v_min := ROUND(v_min * 0.70);
      v_max := ROUND(v_max * 0.70);
    END IF;
  END IF;

  -- Determine on-track status (25th percentile or above)
  v_on_track := v_wcpm >= v_min;

  -- Calculate percentile using lookup table
  -- Find highest percentile where student meets/exceeds threshold
  SELECT COALESCE(MAX(percentile), 10)
  INTO v_percentile
  FROM wcpm_percentiles
  WHERE grade_level = p_grade
    AND language = v_language
    AND season = v_season
    AND wcpm_threshold <= v_wcpm;

  -- Handle edge cases
  IF v_wcpm = 0 THEN
    v_percentile := 1;
  ELSIF v_percentile < 10 THEN
    v_percentile := 10;
  END IF;

  -- Return results
  benchmark_min := v_min;
  benchmark_max := v_max;
  on_track := v_on_track;
  percentile_rank := v_percentile;

  RETURN NEXT;
END;
$function$
;

-- Function: check_lcpm_benchmark_status
CREATE OR REPLACE FUNCTION public.check_lcpm_benchmark_status(p_lcpm double precision, p_grade integer, p_language character varying)
 RETURNS TABLE(benchmark_min integer, benchmark_max integer, on_track boolean, percentile_rank integer, metric_name character varying, metric_display_name character varying)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_benchmarks lcpm_benchmarks%ROWTYPE;
  v_percentile INTEGER;
BEGIN
  -- Get fall benchmarks (conservative, start of year)
  SELECT * INTO v_benchmarks
  FROM lcpm_benchmarks
  WHERE grade_level = p_grade
    AND language = COALESCE(p_language, 'en')
    AND season = 'fall'
  LIMIT 1;

  -- If no benchmark found, use defaults
  IF v_benchmarks IS NULL THEN
    benchmark_min := 20;
    benchmark_max := 60;
    on_track := p_lcpm >= 20;
    percentile_rank := 50;
    metric_name := 'LCPM';
    metric_display_name := 'Letters Correct Per Minute';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Calculate percentile
  IF p_lcpm < v_benchmarks.percentile_5 THEN
    v_percentile := 5;
  ELSIF p_lcpm < v_benchmarks.percentile_10 THEN
    v_percentile := 10;
  ELSIF p_lcpm < v_benchmarks.percentile_25 THEN
    v_percentile := 25;
  ELSIF p_lcpm < v_benchmarks.percentile_50 THEN
    v_percentile := 50;
  ELSIF p_lcpm < v_benchmarks.percentile_75 THEN
    v_percentile := 75;
  ELSIF p_lcpm < v_benchmarks.percentile_90 THEN
    v_percentile := 90;
  ELSE
    v_percentile := 95;
  END IF;

  -- Return results
  benchmark_min := v_benchmarks.percentile_25;  -- 25th percentile as minimum target
  benchmark_max := v_benchmarks.percentile_75;  -- 75th percentile as stretch goal
  on_track := p_lcpm >= v_benchmarks.percentile_25;  -- On track if above 25th percentile
  percentile_rank := v_percentile;
  metric_name := 'LCPM';
  metric_display_name := 'Letters Correct Per Minute';

  RETURN NEXT;
END;
$function$
;

-- Function: claim_next_coaching_job
CREATE OR REPLACE FUNCTION public.claim_next_coaching_job(p_worker_id text, p_max_attempts integer DEFAULT 3)
 RETURNS TABLE(id uuid, coaching_session_id uuid, job_type text, payload jsonb, status text, attempts integer, max_attempts integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_job_id UUID;
BEGIN
  -- Find and claim next available job using SELECT FOR UPDATE SKIP LOCKED
  -- This prevents race conditions in distributed worker environments
  SELECT cj.id INTO v_job_id
  FROM coaching_jobs cj
  WHERE cj.status = 'pending'
    AND cj.scheduled_for <= now()
    AND cj.attempts < p_max_attempts
  ORDER BY cj.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no job found, return empty
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Update job status to processing
  UPDATE coaching_jobs
  SET
    status = 'processing',
    started_at = now(),
    worker_id = p_worker_id,
    attempts = coaching_jobs.attempts + 1
  WHERE coaching_jobs.id = v_job_id;

  -- Return the claimed job
  RETURN QUERY
  SELECT
    cj.id,
    cj.coaching_session_id,
    cj.job_type,
    cj.payload,
    cj.status,
    cj.attempts,
    cj.max_attempts,
    cj.created_at
  FROM coaching_jobs cj
  WHERE cj.id = v_job_id;
END;
$function$
;

-- Function: cleanup_old_coaching_jobs
CREATE OR REPLACE FUNCTION public.cleanup_old_coaching_jobs(p_days_old integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM coaching_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < now() - (p_days_old || ' days')::interval;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$function$
;

-- Function: complete_coaching_job
CREATE OR REPLACE FUNCTION public.complete_coaching_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE coaching_jobs
  SET
    status = 'completed',
    completed_at = now()
  WHERE id = p_job_id;
END;
$function$
;

-- Function: fail_coaching_job
CREATE OR REPLACE FUNCTION public.fail_coaching_job(p_job_id uuid, p_error_message text, p_error_stack text DEFAULT NULL::text, p_retry_delay_seconds integer DEFAULT 60)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_attempts INTEGER;
  v_max_attempts INTEGER;
BEGIN
  -- Get current attempt count
  SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
  FROM coaching_jobs
  WHERE id = p_job_id;

  -- Check if we should retry
  IF v_attempts < v_max_attempts THEN
    -- Retry: Set back to pending with delay
    UPDATE coaching_jobs
    SET
      status = 'pending',
      error_message = p_error_message,
      error_stack = p_error_stack,
      scheduled_for = now() + (p_retry_delay_seconds || ' seconds')::interval
    WHERE id = p_job_id;
  ELSE
    -- Max attempts reached: Mark as permanently failed
    UPDATE coaching_jobs
    SET
      status = 'failed',
      completed_at = now(),
      error_message = p_error_message,
      error_stack = p_error_stack
    WHERE id = p_job_id;
  END IF;
END;
$function$
;

-- Function: get_attendance_summary
CREATE OR REPLACE FUNCTION public.get_attendance_summary(p_list_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(total_sessions integer, avg_attendance_percentage numeric, total_present integer, total_absent integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
;

-- Function: get_broadcast_counts
CREATE OR REPLACE FUNCTION public.get_broadcast_counts(p_broadcast_id uuid)
 RETURNS TABLE(delivered_count integer, read_count integer, failed_count integer, replied_count integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status IN ('delivered', 'read'))::INT AS delivered_count,
    COUNT(*) FILTER (WHERE status = 'read')::INT AS read_count,
    COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_count,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::INT AS replied_count
  FROM broadcast_messages
  WHERE broadcast_id = p_broadcast_id;
END;
$function$
;

-- Function: get_or_create_session
CREATE OR REPLACE FUNCTION public.get_or_create_session(p_user_id uuid, p_session_timeout_minutes integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_session_id UUID;
  v_last_activity TIMESTAMP;
  v_time_since_last_activity INTERVAL;
BEGIN
  -- Get the most recent session for this user
  SELECT id, last_activity_at INTO v_session_id, v_last_activity
  FROM chat_sessions
  WHERE user_id = p_user_id
    AND ended_at IS NULL
  ORDER BY last_activity_at DESC
  LIMIT 1;

  -- Calculate time since last activity
  IF v_last_activity IS NOT NULL THEN
    v_time_since_last_activity := NOW() - v_last_activity;
  END IF;

  -- If no session exists or session timed out, create new session
  IF v_session_id IS NULL OR v_time_since_last_activity > (p_session_timeout_minutes || ' minutes')::INTERVAL THEN
    -- End the old session if it exists
    IF v_session_id IS NOT NULL THEN
      UPDATE chat_sessions
      SET ended_at = v_last_activity
      WHERE id = v_session_id;
    END IF;

    -- Create new session
    INSERT INTO chat_sessions (user_id, started_at, last_activity_at)
    VALUES (p_user_id, NOW(), NOW())
    RETURNING id INTO v_session_id;
  ELSE
    -- Update last_activity_at for existing session
    UPDATE chat_sessions
    SET last_activity_at = NOW()
    WHERE id = v_session_id;
  END IF;

  RETURN v_session_id;
END;
$function$
;

-- Function: get_portal_users
CREATE OR REPLACE FUNCTION public.get_portal_users(p_portal_user_id uuid)
 RETURNS TABLE(id uuid, phone_number text, first_name text, school_name text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Set the context
  PERFORM set_config('app.portal_user_id', p_portal_user_id::text, true);
  
  -- Query will respect RLS policy because we're not using service_role privileges here
  RETURN QUERY
  SELECT 
    u.id,
    u.phone_number::text,
    u.first_name::text,
    u.school_name::text
  FROM users u;
END;
$function$
;

-- Function: get_users_with_last_activity
CREATE OR REPLACE FUNCTION public.get_users_with_last_activity(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, phone_number text, name text, first_name text, last_name text, registration_completed boolean, registration_state text, registration_started_at timestamp with time zone, registration_completed_at timestamp with time zone, registration_state_updated_at timestamp with time zone, created_at timestamp with time zone, last_conversation_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    u.id,
    u.phone_number,
    u.name,
    u.first_name,
    u.last_name,
    u.registration_completed,
    u.registration_state,
    u.registration_started_at,
    u.registration_completed_at,
    u.registration_state_updated_at,
    u.created_at,
    MAX(c.created_at) as last_conversation_at
  FROM users u
  LEFT JOIN conversations c ON c.user_id = u.id
  GROUP BY
    u.id,
    u.phone_number,
    u.name,
    u.first_name,
    u.last_name,
    u.registration_completed,
    u.registration_state,
    u.registration_started_at,
    u.registration_completed_at,
    u.registration_state_updated_at,
    u.created_at
  ORDER BY
    -- Users with conversations sorted by most recent conversation
    -- Users without conversations sorted by account creation
    COALESCE(MAX(c.created_at), u.created_at) DESC
  LIMIT p_limit
  OFFSET p_offset;
$function$
;

-- Function: increment_broadcast_count
CREATE OR REPLACE FUNCTION public.increment_broadcast_count(p_broadcast_id uuid, p_column_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only allow specific column names for security
  IF p_column_name NOT IN ('sent_count', 'delivered_count', 'read_count', 'failed_count', 'replied_count') THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column_name;
  END IF;

  EXECUTE format('UPDATE broadcast_logs SET %I = %I + 1 WHERE id = $1', p_column_name, p_column_name)
    USING p_broadcast_id;
END;
$function$
;

-- Function: increment_replied_count
CREATE OR REPLACE FUNCTION public.increment_replied_count(p_broadcast_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE broadcast_logs
  SET replied_count = replied_count + 1
  WHERE id = p_broadcast_id;
END;
$function$
;

-- Function: increment_turn_count
CREATE OR REPLACE FUNCTION public.increment_turn_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only increment turn count when assistant responds (completing a turn)
  IF NEW.role = 'assistant' AND NEW.session_id IS NOT NULL THEN
    UPDATE chat_sessions
    SET turn_count = turn_count + 1
    WHERE id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$function$
;

-- Function: is_invitation_valid
CREATE OR REPLACE FUNCTION public.is_invitation_valid(p_token character varying)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_status VARCHAR;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT status, expires_at
  INTO v_status, v_expires_at
  FROM invitations
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_status != 'pending' THEN
    RETURN FALSE;
  END IF;

  IF v_expires_at < NOW() THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$function$
;

-- Function: log_broadcast_changes
CREATE OR REPLACE FUNCTION public.log_broadcast_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only log status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.audit_trail = COALESCE(OLD.audit_trail, '[]'::JSONB) ||
      jsonb_build_object(
        'timestamp', NOW(),
        'old_status', OLD.status,
        'new_status', NEW.status
      );
  END IF;
  RETURN NEW;
END;
$function$
;

-- Function: queue_coaching_job
CREATE OR REPLACE FUNCTION public.queue_coaching_job(p_session_id uuid, p_job_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_job_id UUID;
BEGIN
  -- Insert job
  INSERT INTO coaching_jobs (
    coaching_session_id,
    job_type,
    payload,
    status,
    created_at,
    scheduled_for
  ) VALUES (
    p_session_id,
    p_job_type,
    p_payload,
    'pending',
    now(),
    now()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$function$
;

-- Function: refresh_dashboard_views
CREATE OR REPLACE FUNCTION public.refresh_dashboard_views()
 RETURNS TABLE(view_name text, refresh_status text, duration_ms integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
BEGIN
  -- Refresh mv_dashboard_stats
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_dashboard_stats'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_dashboard_stats'::TEXT, SQLERRM::TEXT, 0;
  END;

  -- Refresh mv_users_activity
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_users_activity;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_users_activity'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_users_activity'::TEXT, SQLERRM::TEXT, 0;
  END;

  -- Refresh mv_retention_cohorts
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_retention_cohorts;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_retention_cohorts'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_retention_cohorts'::TEXT, SQLERRM::TEXT, 0;
  END;

  -- Refresh status view last
  start_time := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_view_refresh_status;
    end_time := clock_timestamp();
    RETURN QUERY SELECT 'mv_view_refresh_status'::TEXT, 'success'::TEXT,
      EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'mv_view_refresh_status'::TEXT, SQLERRM::TEXT, 0;
  END;
END;
$function$
;

-- Function: release_broadcast_lock
CREATE OR REPLACE FUNCTION public.release_broadcast_lock(p_broadcast_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_advisory_unlock(hashtext(p_broadcast_id::text));
END;
$function$
;

-- Function: set_portal_user_context
CREATE OR REPLACE FUNCTION public.set_portal_user_context(p_portal_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_portal_user_id IS NULL THEN
    -- Clear the context
    PERFORM set_config('app.portal_user_id', '', false);
  ELSE
    PERFORM set_config('app.portal_user_id', p_portal_user_id::text, false);
  END IF;
END;
$function$
;

-- Function: update_access_scopes_updated_at
CREATE OR REPLACE FUNCTION public.update_access_scopes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Function: update_assessment_status
CREATE OR REPLACE FUNCTION public.update_assessment_status(p_assessment_id uuid, p_new_status character varying, p_error_message text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE reading_assessments
  SET
    status = p_new_status,
    processing_started_at = CASE
      WHEN p_new_status = 'processing' THEN NOW()
      WHEN p_new_status IN ('completed', 'failed') THEN processing_started_at -- Preserve original
      ELSE processing_started_at
    END,
    completed_at = CASE
      WHEN p_new_status = 'completed' THEN NOW()
      ELSE completed_at
    END,
    error_message = p_error_message,
    updated_at = NOW()
  WHERE id = p_assessment_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$
;

-- Function: update_byof_session_timestamp
CREATE OR REPLACE FUNCTION public.update_byof_session_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Function: update_conversation_on_message
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE ama_conversations
  SET
    updated_at = NOW(),
    message_count = message_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$
;

-- Function: update_exam_checker_updated_at
CREATE OR REPLACE FUNCTION public.update_exam_checker_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: update_qa_updated_at
CREATE OR REPLACE FUNCTION public.update_qa_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- Function: update_session_message_count
CREATE OR REPLACE FUNCTION public.update_session_message_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Increment message count for the session
  IF NEW.session_id IS NOT NULL THEN
    UPDATE chat_sessions
    SET message_count = message_count + 1
    WHERE id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$function$
;

-- Function: update_student_count
CREATE OR REPLACE FUNCTION public.update_student_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

-- Function: update_student_videos_search_vector
CREATE OR REPLACE FUNCTION public.update_student_videos_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.grade, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.topic, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.subtopic, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.notes, '')), 'D');
  RETURN NEW;
END;
$function$
;

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;


-- =============================================================================
-- SECTION 6: Triggers
-- =============================================================================

DROP TRIGGER IF EXISTS access_scopes_updated_at_trigger ON access_scopes;
CREATE TRIGGER access_scopes_updated_at_trigger
    BEFORE UPDATE ON access_scopes
    FOR EACH ROW
    EXECUTE FUNCTION update_access_scopes_updated_at();

DROP TRIGGER IF EXISTS broadcast_audit_trigger ON broadcast_logs;
CREATE TRIGGER broadcast_audit_trigger
    BEFORE UPDATE ON broadcast_logs
    FOR EACH ROW
    EXECUTE FUNCTION log_broadcast_changes();

DROP TRIGGER IF EXISTS exam_sessions_updated_at ON exam_check_sessions;
CREATE TRIGGER exam_sessions_updated_at
    BEFORE UPDATE ON exam_check_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_exam_checker_updated_at();

DROP TRIGGER IF EXISTS exam_submissions_updated_at ON exam_submissions;
CREATE TRIGGER exam_submissions_updated_at
    BEFORE UPDATE ON exam_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_exam_checker_updated_at();

DROP TRIGGER IF EXISTS exam_templates_updated_at ON exam_templates;
CREATE TRIGGER exam_templates_updated_at
    BEFORE UPDATE ON exam_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_exam_checker_updated_at();

DROP TRIGGER IF EXISTS increment_session_turn_count ON conversations;
CREATE TRIGGER increment_session_turn_count
    AFTER INSERT ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION increment_turn_count();

DROP TRIGGER IF EXISTS qa_analyst_proposals_updated_at ON qa_analyst_proposals;
CREATE TRIGGER qa_analyst_proposals_updated_at
    BEFORE UPDATE ON qa_analyst_proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_qa_updated_at();

DROP TRIGGER IF EXISTS qa_bug_patterns_updated_at ON qa_bug_patterns;
CREATE TRIGGER qa_bug_patterns_updated_at
    BEFORE UPDATE ON qa_bug_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_qa_updated_at();

DROP TRIGGER IF EXISTS qa_test_runs_updated_at ON qa_test_runs;
CREATE TRIGGER qa_test_runs_updated_at
    BEFORE UPDATE ON qa_test_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_qa_updated_at();

DROP TRIGGER IF EXISTS trigger_auto_title_conversation ON ama_messages;
CREATE TRIGGER trigger_auto_title_conversation
    AFTER INSERT ON ama_messages
    FOR EACH ROW
    EXECUTE FUNCTION auto_title_conversation();

DROP TRIGGER IF EXISTS trigger_update_byof_session_timestamp ON byof_sessions;
CREATE TRIGGER trigger_update_byof_session_timestamp
    BEFORE UPDATE ON byof_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_byof_session_timestamp();

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON ama_messages;
CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON ama_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_message();

DROP TRIGGER IF EXISTS trigger_update_student_count ON students;
CREATE TRIGGER trigger_update_student_count
    AFTER INSERT ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_student_count();

DROP TRIGGER IF EXISTS trigger_update_student_count ON students;
CREATE TRIGGER trigger_update_student_count
    AFTER DELETE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_student_count();

DROP TRIGGER IF EXISTS trigger_update_student_count ON students;
CREATE TRIGGER trigger_update_student_count
    AFTER UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_student_count();

DROP TRIGGER IF EXISTS trigger_update_student_videos_search_vector ON student_videos;
CREATE TRIGGER trigger_update_student_videos_search_vector
    BEFORE INSERT ON student_videos
    FOR EACH ROW
    EXECUTE FUNCTION update_student_videos_search_vector();

DROP TRIGGER IF EXISTS trigger_update_student_videos_search_vector ON student_videos;
CREATE TRIGGER trigger_update_student_videos_search_vector
    BEFORE UPDATE ON student_videos
    FOR EACH ROW
    EXECUTE FUNCTION update_student_videos_search_vector();

DROP TRIGGER IF EXISTS trigger_update_student_videos_updated_at ON student_videos;
CREATE TRIGGER trigger_update_student_videos_updated_at
    BEFORE UPDATE ON student_videos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_coaching_sessions_updated_at ON coaching_sessions;
CREATE TRIGGER update_coaching_sessions_updated_at
    BEFORE UPDATE ON coaching_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_image_requests_updated_at ON image_analysis_requests;
CREATE TRIGGER update_image_requests_updated_at
    BEFORE UPDATE ON image_analysis_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reading_assessments_updated_at ON reading_assessments;
CREATE TRIGGER update_reading_assessments_updated_at
    BEFORE UPDATE ON reading_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_session_count_on_message_insert ON conversations;
CREATE TRIGGER update_session_count_on_message_insert
    AFTER INSERT ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_session_message_count();

DROP TRIGGER IF EXISTS update_student_lists_updated_at ON student_lists;
CREATE TRIGGER update_student_lists_updated_at
    BEFORE UPDATE ON student_lists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teacher_facts_updated_at ON teacher_facts;
CREATE TRIGGER update_teacher_facts_updated_at
    BEFORE UPDATE ON teacher_facts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- SECTION 7: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ab_test_events_date ON ab_test_events USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_test ON ab_test_events USING btree (test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_user ON ab_test_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_variants_test ON ab_test_variants USING btree (test_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_access_scopes_type ON access_scopes USING btree (scope_type);
CREATE INDEX IF NOT EXISTS idx_access_scopes_user ON access_scopes USING btree (dashboard_user_id);
CREATE INDEX IF NOT EXISTS idx_access_scopes_value ON access_scopes USING gin (scope_value);
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_scope ON access_scopes USING btree (dashboard_user_id);
CREATE INDEX IF NOT EXISTS idx_ama_conversations_updated_at ON ama_conversations USING btree (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ama_conversations_user_archived ON ama_conversations USING btree (user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_ama_conversations_user_id ON ama_conversations USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_ama_messages_conversation_id ON ama_messages USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ama_messages_created_at ON ama_messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_ama_query_audit_created_at ON ama_query_audit USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ama_query_audit_status ON ama_query_audit USING btree (execution_status);
CREATE INDEX IF NOT EXISTS idx_ama_query_audit_user_id ON ama_query_audit USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_service_date ON api_usage_log USING btree (service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON attendance_sessions USING btree (session_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_list_date ON attendance_sessions USING btree (list_id, session_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_sessions_unique ON attendance_sessions USING btree (list_id, session_date, session_type);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user ON attendance_sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_date ON attendance_sessions USING btree (user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_audio_sessions_user_created ON audio_sessions USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_admin ON broadcast_logs USING btree (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_created ON broadcast_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_logs_status ON broadcast_logs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id ON broadcast_messages USING btree (broadcast_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_user ON broadcast_messages USING btree (broadcast_id, user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_message_id ON broadcast_messages USING btree (message_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON broadcast_messages USING btree (status);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_user_sent ON broadcast_messages USING btree (user_id, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_messages_wamid ON broadcast_messages USING btree (message_id) WHERE (message_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_byof_approval_log_plan ON byof_approval_log USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_byof_messages_created ON byof_messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_byof_messages_session ON byof_messages USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_byof_plans_pr ON byof_plans USING btree (pr_url) WHERE (pr_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_byof_plans_session ON byof_plans USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_byof_plans_status ON byof_plans USING btree (status);
CREATE INDEX IF NOT EXISTS idx_byof_sessions_status ON byof_sessions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_byof_sessions_user ON byof_sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_active ON chat_sessions USING btree (user_id, last_activity_at DESC) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_started ON chat_sessions USING btree (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_starts_created_at ON chat_starts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_starts_phone_number ON chat_starts USING btree (phone_number);
CREATE INDEX IF NOT EXISTS idx_chat_starts_session_id ON chat_starts USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_starts_user_id ON chat_starts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_created ON coaching_jobs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_scheduled ON coaching_jobs USING btree (scheduled_for) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_session ON coaching_jobs USING btree (coaching_session_id);
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_status ON coaching_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_queue_pending_jobs ON coaching_processing_queue USING btree (status, next_retry_at, created_at) WHERE ((status)::text = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_queue_processing ON coaching_processing_queue USING btree (status, processing_worker_id) WHERE ((status)::text = 'processing'::text);
CREATE INDEX IF NOT EXISTS idx_queue_session ON coaching_processing_queue USING btree (coaching_session_id);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_created ON coaching_quality_metrics USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_session ON coaching_quality_metrics USING btree (coaching_session_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_audio_id ON coaching_sessions USING btree (audio_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_created_at ON coaching_sessions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_gamma_url ON coaching_sessions USING btree (report_gamma_url) WHERE (report_gamma_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_lesson_plan_structured ON coaching_sessions USING gin (lesson_plan_structured);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_stale ON coaching_sessions USING btree (status, created_at) WHERE ((status)::text = 'conducting_conversation'::text);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_status ON coaching_sessions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user_id ON coaching_sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user_status ON coaching_sessions USING btree (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_user_created ON coaching_sessions USING btree (user_id, created_at, status);
CREATE INDEX IF NOT EXISTS idx_conversations_current_state ON conversations USING btree (current_state) WHERE (current_state IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_conversations_format_language ON conversations USING btree (input_format, input_language, output_format, output_language);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations USING btree (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_role_created ON conversations USING btree (user_id, role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_created_at ON cta_clicks USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_session_id ON cta_clicks USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_affected_user ON dashboard_audit_log USING btree (affected_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON dashboard_audit_log USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON dashboard_audit_log USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON dashboard_audit_log USING btree (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON dashboard_audit_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_byof_role ON dashboard_users USING btree (byof_role) WHERE (byof_role IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_email ON dashboard_users USING btree (email);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_invite_token ON dashboard_users USING btree (invite_token);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_org ON dashboard_users USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_role ON dashboard_users USING btree (role);
CREATE INDEX IF NOT EXISTS idx_dashboard_users_username ON dashboard_users USING btree (username);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_check_sessions USING btree (status) WHERE ((status)::text <> ALL ((ARRAY['completed'::character varying, 'cancelled'::character varying, 'error'::character varying])::text[]));
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON exam_check_sessions USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_grades_submission ON exam_grades USING btree (submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_grades_unique ON exam_grades USING btree (submission_id, question_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_session ON exam_submissions USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student ON exam_submissions USING btree (student_id) WHERE (student_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_exam_templates_user ON exam_templates USING btree (user_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_operations_created ON failed_operations USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_permissions_feature ON feature_permissions USING btree (feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_permissions_role ON feature_permissions USING btree (role);
CREATE UNIQUE INDEX IF NOT EXISTS unique_role_feature ON feature_permissions USING btree (role, feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_suggestions_date ON feature_suggestions USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_feature_suggestions_feature ON feature_suggestions USING btree (suggested_feature);
CREATE INDEX IF NOT EXISTS idx_feature_suggestions_trigger ON feature_suggestions USING btree (trigger_type);
CREATE INDEX IF NOT EXISTS idx_feature_suggestions_user ON feature_suggestions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_grade_audit_grade ON grade_audit_log USING btree (grade_id);
CREATE INDEX IF NOT EXISTS idx_image_requests_status_started ON image_analysis_requests USING btree (status, started_at) WHERE ((status)::text = 'processing'::text);
CREATE INDEX IF NOT EXISTS idx_image_requests_user ON image_analysis_requests USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations USING btree (email);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations USING btree (invited_by);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_invitations_status_expires ON invitations USING btree (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations USING btree (token);
CREATE INDEX IF NOT EXISTS idx_lcpm_benchmarks_lookup ON lcpm_benchmarks USING btree (grade_level, language, season);
CREATE INDEX IF NOT EXISTS idx_lp_requests_status ON lesson_plan_requests USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS idx_lp_requests_user ON lesson_plan_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_pdf_url ON lesson_plans USING btree (pdf_url) WHERE (pdf_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_user_created ON lesson_plans USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_stats_unique ON mv_dashboard_stats USING btree ((1));
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_stats_by_country_pk ON mv_dashboard_stats_by_country USING btree (country_code);
CREATE INDEX IF NOT EXISTS idx_mv_retention_cohorts_feature ON mv_retention_cohorts USING btree (feature_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_retention_cohorts_unique ON mv_retention_cohorts USING btree (cohort_week, feature_type);
CREATE INDEX IF NOT EXISTS idx_mv_users_activity_country ON mv_users_activity USING btree (country_code) WHERE (is_test_user = false);
CREATE INDEX IF NOT EXISTS idx_mv_users_activity_created ON mv_users_activity USING btree (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_users_activity_id ON mv_users_activity USING btree (id);
CREATE INDEX IF NOT EXISTS idx_mv_users_activity_last_activity ON mv_users_activity USING btree (last_activity DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_mv_users_activity_phone ON mv_users_activity USING btree (phone_number);
CREATE INDEX IF NOT EXISTS idx_mv_users_activity_school ON mv_users_activity USING btree (school_name_lower) WHERE ((is_test_user = false) AND (school_name_lower <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_view_refresh_status_pk ON mv_view_refresh_status USING btree (view_name);
CREATE INDEX IF NOT EXISTS idx_portal_orgs_active ON portal_organizations USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_portal_orgs_name ON portal_organizations USING btree (name);
CREATE INDEX IF NOT EXISTS idx_qa_proposals_created ON qa_analyst_proposals USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_proposals_status ON qa_analyst_proposals USING btree (status);
CREATE INDEX IF NOT EXISTS idx_qa_bug_patterns_resolved ON qa_bug_patterns USING btree (is_resolved);
CREATE INDEX IF NOT EXISTS idx_qa_bug_patterns_severity ON qa_bug_patterns USING btree (severity);
CREATE INDEX IF NOT EXISTS idx_qa_bug_patterns_signature ON qa_bug_patterns USING gin (to_tsvector('english'::regconfig, error_signature));
CREATE INDEX IF NOT EXISTS idx_qa_test_runs_started ON qa_test_runs USING btree (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_test_runs_status ON qa_test_runs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_qa_test_runs_trigger ON qa_test_runs USING btree (trigger_type);
CREATE INDEX IF NOT EXISTS idx_reading_assessments_created_at ON reading_assessments USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_assessments_lock_query ON reading_assessments USING btree (id, status) WHERE ((status)::text = ANY ((ARRAY['passage_generated'::character varying, 'audio_received'::character varying, 'processing'::character varying])::text[]));
CREATE INDEX IF NOT EXISTS idx_reading_assessments_status ON reading_assessments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_reading_assessments_user_id ON reading_assessments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_reading_assessments_user_status ON reading_assessments USING btree (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_assessments_user_student ON reading_assessments USING btree (user_id, student_identifier);
CREATE INDEX IF NOT EXISTS idx_reading_concurrent ON reading_assessments USING btree (user_id, status) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::text[]));
CREATE INDEX IF NOT EXISTS idx_reading_grade_lang ON reading_assessments USING btree (grade_level, language, created_at DESC) WHERE ((status)::text = 'completed'::text);
CREATE INDEX IF NOT EXISTS idx_reading_stuck_jobs ON reading_assessments USING btree (status, processing_started_at) WHERE ((status)::text = 'processing'::text);
CREATE INDEX IF NOT EXISTS idx_reading_user_created ON reading_assessments USING btree (user_id, created_at, status);
CREATE INDEX IF NOT EXISTS idx_release_notes_category ON release_notes USING btree (category);
CREATE INDEX IF NOT EXISTS idx_release_notes_env_date ON release_notes USING btree (environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_lists_active ON student_lists USING btree (user_id, is_active) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_lists_unique_class ON student_lists USING btree (user_id, lower((class_name)::text), academic_year) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_student_lists_user ON student_lists USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_student_videos_grade ON student_videos USING btree (grade);
CREATE INDEX IF NOT EXISTS idx_student_videos_grade_subject ON student_videos USING btree (grade, subject);
CREATE INDEX IF NOT EXISTS idx_student_videos_search ON student_videos USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_student_videos_subject ON student_videos USING btree (subject);
CREATE INDEX IF NOT EXISTS idx_student_videos_topic ON student_videos USING btree (topic);
CREATE INDEX IF NOT EXISTS idx_students_list ON students USING btree (list_id) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_students_list_roll ON students USING btree (list_id, roll_number) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_teacher_facts_user ON teacher_facts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_progress_user_dimension ON teacher_progress USING btree (user_id, dimension, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feature_first_use_lookup ON user_feature_first_use USING btree (user_id, feature);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_users_is_test ON users USING btree (is_test_user) WHERE (is_test_user = true);
CREATE INDEX IF NOT EXISTS idx_users_is_test_user ON users USING btree (is_test_user) WHERE (is_test_user = true);
CREATE INDEX IF NOT EXISTS idx_users_language_locked ON users USING btree (language_locked);
CREATE INDEX IF NOT EXISTS idx_users_language_nudge ON users USING btree (language_nudge_sent, updated_at);
CREATE INDEX IF NOT EXISTS idx_users_password_reset ON users USING btree (password_reset_code, password_reset_expires_at) WHERE (password_reset_code IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users USING btree (phone_number);
CREATE INDEX IF NOT EXISTS idx_users_phone_number_prefix ON users USING btree ("left"((phone_number)::text, 4));
CREATE INDEX IF NOT EXISTS idx_users_portal_invite_token ON users USING btree (portal_invite_token) WHERE (portal_invite_token IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_portal_login ON users USING btree (phone_number, portal_activated) WHERE (portal_activated = true);
CREATE INDEX IF NOT EXISTS idx_users_preferred_language ON users USING btree (preferred_language);
CREATE INDEX IF NOT EXISTS idx_users_registration_completed ON users USING btree (registration_completed_at) WHERE (registration_completed_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_registration_state ON users USING btree (registration_state);
CREATE INDEX IF NOT EXISTS idx_users_school_name_lower ON users USING btree (lower((school_name)::text));
CREATE INDEX IF NOT EXISTS idx_users_session_id ON users USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_users_source ON users USING btree (source);
CREATE INDEX IF NOT EXISTS idx_video_requests_created_at ON video_requests USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_requests_status ON video_requests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_video_requests_user_id ON video_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_request_id ON video_tasks USING btree (video_request_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_status ON video_tasks USING btree (status);
CREATE INDEX IF NOT EXISTS idx_videos_grade_subject ON videos USING btree (grade, subject);
CREATE INDEX IF NOT EXISTS idx_wcpm_percentiles_lookup ON wcpm_percentiles USING btree (grade_level, language, season, percentile);
CREATE INDEX IF NOT EXISTS idx_website_visits_created_at ON website_visits USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_visits_session_id ON website_visits USING btree (session_id);


-- =============================================================================
-- SECTION 8: Reload PostgREST Schema Cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Schema creation complete.
-- =============================================================================
-- ============================================================================
-- Curriculum Lesson Plans + Region Gating (Phase 4A)
-- Self-contained curriculum-LP path: OCR'd textbooks -> pre-generated LPs
-- looked up by region/grade/chapter and served from R2. Region gating is
-- DB-driven via region_features (no hardcoded regions). The external on-demand
-- UG_LP service is intentionally NOT part of this schema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS textbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    province TEXT,
    curriculum TEXT,
    grade INTEGER CHECK (grade BETWEEN 1 AND 12),
    subject TEXT,
    filename TEXT,
    r2_key TEXT,
    total_pages INTEGER,
    pdf_page_offset INTEGER DEFAULT 0,
    ocr_status TEXT DEFAULT 'pending',
    ocr_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (province, grade, subject)
);

CREATE TABLE IF NOT EXISTS textbook_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    pdf_page_index INTEGER,
    textbook_page_number INTEGER,
    page_content TEXT,
    page_images JSONB DEFAULT '[]',
    learning_outcomes JSONB DEFAULT '[]',
    exercises JSONB DEFAULT '[]',
    teaching_points JSONB DEFAULT '[]',
    has_tables BOOLEAN DEFAULT false,
    has_math BOOLEAN DEFAULT false,
    has_urdu BOOLEAN DEFAULT false,
    content_length INTEGER,
    ocr_confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (textbook_id, pdf_page_index)
);
CREATE INDEX IF NOT EXISTS idx_textbook_pages_lookup ON textbook_pages USING btree (textbook_id, textbook_page_number) WHERE page_content IS NOT NULL;

CREATE TABLE IF NOT EXISTS textbook_toc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    textbook_id UUID REFERENCES textbooks(id) ON DELETE CASCADE,
    chapter_number INTEGER,
    chapter_title TEXT NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    topic_keywords TEXT[] DEFAULT '{}',
    learning_outcomes TEXT[] DEFAULT '{}',
    estimated_days INTEGER DEFAULT 5,
    is_manual_override BOOLEAN DEFAULT false,
    curriculum TEXT,
    grade INTEGER,
    subject TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_textbook_toc_keywords ON textbook_toc USING gin (topic_keywords);
CREATE INDEX IF NOT EXISTS idx_textbook_toc_lookup ON textbook_toc USING btree (curriculum, grade, subject);

CREATE TABLE IF NOT EXISTS pre_generated_lps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    textbook_id UUID REFERENCES textbooks(id) ON DELETE SET NULL,
    chapter_title TEXT,
    chapter_number INTEGER,
    page_start INTEGER,
    page_end INTEGER,
    days INTEGER DEFAULT 5,
    gamma_url_en TEXT,
    gamma_url_ur TEXT,
    pdf_r2_key_en TEXT,
    pdf_r2_key_ur TEXT,
    subject TEXT,
    curriculum TEXT,
    grade INTEGER,
    prompt_version TEXT DEFAULT 'v1',
    is_current BOOLEAN DEFAULT true,
    generation_status TEXT DEFAULT 'pending' CHECK (generation_status IN ('pending','generating','completed','failed')),
    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pregen_lps_lookup ON pre_generated_lps USING btree (curriculum, grade, chapter_number) WHERE is_current = true;

-- Standardized region gating: a region's features turn on by config, not code.
CREATE TABLE IF NOT EXISTS region_features (
    region TEXT PRIMARY KEY,
    curriculum_key TEXT,
    supported_subjects TEXT[] DEFAULT '{}',
    has_textbooks BOOLEAN DEFAULT false,
    curriculum_lp_enabled BOOLEAN DEFAULT false,
    pic_lp_enabled BOOLEAN DEFAULT true,
    gamma_lp_enabled BOOLEAN DEFAULT true,
    default_framework TEXT DEFAULT 'oecd',
    supported_languages JSONB DEFAULT '["en"]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Key/value application settings — feature flags + A/B toggles read by the bot
-- (e.g. pic_lp_backend_ab routes the pic-to-LP backend between Kie.ai and
-- Gamma). `value` is JSONB so a toggle can store either a scalar or a split map.
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Pic-to-LP: tracks the multi-turn conversation when a teacher photographs
-- textbook page(s) and asks Rumi to generate a lesson plan from them. Mirrors
-- the coaching_sessions shape (status state machine, JSONB pages array,
-- correlation_id threading). expires_at carries the per-status TTL invariant
-- (set in pic-lp-session.service.js) so the stale-session sweeper can expire
-- abandoned non-terminal rows.
CREATE TABLE IF NOT EXISTS pic_lp_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN (
                        'awaiting_intent',
                        'collecting_pages',
                        'awaiting_form_submit',
                        'generating',
                        'handed_off',
                        'cancelled',
                        'timed_out',
                        'failed'
                    )),
    pages           JSONB NOT NULL DEFAULT '[]'::jsonb,
    caption         TEXT,
    detected        JSONB,
    flow_token      TEXT,
    lp_request_id   UUID,
    correlation_id  TEXT,
    last_error      TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot lookup: "does this user have an active pic-LP session?" — partial index
-- keeps it cheap (one active row per user max while they're mid-flow).
CREATE INDEX IF NOT EXISTS idx_pic_lp_sessions_user_active
    ON pic_lp_sessions (user_id, created_at DESC)
    WHERE status IN ('awaiting_intent','collecting_pages','awaiting_form_submit','generating');

CREATE INDEX IF NOT EXISTS idx_pic_lp_sessions_flow_token
    ON pic_lp_sessions (flow_token)
    WHERE flow_token IS NOT NULL;

-- Cheap "is this session past its TTL?" lookup for the stale-session worker.
-- Partial because terminal rows never need to be visited.
CREATE INDEX IF NOT EXISTS idx_pic_lp_sessions_expires_at_active
    ON pic_lp_sessions (expires_at)
    WHERE status IN ('awaiting_intent','collecting_pages','awaiting_form_submit','generating');

DROP TRIGGER IF EXISTS update_pic_lp_sessions_updated_at ON pic_lp_sessions;
CREATE TRIGGER update_pic_lp_sessions_updated_at
    BEFORE UPDATE ON pic_lp_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- QUIZ SUBSYSTEM
-- ============================================================================
-- Adaptive multiple-choice quizzes: a teacher sends a quiz to parents/students
-- over WhatsApp; answers are collected, scored, and a PDF report + post-quiz
-- AI chat + follow-up lesson-plan are offered. Four tables consolidated to
-- their final shape (status enums, distractor misconceptions, and report
-- columns all folded in).
--
-- NOTE: the related `students.parent_phone` column and the `lesson_plans`
-- quiz tracking columns (quiz_nudge_sent, quiz_id) are owned by those tables'
-- own definitions; the deferred-job queue (`scheduled_jobs`) and the
-- `increment_quiz_completions` RPC are out of scope for this set.

-- 1. quizzes — master quiz record per class
CREATE TABLE IF NOT EXISTS quizzes (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_plan_id           UUID REFERENCES lesson_plans(id) ON DELETE SET NULL,
    list_id                  UUID REFERENCES student_lists(id) ON DELETE SET NULL,
    quiz_source              TEXT NOT NULL DEFAULT 'lesson_plan',
    topic                    TEXT NOT NULL,
    grade                    TEXT,
    subject                  TEXT,
    source_content           TEXT,
    status                   TEXT NOT NULL DEFAULT 'generating'
                             CHECK (status = ANY (ARRAY['generating','ready','sent','report_sent','failed','cancelled'])),
    total_students_sent      INTEGER DEFAULT 0,
    total_students_completed INTEGER,
    report_scheduled_at      TIMESTAMPTZ,
    report_sent_at           TIMESTAMPTZ,
    report_pdf_url           TEXT,
    created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_teacher_id ON quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);

-- 2. quiz_questions — MCQ bank per quiz
CREATE TABLE IF NOT EXISTS quiz_questions (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id                   UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text             TEXT NOT NULL,
    option_a                  TEXT NOT NULL,
    option_b                  TEXT NOT NULL,
    option_c                  TEXT NOT NULL,
    correct_option            TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C')),
    explanation               TEXT,
    misconception_feedback    TEXT,
    distractor_misconceptions JSONB
                              CHECK (distractor_misconceptions IS NULL
                                     OR jsonb_typeof(distractor_misconceptions) = 'object'),
    difficulty_level          INTEGER NOT NULL DEFAULT 3 CHECK (difficulty_level BETWEEN 1 AND 5),
    sort_order                INTEGER DEFAULT 0,
    created_at                TIMESTAMPTZ DEFAULT now()
);

-- distractor_misconceptions: JSONB object {A?, B?, C?} mapping each wrong-option
-- letter to a 1-sentence label of the misconception it encodes. Only the wrong
-- options appear as keys. Generated by the quiz LLM; null on legacy rows.

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON quiz_questions(quiz_id, difficulty_level);

-- 3. quiz_sessions — one per student per quiz delivery
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id                  UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id               UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    parent_phone             TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'invited'
                             CHECK (status IN ('invited', 'active', 'completed', 'incomplete', 'expired', 'cancelled')),
    current_difficulty       INTEGER DEFAULT 3 CHECK (current_difficulty BETWEEN 1 AND 5),
    total_questions_answered INTEGER DEFAULT 0,
    correct_answers          INTEGER DEFAULT 0,
    mastery_percentage       INTEGER,
    mastery_level            TEXT CHECK (mastery_level IN ('mastered', 'developing', 'needs_practice')),
    expires_at               TIMESTAMPTZ NOT NULL,
    completed_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz_id ON quiz_sessions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_parent_phone ON quiz_sessions(parent_phone);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_status ON quiz_sessions(status);

-- 4. quiz_answers — individual student answers
CREATE TABLE IF NOT EXISTS quiz_answers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id           UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    selected_option       TEXT NOT NULL CHECK (selected_option IN ('A', 'B', 'C')),
    is_correct            BOOLEAN NOT NULL,
    difficulty_at_time    INTEGER,
    response_time_seconds INTEGER,
    created_at            TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_session_id ON quiz_answers(session_id);
