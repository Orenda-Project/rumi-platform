-- Migration: Create release_notes table for public changelog
-- Created: December 25, 2025

CREATE TABLE IF NOT EXISTS release_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    details TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'feature',
    environment VARCHAR(20) NOT NULL DEFAULT 'staging',
    icon VARCHAR(50) DEFAULT 'sparkles',
    is_highlighted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100) DEFAULT 'release-notes-agent'
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_release_notes_env_date ON release_notes(environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_notes_category ON release_notes(category);

-- Add check constraint for valid categories
ALTER TABLE release_notes
ADD CONSTRAINT chk_category
CHECK (category IN ('feature', 'improvement', 'fix', 'announcement'));

-- Add check constraint for valid environments
ALTER TABLE release_notes
ADD CONSTRAINT chk_environment
CHECK (environment IN ('staging', 'production'));

-- Insert initial sample data
INSERT INTO release_notes (version, title, description, details, category, environment, icon, is_highlighted)
VALUES
  ('2.9.25',
   'I remember your work now!',
   'No more forgetting what we were working on. Ask me about your lesson plans, coaching sessions, or videos anytime.',
   'I used to lose track of our conversations when my server restarted. Now your history is safely stored and I can pick up right where we left off. Try saying "show me my last lesson plan" or "how did my coaching session go?"',
   'feature',
   'staging',
   'brain',
   true),

  ('2.9.24',
   'Getting started is now super quick!',
   'I only ask what to call you - no more long forms. Jump straight into creating!',
   'The old 5-question registration form is gone. Now you can start creating lesson plans or getting coaching feedback right away.',
   'improvement',
   'production',
   'zap',
   false),

  ('2.9.20',
   'I made intro videos for you!',
   'Quick 30-second videos show you what each feature does. Skip them anytime if you already know.',
   'When you try a feature for the first time, I share a short video introduction. Perfect for new teachers, and easy to skip for pros.',
   'feature',
   'production',
   'film',
   false),

  ('2.9.18',
   'I now understand 9 languages!',
   'Speak to me in Urdu, Balochi, Sindhi, Pashto, Punjabi, Tamil, Arabic, Spanish, or English.',
   'My voice recognition got much smarter. I can now transcribe your voice messages in regional Pakistani languages, plus Arabic, Spanish, and English.',
   'feature',
   'production',
   'globe',
   true);

COMMENT ON TABLE release_notes IS 'Public changelog entries written from Rumi perspective for user-friendly display';
