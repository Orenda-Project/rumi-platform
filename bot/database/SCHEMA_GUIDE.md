# Rumi Database Schema Guide

**Version:** v3.0
**Last Updated:** November 2025
**For:** Non-technical stakeholders

---

## Table of Contents

1. [What is a Database Schema?](#what-is-a-database-schema)
2. [Overview of Our Database](#overview-of-our-database)
3. [The Tables Explained](#the-tables-explained)
4. [Technical Decisions Explained](#technical-decisions-explained)
5. [How Tables Connect to Each Other](#how-tables-connect-to-each-other)
6. [Performance & Security](#performance--security)

---

## What is a Database Schema?

Think of a database schema as the **blueprint** for organizing all your data. Just like an architect creates a blueprint before building a house, we create a schema before storing data.

A schema defines:
- **What information** we'll store (like names, phone numbers, conversation history)
- **How it's organized** (into different "tables" - think of them as Excel spreadsheets)
- **How different pieces of information relate** to each other (like connecting a conversation to a specific user)

### Why Do We Need This?

Without a schema, our data would be messy and disorganized. The schema ensures:
- ✅ Data is stored consistently
- ✅ We can quickly find what we need
- ✅ Information doesn't get lost or duplicated
- ✅ We can track patterns and progress over time

---

## Overview of Our Database

Our Rumi WhatsApp Bot database is organized into **9 main tables** (plus one for tracking the schema version). Think of each table as a specialized filing cabinet:

| Table Name | What It Stores | Why It Matters |
|------------|----------------|----------------|
| **users** | Teacher information | Know who's using the bot |
| **conversations** | Chat history | Remember past conversations |
| **audio_sessions** | Voice message analysis | Track teaching practice recordings |
| **lesson_plans** | Generated lesson plans | Store all created content |
| **teacher_progress** | Skill improvement over time | Measure growth |
| **teacher_facts** | Personal context about teachers | Personalize coaching |
| **videos** | Educational video library | Recommend relevant resources |
| **failed_operations** | Errors and issues | Debug problems |
| **schema_versions** | Database version history | Track updates |

---

## The Tables Explained

Let's go through each table in detail, explaining what each field (column) means and why we included it.

---

### 1. `users` Table
**Purpose:** Store basic information about every teacher using the bot.

This is like the **registration form** every user fills out.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `a3f2c8d1-...` | Like a student ID number - identifies each user uniquely |
| `phone_number` | WhatsApp phone number | `+923001234567` | How we identify users on WhatsApp |
| `name` | Teacher's name | `Fatima Khan` | Personalize conversations |
| `grade` | Grade level they teach | `Grade 4-5` | Tailor content to appropriate level |
| `subject` | Subject they teach | `Math` | Provide subject-specific help |
| `registration_completed` | Have they finished setup? | `true` or `false` | Track onboarding status |
| `registration_started_at` | When they started registration | `2025-11-01 10:30:00` | Measure onboarding completion time |
| `registration_completed_at` | When they finished registration | `2025-11-01 10:35:00` | Track when fully onboarded |
| `created_at` | When user record was created | `2025-11-01 10:30:00` | Know when they first contacted bot |
| `updated_at` | Last time info was changed | `2025-11-02 14:20:00` | Track when profile was updated |

**Design Choice:** We use `phone_number` as the main way to identify users because WhatsApp users are identified by their phone numbers.

---

### 2. `conversations` Table
**Purpose:** Store every message exchanged between the teacher and the bot.

Think of this as a **complete chat transcript** that never gets deleted.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `b7d3e9f2-...` | Identify each message uniquely |
| `user_id` | Which user sent/received it | `a3f2c8d1-...` | Connect message to specific teacher |
| `role` | Who sent it | `user` or `assistant` | Know if teacher or bot sent message |
| `content` | The actual message | `I need help with lesson planning` | The text/transcript of the message |
| `message_type` | What kind of message | `text`, `voice`, `image` | Handle different message types |
| `created_at` | When message was sent | `2025-11-03 09:15:00` | Maintain conversation timeline |

**Why This Matters:**
- The bot can "remember" previous conversations
- We can analyze conversation patterns
- Teachers can see their chat history in the dashboard
- We can measure response quality over time

---

### 3. `audio_sessions` Table
**Purpose:** Store voice recordings of teaching practice and their analysis.

This is the **coaching session log** where we track voice feedback and analysis.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `c8e4f0g3-...` | Identify each recording session |
| `user_id` | Which teacher submitted it | `a3f2c8d1-...` | Connect recording to teacher |
| `audio_url` | Where audio file is stored | `https://r2.../audio.ogg` | Link to the actual recording |
| `audio_duration_seconds` | How long is the recording | `180` (3 minutes) | Track session length |
| `transcript` | Text version of audio | `Assalam-o-Alaikum students...` | Analyze what was said |
| `analysis_report` | AI-generated feedback | `{questioning: 4/5, pacing: 3/5...}` | Store structured coaching feedback |
| `voice_summary_url` | Audio summary in Urdu | `https://r2.../summary.mp3` | Link to generated audio feedback |
| `pdf_report_url` | PDF report | `https://r2.../report.pdf` | Link to downloadable report |
| `status` | Processing status | `completed`, `processing`, `failed` | Track if analysis is done |
| `created_at` | When audio was submitted | `2025-11-03 10:00:00` | Timeline of submissions |
| `completed_at` | When analysis finished | `2025-11-03 10:05:00` | Measure processing time |

**Why This Matters:**
- Core feature of coaching - analyzing teaching practice
- Provides structured feedback on teaching skills
- Tracks improvement over time
- Stores all outputs (transcript, analysis, audio summary, PDF)

**Technical Note:** `analysis_report` uses **JSONB** format, which means it stores structured data like:
```json
{
  "questioning": 4,
  "pacing": 3,
  "engagement": 5,
  "strengths": ["Good wait time", "Clear instructions"],
  "improvements": ["Ask more open-ended questions"]
}
```

---

### 4. `lesson_plans` Table
**Purpose:** Store all lesson plans and presentations created by the bot.

Think of this as a **content library** of everything the bot has generated for teachers.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `d9f5g1h4-...` | Identify each lesson plan |
| `user_id` | Who requested it | `a3f2c8d1-...` | Connect to teacher |
| `topic` | What the lesson is about | `Fractions for Grade 4` | Know what content covers |
| `grade` | Grade level | `Grade 4` | Filter by appropriate level |
| `subject` | Subject area | `Math` | Categorize by subject |
| `type` | What kind of content | `lesson_plan` or `presentation` | Differentiate content types |
| `gamma_url` | Link to Gamma.app presentation | `https://gamma.app/...` | Access the presentation |
| `content` | Full lesson plan structure | `{objectives: [...], activities: [...]}` | Store complete lesson details |
| `created_at` | When it was created | `2025-11-03 11:00:00` | Track content creation |

**Why This Matters:**
- Teachers can access all their past lesson plans
- Dashboard shows what content has been generated
- Can analyze what topics are most requested
- Teachers can reuse and adapt previous plans

---

### 5. `teacher_progress` Table
**Purpose:** Track how teachers improve over time across different teaching skills.

This is like a **growth report card** that measures progress in specific areas.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `e0g6h2i5-...` | Identify each measurement |
| `user_id` | Which teacher | `a3f2c8d1-...` | Track individual progress |
| `dimension` | Skill being measured | `questioning`, `pacing`, `engagement` | Categorize different skills |
| `score` | How well they're doing | `3.5` (on 0-5 scale) | Quantify performance |
| `evidence` | Specific examples | `"Asked 3 open-ended questions"` | Show what led to the score |
| `session_id` | Which recording this is from | `c8e4f0g3-...` | Link to specific audio session |
| `created_at` | When measured | `2025-11-03 10:05:00` | Track improvement timeline |

**Why This Matters:**
- Shows longitudinal growth (improvement over weeks/months)
- Identifies strengths and areas for improvement
- Provides evidence-based feedback
- Motivates teachers by showing progress

**Example Usage:**
If Teacher A submits 5 recordings over a month, we can see their "questioning" score improve from 2.5 → 3.0 → 3.5 → 4.0 → 4.5, showing clear improvement.

---

### 6. `teacher_facts` Table
**Purpose:** Store important personal information about each teacher to personalize coaching.

Think of this as the bot's **memory about each teacher** - their challenges, preferences, and context.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `f1h7i3j6-...` | Identify each fact |
| `user_id` | Which teacher | `a3f2c8d1-...` | Connect fact to teacher |
| `fact` | The actual information | `"Struggles with classroom management"` | Store specific knowledge |
| `category` | Type of information | `challenge`, `preference`, `context` | Organize different kinds of facts |
| `confidence` | How sure we are | `0.8` (80% confident) | Track reliability of information |
| `created_at` | When we learned this | `2025-11-03 11:00:00` | Know when fact was recorded |
| `updated_at` | Last time we updated it | `2025-11-04 09:00:00` | Track if fact changed |

**Why This Matters:**
- Bot can personalize responses based on what it knows
- Remembers teacher's specific challenges
- Avoids asking same questions repeatedly
- Provides context-aware coaching

**Example Facts:**
- `"Teaches in rural school with limited resources"` (category: context)
- `"Prefers lesson plans with minimal prep time"` (category: preference)
- `"Struggles with time management"` (category: challenge)

---

### 7. `videos` Table
**Purpose:** Store a library of educational videos that the bot can recommend.

This is the **video library** for the Media Agent to search through.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `g2i8j4k7-...` | Identify each video |
| `filename` | Original file name | `fractions_grade4.mp4` | Reference to file |
| `url` | Where video is stored | `https://storage.../video.mp4` | Access the video |
| `grade` | Grade level | `Grade 4` | Filter by grade |
| `subject` | Subject area | `Math` | Filter by subject |
| `topic` | Specific topic | `Fractions` | Search by topic |
| `source` | Where video came from | `Platform`, `Khan Academy` | Credit source |
| `created_at` | When added to library | `2025-10-15 00:00:00` | Track library growth |

**Why This Matters:**
- Bot can recommend relevant videos to teachers
- Searchable by grade, subject, and topic
- Expandable library over time
- Provides multimedia resources

---

### 8. `failed_operations` Table
**Purpose:** Log any errors or failures that occur in the system.

This is like an **error logbook** that helps us debug issues and improve the bot.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `id` | Unique identifier | `h3j9k5l8-...` | Identify each error |
| `user_id` | Which user experienced it | `+923001234567` | Know who was affected |
| `operation` | What was being attempted | `upload_audio`, `generate_lesson_plan` | Know what failed |
| `error_message` | What went wrong | `"Connection timeout to R2 storage"` | Understand the problem |
| `context` | Additional details | `{file_size: 5MB, duration: 180s}` | Extra debugging info |
| `created_at` | When error occurred | `2025-11-03 12:00:00` | Track error patterns |

**Why This Matters:**
- Helps developers fix bugs
- Identifies patterns in failures
- Ensures no user gets stuck without help
- Improves system reliability over time

**Design Choice:** This is like a "dead letter queue" - operations that failed get logged here so we can retry them or investigate issues.

---

### 9. `schema_versions` Table
**Purpose:** Track which version of the database structure is currently in use.

This is like a **version control system** for the database itself.

#### Fields:

| Field Name | What It Stores | Example | Why We Need It |
|------------|----------------|---------|----------------|
| `version` | Version number | `v3.0.0` | Know current schema version |
| `applied_at` | When this version was applied | `2025-11-03 08:00:00` | Track when updated |
| `description` | What changed | `Initial v3.0 schema with agent-based architecture` | Document changes |

**Why This Matters:**
- Know which version of database is running
- Track history of changes
- Help with troubleshooting
- Coordinate between code and database versions

---

## Technical Decisions Explained

Here are some technical choices we made and why they matter (explained simply):

### 1. **UUID vs. Regular Numbers for IDs**

**What we use:** `UUID` (Universally Unique Identifier)
**Example:** `a3f2c8d1-4b2a-4c7e-9d8f-1e2a3b4c5d6e`

**Why not just use 1, 2, 3...?**
- **Security:** UUIDs are impossible to guess (no one can guess the next ID)
- **Uniqueness:** Even if we have multiple servers, IDs will never conflict
- **Scalability:** Works better when system grows

**Real-world analogy:** It's like using a passport number instead of just numbering people 1, 2, 3 in your town. Passport numbers work globally and never conflict.

---

### 2. **VARCHAR vs. TEXT**

**VARCHAR(20):** Limited length (like `phone_number VARCHAR(20)`)
**TEXT:** Unlimited length (like `content TEXT`)

**Why use VARCHAR for phone numbers?**
- Phone numbers are always a predictable length
- Saves space and improves search speed
- Adds a safety check (can't accidentally store a novel in phone number field)

**Why use TEXT for messages?**
- Messages can be any length
- No artificial limit on what teachers can type

---

### 3. **JSONB Format**

**What it is:** A way to store structured data that can change shape.

**Example:**
```json
{
  "strengths": ["Clear voice", "Good pacing"],
  "improvements": ["Ask more questions"],
  "scores": {
    "questioning": 3,
    "engagement": 4
  }
}
```

**Why use it?**
- **Flexible:** Can store different structures for different users
- **Searchable:** Can search inside the JSON
- **Future-proof:** Easy to add new fields without changing table structure

**Real-world analogy:** It's like having a "notes" section where you can write whatever you want in any format, vs. having pre-printed forms with fixed fields.

---

### 4. **Timestamps (created_at, updated_at)**

**What:** Every record tracks when it was created and last updated.

**Why?**
- **Audit trail:** Know when things happened
- **Debugging:** Trace problems to specific times
- **Analytics:** Measure trends over time
- **User experience:** Show "2 days ago" in dashboard

**Automatic updates:** We set up "triggers" so `updated_at` automatically changes whenever a record is modified - no manual work needed!

---

### 5. **ON DELETE CASCADE**

**What this means:** If we delete a user, automatically delete all their data.

**Example:**
```sql
user_id UUID REFERENCES users(id) ON DELETE CASCADE
```

**Why?**
- **Data privacy:** If someone wants their account deleted, all their data goes too
- **Data consistency:** No "orphaned" records pointing to non-existent users
- **Legal compliance:** GDPR and similar laws require complete data deletion

**Real-world analogy:** Like deleting a folder - all files inside get deleted too.

---

### 6. **Indexes for Speed**

**What they are:** Special structures that make searches faster.

**Example:**
```sql
CREATE INDEX idx_users_phone ON users(phone_number);
```

**Why?**
Without an index, finding a user by phone number means checking every single record (like reading an entire book to find one name). With an index, it's instant (like using a book's index to jump to the right page).

**Where we use them:**
- Phone number lookups (very frequent)
- Getting user's conversation history (sorted by date)
- Finding lesson plans for a specific user
- Searching videos by grade and subject

**Trade-off:** Indexes make searches faster but take up extra space and make writes slightly slower. We only add them where speed matters most.

---

### 7. **Row Level Security (RLS)**

**What it is:** Security rules that control who can see what data.

**Current setup:**
- Bot uses `service_role` key, which has full access to everything
- Dashboard uses same key to show all users' data to admin
- Regular users can't directly access the database

**Why?**
- **Security:** Prevents unauthorized data access
- **Future-proofing:** When we add teacher-facing dashboard, we can set rules like "teachers can only see their own data"
- **Compliance:** Helps meet data protection requirements

---

## How Tables Connect to Each Other

Tables don't exist in isolation - they're connected through **relationships**. Here's how:

### 1. **One-to-Many Relationships**

**Concept:** One user can have many conversations, but each conversation belongs to exactly one user.

```
users (1) ←→ (Many) conversations
users (1) ←→ (Many) audio_sessions
users (1) ←→ (Many) lesson_plans
users (1) ←→ (Many) teacher_progress
users (1) ←→ (Many) teacher_facts
```

**Real-world analogy:** Like a teacher (one) having many students (many), but each student belongs to one teacher.

**How it works:** Each child table has a `user_id` field that points back to the `users` table.

---

### 2. **Linked Analysis**

**teacher_progress** links to **audio_sessions**:

```
audio_sessions (1) ←→ (Many) teacher_progress
```

**Why?**
One audio session can generate multiple progress measurements (one for questioning, one for pacing, one for engagement, etc.), but each measurement comes from a specific session.

**Example:**
```
Audio Session #1 (10 min recording) generates:
  → Progress entry: questioning = 3/5
  → Progress entry: pacing = 4/5
  → Progress entry: engagement = 5/5
```

---

### 3. **Visual Representation**

```
┌─────────────┐
│    users    │ (Central hub)
└──────┬──────┘
       │
       ├─────→ conversations
       ├─────→ audio_sessions ─────→ teacher_progress
       ├─────→ lesson_plans
       └─────→ teacher_facts

┌─────────────┐
│   videos    │ (Standalone library)
└─────────────┘

┌─────────────────────┐
│ failed_operations   │ (Error tracking)
└─────────────────────┘
```

---

## Performance & Security

### Performance Optimizations

We've added several features to make the database fast:

#### 1. **Indexes** (explained above)
These make searches instant instead of slow.

#### 2. **Efficient Data Types**
- Use `VARCHAR(20)` instead of `TEXT` for phone numbers (smaller = faster)
- Use `INTEGER` for duration instead of text like "3 minutes"
- Use `FLOAT` for scores instead of text like "3.5 out of 5"

#### 3. **Automatic Cleanup**
`ON DELETE CASCADE` means we don't accumulate useless orphaned records.

---

### Security Measures

#### 1. **Row Level Security (RLS)**
Prevents unauthorized data access even if someone gets database credentials.

#### 2. **Service Role Key**
Bot uses a special key that has permission to access all data. This key is:
- Stored securely as an environment variable
- Never exposed in code
- Rotatable (can be changed if compromised)

#### 3. **No Direct User Access**
Teachers interact only through the WhatsApp bot, never directly with the database.

#### 4. **UNIQUE Constraints**
Prevent duplicate phone numbers, prevent duplicate facts for the same user.

---

## Summary: Why This Schema Design?

### Design Goals

1. **Organized:** Clear separation between user info, conversations, audio sessions, content
2. **Scalable:** Can handle thousands of teachers and millions of messages
3. **Fast:** Indexes ensure quick lookups even with large data
4. **Secure:** Row Level Security protects sensitive data
5. **Flexible:** JSONB allows storing complex analysis without rigid structure
6. **Traceable:** Timestamps on everything for auditing and debugging
7. **Future-proof:** Easy to add new features without breaking existing system

### What This Enables

- **Personalized Coaching:** Remember each teacher's context and history
- **Progress Tracking:** Measure improvement over time across multiple dimensions
- **Content Library:** Store and retrieve lesson plans and presentations
- **Analytics Dashboard:** View stats, trends, and patterns
- **Reliable System:** Track and debug errors efficiently
- **Compliance:** Can delete user data completely if requested

---

## Questions?

If you have questions about any part of this schema, here are some resources:

- **Schema File:** `/shared/database/schema.sql` (the actual code)
- **Database Queries:** `/shared/database/queries.js` (how we fetch data)
- **Bot Helpers:** `/shared/database/bot-helpers.js` (how bot interacts with database)
- **Supabase Dashboard:** https://supabase.com/dashboard (view live data)

---

**Last Updated:** November 2025
**Maintained By:** Development Team
**Version:** v3.0
