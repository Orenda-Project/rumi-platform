/**
 * STBB — Sindh Textbook Board (Pakistan) provider
 *
 * MVP implementation: books already on disk, so list()/fetch() are pass-through.
 * Real scraping (from stbb.edu.pk + Wayback fallback) is Phase 5 work.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BoardProvider } = require('./_base.provider');

class STBBProvider extends BoardProvider {
  constructor(opts = {}) {
    super();
    this.localRoot = opts.localRoot || path.resolve('books/sindh');
  }

  async list({ grade, medium, subject } = {}) {
    // MVP: books pre-registered via config/sindh-g1-g5.yaml. This method is a noop
    // until we implement real scraping.
    return [];
  }

  async fetch(entry) {
    const p = path.resolve(entry.path);
    if (!fs.existsSync(p)) throw new Error(`STBB fetch: file missing ${p}`);
    const bytes = fs.readFileSync(p);
    return {
      pdf_bytes: bytes,
      checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
      fetched_at: new Date(),
    };
  }

  async verify(entry, pdf_bytes) {
    if (pdf_bytes.length < 100_000) return { valid: false, reason: 'file too small (<100KB)' };
    if (!pdf_bytes.slice(0, 4).toString().startsWith('%PDF')) return { valid: false, reason: 'not a PDF' };
    return { valid: true };
  }
}

module.exports = { STBBProvider };
