/**
 * Photo Prompt Service
 *
 * Builds the WhatsApp interactive buttons config for asking
 * the teacher if they want to share a classroom photo.
 *
 * Bead: bd-612 (Phase 1C-B)
 */

/**
 * Build the photo prompt interactive buttons config.
 *
 * @param {string} coachingSessionId - Session UUID
 * @param {string} language - User's language (en, ur, etc.)
 * @returns {{ body: string, buttons: Array<{id: string, title: string}> }}
 */
function buildPhotoPrompt(coachingSessionId, language = 'en') {
  const isUrdu = language === 'ur';

  return {
    body: isUrdu
      ? '📸 کیا آپ اپنی کلاس روم کی تصویر شیئر کرنا چاہیں گے؟ یہ تجزیے کو بہتر بنائے گی۔'
      : '📸 Would you like to share a classroom photo? It helps improve the analysis.',
    buttons: [
      { id: `photo_yes_${coachingSessionId}`, title: isUrdu ? 'ہاں' : 'Yes' },
      { id: `photo_no_${coachingSessionId}`, title: isUrdu ? 'نہیں' : 'No' },
    ],
  };
}

module.exports = { buildPhotoPrompt };
