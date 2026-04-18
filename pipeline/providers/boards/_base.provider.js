/**
 * BoardProvider interface — each provincial board implementation extends this.
 *
 * Implementations:
 *   stbb.provider.js   — Sindh Textbook Board (Pakistan)
 *   pctb.provider.js   — Punjab Curriculum & Textbook Board (TODO)
 *   kptbb.provider.js  — Khyber Pakhtunkhwa (TODO)
 *   tn-samacheer.provider.js — Tamil Nadu (TODO)
 *   edupub-lk.provider.js — Sri Lanka (TODO)
 *   tie-tz.provider.js — Tanzania (TODO)
 */

class BoardProvider {
  /**
   * List available textbooks for given filters.
   * @returns {Promise<Array<{id, title, grade, medium, subject, pdf_url, source_page, license_note}>>}
   */
  async list({ grade, medium, subject } = {}) { throw new Error('not implemented'); }

  /**
   * Download a textbook PDF.
   * @returns {Promise<{pdf_bytes: Buffer, checksum: string, fetched_at: Date}>}
   */
  async fetch(entry) { throw new Error('not implemented'); }

  /**
   * Verify downloaded PDF is valid.
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async verify(entry, pdf_bytes) { throw new Error('not implemented'); }
}

module.exports = { BoardProvider };
