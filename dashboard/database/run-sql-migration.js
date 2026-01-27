#!/usr/bin/env node
/**
 * Universal SQL Migration Runner
 *
 * Usage:
 *   node database/run-sql-migration.js <migration-file.sql>
 *
 * Example:
 *   node database/run-sql-migration.js database/migrations/002_add_user_funnel_columns.sql
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Connection configurations to try (in order)
// Note: Based on CLI error, the actual pooler is aws-1-ap-southeast-1, not aws-0-us-west-1
const CONNECTION_CONFIGS = [
  {
    name: 'Session Pooler (ap-southeast-1, Port 5432)',
    connectionString: `postgresql://postgres.${extractProjectRef()}:${process.env.SUPABASE_DB_PASSWORD}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  },
  {
    name: 'Transaction Pooler (ap-southeast-1, Port 6543)',
    connectionString: `postgresql://postgres.${extractProjectRef()}:${process.env.SUPABASE_DB_PASSWORD}@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false }
  },
  {
    name: 'Direct Connection (IPv6)',
    connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.${extractProjectRef()}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  }
];

function extractProjectRef() {
  // Extract project ref from SUPABASE_URL
  // e.g., https://your-project-ref.supabase.co -> your-project-ref
  const match = process.env.SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
}

async function testConnection(config) {
  const client = new Client(config);

  try {
    await client.connect();
    console.log(`✅ Connected using: ${config.name}`);
    return { client, config };
  } catch (error) {
    console.log(`❌ Failed with ${config.name}: ${error.message}`);
    return null;
  }
}

async function findWorkingConnection() {
  console.log('🔍 Testing connection configurations...\n');

  for (const config of CONNECTION_CONFIGS) {
    const result = await testConnection(config);
    if (result) {
      return result;
    }
  }

  throw new Error('❌ All connection methods failed. Please check your credentials.');
}

async function runMigration(sqlFilePath) {
  console.log('\n🚀 SQL Migration Runner\n');
  console.log('═'.repeat(60));

  // Validate inputs
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error('SUPABASE_DB_PASSWORD not found in .env file');
  }

  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL not found in .env file');
  }

  const projectRef = extractProjectRef();
  if (!projectRef) {
    throw new Error('Could not extract project reference from SUPABASE_URL');
  }

  console.log(`📦 Project: ${projectRef}`);
  console.log(`📄 SQL File: ${sqlFilePath}`);
  console.log('═'.repeat(60));
  console.log();

  // Read SQL file
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`SQL file not found: ${sqlFilePath}`);
  }

  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  console.log('📝 SQL Content:\n');
  console.log('─'.repeat(60));
  console.log(sqlContent);
  console.log('─'.repeat(60));
  console.log();

  // Find working connection
  const { client, config } = await findWorkingConnection();

  try {
    // Execute SQL
    console.log('\n⏳ Executing SQL...\n');

    const result = await client.query(sqlContent);

    console.log('✨ Migration completed successfully!');
    console.log(`   Rows affected: ${result.rowCount || 0}`);

    if (result.rows && result.rows.length > 0) {
      console.log('\n📊 Result:');
      console.table(result.rows);
    }

    console.log('\n✅ Done!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Main execution
const sqlFile = process.argv[2];

if (!sqlFile) {
  console.error('❌ Usage: node run-sql-migration.js <migration-file.sql>');
  console.error('\nExample:');
  console.error('  node database/run-sql-migration.js database/migrations/002_add_user_funnel_columns.sql');
  process.exit(1);
}

runMigration(sqlFile)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });
