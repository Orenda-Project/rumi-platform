/**
 * The bot's database client. Kept at this path because ~150 modules (and the
 * tests that jest.mock it) import it; the client itself — and the cold-boot
 * env-gate that exits 78 when database env vars are missing — lives in
 * services/db (DB_DRIVER=postgres | supabase).
 */

module.exports = require('../services/db');
