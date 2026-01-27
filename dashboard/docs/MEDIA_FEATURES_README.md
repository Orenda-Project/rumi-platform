# Media Features for Digital Coach Dashboard

## Overview
This update adds media playback and document viewing capabilities to the Digital Coach Dashboard, allowing administrators to:
1. **Play voice notes** directly in the conversation viewer
2. **View PDF documents** (lesson plans, coaching reports) in an embedded viewer
3. **Access coaching session audio** and observation reports
4. **View generated lesson plans** and presentations

## New Features

### 1. Voice Note Playback
- Audio player embedded in conversation messages
- Support for all audio formats (ogg, mp3, m4a, etc.)
- Visual distinction with gradient audio player UI
- Both inline players (in messages) and global player (for coaching audio)

### 2. PDF Document Viewer
- Modal PDF viewer for reports and documents
- Full-screen viewing capability
- Support for:
  - Classroom observation reports
  - Generated lesson plans
  - Presentation PDFs
  - Any documents sent in conversations

### 3. Enhanced Conversation View
- **Three-tab interface:**
  - **Conversations Tab**: Chat history with media playback
  - **Coaching Sessions Tab**: Observation reports and audio recordings
  - **Lesson Plans Tab**: Generated teaching materials

### 4. Database Enhancements
- Added media URL columns to conversations table:
  - `media_url`: Direct link to media file (R2 storage)
  - `media_id`: WhatsApp media ID reference
  - `mime_type`: File type identification

## Setup Instructions

### 1. Apply Database Migration

Run the migration to add media columns:

```bash
cd rumi-dashboard
node scripts/apply-media-migration.js
```

Or apply manually in Supabase SQL editor:
```sql
-- Add media URL columns to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_media_id ON conversations(media_id);
CREATE INDEX IF NOT EXISTS idx_conversations_message_type ON conversations(message_type);
```

### 2. Update Environment Variables

Ensure your `.env` file has:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

### 3. Start the Dashboard

```bash
npm install
npm start
```

The dashboard will be available at `http://localhost:3000`

## File Structure

### New/Modified Files:
- `views/conversations.ejs` - Enhanced conversation view with media features
- `views/conversations-backup.ejs` - Backup of original view
- `database/queries.js` - Added functions for coaching sessions and lesson plans
- `database/migrations/001_add_media_urls_to_conversations.sql` - Migration file
- `scripts/apply-media-migration.js` - Migration application script
- `index.js` - Updated routes to fetch additional data

## Usage Guide

### Viewing Voice Notes
1. Navigate to **Users & Chats**
2. Select a user to view their conversation
3. Voice messages will show an audio player
4. Click play to listen directly in the browser

### Viewing PDFs
1. In conversations, click "View Document" on any document message
2. In Coaching Sessions tab, click "View Report" to see observation reports
3. In Lesson Plans tab, click "View PDF" to see generated materials
4. PDFs open in a full-screen modal viewer
5. Press ESC or click Close to exit

### Accessing Coaching Data
1. Navigate to a user's conversation page
2. Click on the "Coaching Sessions" tab
3. View:
   - Session status and scores
   - Play classroom audio recordings
   - View PDF observation reports

### Viewing Lesson Plans
1. Navigate to a user's conversation page
2. Click on the "Lesson Plans" tab
3. Access:
   - Generated lesson plan PDFs
   - Presentation PDFs
   - Links to edit in Gamma (if available)

## Technical Details

### Media Storage
- **Audio files**: Stored in Cloudflare R2 at paths like:
  - Voice notes: `voice_notes/{userId}/{sessionId}_{timestamp}.ogg`
  - Coaching audio: `classroom_audio/{userId}/{YYYY-MM}/{sessionId}_{timestamp}.ext`
- **PDF files**: Stored in R2 with direct access URLs
- URLs are stored in database columns for quick retrieval

### Browser Compatibility
- Audio playback: All modern browsers
- PDF viewing: Uses native browser PDF viewer
- Responsive design for mobile and desktop

### Security
- All media URLs require authentication
- Dashboard access controlled via session authentication
- Media files served over HTTPS

## Troubleshooting

### Audio Won't Play
- Check browser console for CORS errors
- Verify media URL is accessible
- Ensure audio format is supported by browser

### PDFs Not Loading
- Check if URL is properly formatted
- Verify CORS headers on storage service
- Try opening PDF URL directly in new tab

### Migration Fails
- Apply migration manually via Supabase dashboard
- Check database permissions
- Verify table exists

## Future Enhancements
- Download buttons for media files
- Audio waveform visualization
- PDF annotation capabilities
- Bulk export functionality
- Media file search/filtering

## Support
For issues or questions, please refer to the main Digital Coach documentation or create an issue in the repository.