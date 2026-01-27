# Database Migrations Guide

## Quick Start

### Run a Migration

```bash
node database/run-sql-migration.js database/migrations/your-migration.sql
```

### Create a New Migration

```bash
# Create manually
touch database/migrations/$(date +%Y%m%d%H%M%S)_your_migration.sql
```

## Available Tools

### 1. run-sql-migration.js
**Purpose**: Execute any SQL file against the database
**Usage**: `node database/run-sql-migration.js <path-to-sql-file>`
**Features**:
- Auto-detects best connection method
- Shows detailed output
- Handles complex migrations

### 2. verify-funnel-migration.js
**Purpose**: Verify funnel tracking tables exist
**Usage**: `node database/verify-funnel-migration.js`

## Connection Details

The migration runner auto-detects the best connection using environment variables:

**Environment Variables** (in `.env`):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `SUPABASE_DB_PASSWORD` - Database password (for direct connections)

## Migration Files

Located in `database/migrations/`:
- `001_create_funnel_tables.sql` - Creates website_visits, cta_clicks, chat_starts tables
- `002_add_user_funnel_columns.sql` - Adds funnel tracking to users table
