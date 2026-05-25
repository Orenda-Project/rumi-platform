/**
 * LP Shelf Service (Phase 8.D polymorphic shape)
 *
 * Holds the last 5 lesson plans a teacher has had delivered, in chronological
 * order (oldest first → newest last). Powers stateful Q&A across multi-LP
 * conversations.
 *
 * Design:
 *   - Cap: 5, FIFO drop oldest on overflow
 *   - TTL: 24h sliding (bumped on every read or write)
 *   - Order: newest at the END (cache-friendly + LLM-attention-friendly)
 *   - Flush: on coaching/quiz/video session start (defensive); on LLM-detected
 *     topic switch; on natural 24h expiry
 *
 * Polymorphic entries (Phase 8.D):
 *
 *   Segment shape (existing, delivery_type implicit):
 *     {
 *       segment_id, grade, subject, chapter_number, chapter_title, topic,
 *       voicenote_prompt, voicenote_r2_key, lesson_plan_id, delivered_at
 *     }
 *
 *   Chapter shape (chapter-heart Q&A):
 *     {
 *       delivery_type: 'chapter',
 *       chapter_id, grade, subject, chapter_number, chapter_title,
 *       chapter_heart_text,                  // Tier 1 — in-prompt every turn
 *       chapter_heart_voicenote_r2_key,
 *       segment_ids: [...],                  // ordered lp_segments.id list,
 *                                            //   used by chapter-day-loader
 *                                            //   for tool-call get_day_detail
 *       lesson_plan_id, delivered_at
 *     }
 *
 * Readers branch via `LPShelfService.getDeliveryType(entry)` — defaults to
 * 'segment' when the discriminator is absent (backward compat for entries
 * pushed before the polymorphic shape landed).
 *
 * Existing Redis pattern: extends `lp_request:{userId}` (TTL 600s) which already
 * lives in this codebase. New key `lp_shelf:{userId}` with longer TTL holds
 * richer state.
 */

const redis = require('./cache/railway-redis.service');
const { logEvent } = require('../utils/structured-logger');

const SHELF_TTL_SECS = 86400;     // 24h sliding
const SHELF_CAP      = 5;         // cap at 5, FIFO drop oldest on overflow

class LPShelfService {
  static key(userId) {
    return `lp_shelf:${userId}`;
  }

  /**
   * Get the delivery_type discriminator for a shelf entry.
   * Defaults to 'segment' when absent so pre- entries (and any handler
   * that forgets to set the field) keep working.
   * @param {Object|null|undefined} entry
   * @returns {'segment'|'chapter'}
   */
  static getDeliveryType(entry) {
    if (!entry || typeof entry !== 'object') return 'segment';
    return entry.delivery_type === 'chapter' ? 'chapter' : 'segment';
  }

  /**
   * Push a new LP onto the shelf (appended LAST). Evicts oldest if over cap.
   * Accepts either segment-shaped or chapter-shaped entries — see header for
   * shape contracts.
   * @param {string} userId
   * @param {Object} entry - segment shape OR chapter shape
   */
  static async pushToShelf(userId, entry) {
    const shelf = await this._loadShelf(userId);
    shelf.push(entry);
    if (shelf.length > SHELF_CAP) {
      shelf.splice(0, shelf.length - SHELF_CAP);   // FIFO drop oldest
    }
    // redis.set auto-serialises arrays/objects to JSON
    await redis.set(this.key(userId), shelf, SHELF_TTL_SECS);
    logEvent('lp_shelf.pushed', {
      userId,
      delivery_type: this.getDeliveryType(entry),
      segment_id: entry?.segment_id,        // populated for segment entries
      chapter_id: entry?.chapter_id,        // populated for chapter entries
      shelfSize: shelf.length,
    });
  }

  /**
   * Get the current shelf (oldest first → newest last).
   * Bumps TTL to 24h on read (sliding window) — only if shelf is non-empty.
   * @param {string} userId
   * @returns {Promise<Array<Object>>} shelf entries; [] if empty/missing
   */
  static async getShelf(userId) {
    const shelf = await this._loadShelf(userId);
    if (shelf.length > 0) {
      // Sliding TTL — keep the shelf warm while she's actively using it
      await redis.expire(this.key(userId), SHELF_TTL_SECS);
    }
    return shelf;
  }

  /**
   * Drop the entire shelf. Called on:
   *  - Coaching/quiz/video session start (defensive flush)
   *  - LLM-detected topic switch (`TOPIC_SWITCH:<feature>`)
   * @param {string} userId
   */
  static async flushShelf(userId) {
    await redis.del(this.key(userId));
    logEvent('lp_shelf.flushed', { userId });
  }

  /**
   * Internal: load shelf from Redis, returning [] for missing/corrupt data.
   * redis.get auto-parses JSON; we defensively coerce to [] if it's not an array.
   */
  static async _loadShelf(userId) {
    const data = await redis.get(this.key(userId));
    return Array.isArray(data) ? data : [];
  }
}

module.exports = LPShelfService;
