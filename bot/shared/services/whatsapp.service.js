const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID } = require('../utils/constants');
const { logToFile } = require('../utils/logger');
const { downloadFromR2, extractKeyFromUrl } = require('../storage/r2');

const ASSETS_BASE_URL = process.env.ASSETS_BASE_URL || 'https://your-domain.com/assets';

/**
 * WhatsApp Service
 * Handles all WhatsApp Cloud API interactions
 */
class WhatsAppService {
  /**
   * Remove emotion tags from text
   * @param {string} text - Text that may contain emotion tags like [warmly], [thoughtfully], etc.
   * @returns {string} Text with emotion tags removed
   * @private
   */
  static _removeEmotionTags(text) {
    // Remove emotion tags like [warmly], [thoughtfully], [enthusiastically], etc.
    // Also handles tags with spaces inside like [warm ly]
    return text.replace(/\[[a-zA-Z\s]+\]\s*/g, '').trim();
  }

  /**
   * Send a text message via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} message - Message text
   * @returns {Promise<boolean>}
   */
  static async sendMessage(to, message) {
    try {
      // Remove emotion tags from text messages (they're only for voice)
      const cleanMessage = this._removeEmotionTags(message);

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: cleanMessage },
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        console.error('Error sending message:', data);
        return false;
      }
      console.log('Message sent successfully:', data);
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      return false;
    }
  }

  /**
   * Send a reaction to a message
   * @param {string} to - Recipient phone number
   * @param {string} messageId - Message ID to react to
   * @param {string} emoji - Emoji to send (default: ❤️)
   * @returns {Promise<boolean>}
   */
  static async sendReaction(to, messageId, emoji = '❤️') {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'reaction',
            reaction: {
              message_id: messageId,
              emoji: emoji,
            },
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        logToFile('Error sending reaction', data);
        return false;
      }
      logToFile('Reaction sent successfully', { emoji, messageId });
      return true;
    } catch (error) {
      logToFile('Error sending reaction', { error: error.message });
      return false;
    }
  }

  /**
   * Show typing indicator and mark message as read
   * @param {string} to - Recipient phone number
   * @param {string} messageId - Message ID
   * @returns {Promise<boolean>}
   */
  static async showTypingIndicator(to, messageId) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
            typing_indicator: {
              type: 'text',
            },
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        logToFile('Error showing typing indicator', data);
        return false;
      }
      logToFile('Typing indicator shown');
      return true;
    } catch (error) {
      logToFile('Error showing typing indicator', { error: error.message });
      return false;
    }
  }

  /**
   * Start continuous typing indicator that lasts until response is sent
   * The typing indicator will be refreshed every 20 seconds to keep it active
   * @param {string} to - Recipient phone number
   * @param {string} messageId - Message ID
   * @returns {Object} Controller object with stop() method to stop the typing indicator
   */
  static startContinuousTypingIndicator(to, messageId) {
    // Show typing indicator immediately
    this.showTypingIndicator(to, messageId);

    // Refresh typing indicator every 20 seconds (before the 25 second timeout)
    const intervalId = setInterval(() => {
      this.showTypingIndicator(to, messageId);
    }, 20000); // 20 seconds

    // Return a controller object to stop the typing indicator
    return {
      stop: () => {
        clearInterval(intervalId);
        logToFile('Continuous typing indicator stopped');
      }
    };
  }

  /**
   * Get media metadata (including duration for audio/video files)
   * @param {string} mediaId - Media ID from WhatsApp
   * @returns {Promise<Object>} Media metadata including url, mime_type, size, and duration (for audio/video)
   */
  static async getMediaInfo(mediaId) {
    try {
      const mediaUrlResponse = await axios.get(
        `https://graph.facebook.com/v21.0/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          },
        }
      );

      return mediaUrlResponse.data;
    } catch (error) {
      console.error('Error getting WhatsApp media info:', error);
      throw error;
    }
  }

  /**
   * Download media from WhatsApp
   * @param {string} mediaId - Media ID from WhatsApp
   * @returns {Promise<Buffer>}
   */
  static async downloadMedia(mediaId) {
    try {
      // Get media URL
      const mediaInfo = await this.getMediaInfo(mediaId);
      const mediaUrl = mediaInfo.url;

      // Download media file
      const mediaResponse = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(mediaResponse.data);
    } catch (error) {
      console.error('Error downloading WhatsApp media:', error);
      throw error;
    }
  }

  /**
   * Send a document via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} filePath - Path to the document file
   * @param {string} filename - Filename to display
   * @param {string} caption - Document caption
   * @returns {Promise<boolean>}
   */
  static async sendDocument(to, filePath, filename, caption) {
    try {
      // Determine MIME type based on file extension (bd-196)
      const ext = filename.toLowerCase().split('.').pop();
      const mimeTypes = {
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      // Upload document to WhatsApp
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath), {
        contentType: contentType,
        filename: filename,
      });
      formData.append('messaging_product', 'whatsapp');

      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            ...formData.getHeaders(),
          },
        }
      );

      const mediaId = uploadResponse.data.id;

      // Send document message
      const sendResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'document',
          document: {
            id: mediaId,
            caption: caption,
            filename: filename
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logToFile('Document sent successfully', { response: sendResponse.data });
      return true;
    } catch (error) {
      logToFile('Error sending document', {
        error: error.message,
        errorDetails: error.response?.data
      });
      return false;
    }
  }

  /**
   * Send an audio message via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} tempDir - Temporary directory for files
   * @returns {Promise<boolean>}
   */
  static async sendAudio(to, audioBuffer, tempDir) {
    const path = require('path');

    try {
      // Save audio to temp file
      const audioPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
      fs.writeFileSync(audioPath, audioBuffer);

      // Upload media to WhatsApp
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath), {
        contentType: 'audio/mpeg',
        filename: 'audio.mp3',
      });
      formData.append('messaging_product', 'whatsapp');

      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            ...formData.getHeaders(),
          },
        }
      );

      const mediaId = uploadResponse.data.id;

      // Send audio message
      const sendResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'audio',
          audio: {
            id: mediaId,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Clean up temp file
      fs.unlinkSync(audioPath);

      logToFile('Audio message sent successfully', { response: sendResponse.data });
      return true;
    } catch (error) {
      logToFile('❌ Error sending audio message', {
        error: error.message,
        errorDetails: error.response?.data
      });
      return false;
    }
  }

  /**
   * Send a document from URL via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} documentUrl - URL of the document in R2 storage
   * @param {string} filename - Filename for the document
   * @param {string} caption - Optional caption
   * @returns {Promise<boolean>}
   */
  static async sendDocumentFromUrl(to, documentUrl, filename, caption) {
    const path = require('path');
    const tempDir = path.join(__dirname, '../../temp');

    try {
      // Extract R2 key from URL and download using R2 client
      logToFile('Downloading document from R2', { documentUrl });
      const key = extractKeyFromUrl(documentUrl);
      const documentBuffer = await downloadFromR2(key);

      // Save to temp file
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${filename}`);
      fs.writeFileSync(tempFilePath, documentBuffer);

      logToFile('Document downloaded from R2, sending to WhatsApp', { tempFilePath, size: documentBuffer.length });

      // Use existing sendDocument method
      const result = await this.sendDocument(to, tempFilePath, filename, caption);

      // Clean up temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      return result;
    } catch (error) {
      logToFile('❌ Error sending document from URL', {
        error: error.message,
        documentUrl,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send audio from URL via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} audioUrl - URL of the audio file in R2 storage
   * @returns {Promise<boolean>}
   */
  static async sendAudioFromUrl(to, audioUrl) {
    const path = require('path');
    const tempDir = path.join(__dirname, '../../temp');

    try {
      // Extract R2 key from URL and download using R2 client
      logToFile('Downloading audio from R2', { audioUrl });
      const key = extractKeyFromUrl(audioUrl);
      const audioBuffer = await downloadFromR2(key);

      logToFile('Audio downloaded from R2, sending to WhatsApp', { audioSize: audioBuffer.length });

      // Use existing sendAudio method
      return await this.sendAudio(to, audioBuffer, tempDir);
    } catch (error) {
      logToFile('❌ Error sending audio from URL', {
        error: error.message,
        audioUrl,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send a video message via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {Buffer} videoBuffer - Video file buffer
   * @param {string} tempDir - Temporary directory for files
   * @param {string} caption - Optional caption for the video
   * @returns {Promise<boolean>}
   */
  static async sendVideo(to, videoBuffer, tempDir, caption = '') {
    const path = require('path');

    try {
      // Save video to temp file
      const videoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
      fs.writeFileSync(videoPath, videoBuffer);

      logToFile('Uploading video to WhatsApp', { size: videoBuffer.length, path: videoPath });

      // Upload media to WhatsApp
      const formData = new FormData();
      formData.append('file', fs.createReadStream(videoPath), {
        contentType: 'video/mp4',
        filename: 'video.mp4',
      });
      formData.append('messaging_product', 'whatsapp');

      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            ...formData.getHeaders(),
          },
        }
      );

      const mediaId = uploadResponse.data.id;
      logToFile('Video uploaded to WhatsApp', { mediaId });

      // Send video message
      const messagePayload = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'video',
        video: {
          id: mediaId,
        },
      };

      // Add caption if provided
      if (caption) {
        messagePayload.video.caption = caption;
      }

      const sendResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        messagePayload,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Clean up temp file
      fs.unlinkSync(videoPath);

      logToFile('✅ Video message sent successfully', { response: sendResponse.data });
      return true;
    } catch (error) {
      logToFile('❌ Error sending video message', {
        error: error.message,
        errorDetails: error.response?.data
      });
      return false;
    }
  }

  /**
   * Send video from URL via WhatsApp (downloads from R2 first)
   * @param {string} to - Recipient phone number
   * @param {string} videoUrl - URL of the video file in R2 storage
   * @param {string} caption - Optional caption for the video
   * @returns {Promise<boolean>}
   */
  static async sendVideoFromUrl(to, videoUrl, caption = '') {
    const path = require('path');
    const tempDir = path.join(__dirname, '../../temp');

    try {
      // Extract R2 key from URL and download using R2 client
      logToFile('📹 Downloading video from R2', { videoUrl });
      const key = extractKeyFromUrl(videoUrl);
      const videoBuffer = await downloadFromR2(key);

      logToFile('Video downloaded from R2, sending to WhatsApp', { videoSize: videoBuffer.length });

      // Use existing sendVideo method
      return await this.sendVideo(to, videoBuffer, tempDir, caption);
    } catch (error) {
      logToFile('❌ Error sending video from URL', {
        error: error.message,
        videoUrl,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send an image via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} mediaIdOrPath - Either a WhatsApp media ID or path to image file
   * @param {string} caption - Optional caption
   * @returns {Promise<boolean>}
   */
  static async sendImage(to, mediaIdOrPath, caption = '') {
    const path = require('path');

    try {
      let mediaId;

      // Check if mediaIdOrPath is a file path or media ID
      // Media IDs are numeric strings, file paths contain slashes or backslashes
      const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');

      if (isFilePath) {
        // Upload image to WhatsApp
        logToFile('Uploading image from file', { path: mediaIdOrPath });
        const formData = new FormData();
        const ext = path.extname(mediaIdOrPath).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

        formData.append('file', fs.createReadStream(mediaIdOrPath), {
          contentType: contentType,
          filename: path.basename(mediaIdOrPath),
        });
        formData.append('messaging_product', 'whatsapp');

        const uploadResponse = await axios.post(
          `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              ...formData.getHeaders(),
            },
          }
        );

        mediaId = uploadResponse.data.id;
        logToFile('Image uploaded to WhatsApp', { mediaId });
      } else {
        // Use provided media ID
        mediaId = mediaIdOrPath;
        logToFile('Using cached image media ID', { mediaId });
      }

      // Send image message
      const sendResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'image',
          image: {
            id: mediaId,
            caption: caption,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logToFile('Image sent successfully', { response: sendResponse.data });
      return true;
    } catch (error) {
      logToFile('❌ Error sending image', {
        error: error.message,
        errorDetails: error.response?.data
      });
      return false;
    }
  }

  /**
   * Send an animated sticker via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} mediaIdOrPath - Either a WhatsApp media ID or path to WebP sticker file
   * @returns {Promise<boolean>}
   */
  static async sendSticker(to, mediaIdOrPath) {
    const path = require('path');

    try {
      let mediaId;

      // Check if mediaIdOrPath is a file path or media ID
      // Media IDs are numeric strings, file paths contain slashes or backslashes
      const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');

      if (isFilePath) {
        // Upload WebP sticker to WhatsApp
        logToFile('Uploading sticker from file', { path: mediaIdOrPath });
        const formData = new FormData();

        formData.append('file', fs.createReadStream(mediaIdOrPath), {
          contentType: 'image/webp',
          filename: path.basename(mediaIdOrPath),
        });
        formData.append('messaging_product', 'whatsapp');

        const uploadResponse = await axios.post(
          `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              ...formData.getHeaders(),
            },
          }
        );

        mediaId = uploadResponse.data.id;
        logToFile('Sticker uploaded to WhatsApp', { mediaId });
      } else {
        // Use provided media ID
        mediaId = mediaIdOrPath;
        logToFile('Using cached sticker media ID', { mediaId });
      }

      // Send sticker message
      const sendResponse = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'sticker',
          sticker: {
            id: mediaId
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logToFile('Sticker sent successfully', { response: sendResponse.data });
      return true;
    } catch (error) {
      logToFile('❌ Error sending sticker', {
        error: error.message,
        errorDetails: error.response?.data
      });
      return false;
    }
  }

  /**
   * Send an interactive button message via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {Object} options - Button message options
   * @param {string} options.body - Message body text
   * @param {Array<{id: string, title: string}>} options.buttons - Array of buttons (max 3)
   * @returns {Promise<boolean>}
   */
  static async sendInteractiveButtons(to, options) {
    try {
      const { body, buttons } = options;

      // WhatsApp allows max 3 buttons
      if (buttons.length > 3) {
        logToFile('⚠️ Too many buttons, WhatsApp allows max 3', { count: buttons.length });
        return false;
      }

      // Format buttons for WhatsApp API
      const formattedButtons = buttons.map(btn => ({
        type: 'reply',
        reply: {
          id: btn.id,
          title: btn.title.substring(0, 20) // WhatsApp button title max 20 chars
        }
      }));

      const response = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: body
            },
            action: {
              buttons: formattedButtons
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logToFile('Interactive button message sent successfully', { response: response.data });
      return true;
    } catch (error) {
      logToFile('❌ Error sending interactive button message', {
        error: error.message,
        errorDetails: error.response?.data
      });
      return false;
    }
  }

  /**
   * Send image with interactive reply buttons (for vocabulary questions)
   * Bug #7: Word-level comprehension assessment
   * Bug #14: Fixed R2 private URL issue - now downloads from R2 first, uploads to WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} imageUrl - URL of image (R2 or public URL)
   * @param {string} bodyText - Question text (e.g., "Which picture shows 'tree'?")
   * @param {Array<{id: string, title: string}>} buttons - Array of buttons (max 3)
   * @returns {Promise<boolean>}
   */
  static async sendImageWithButtons(to, imageUrl, bodyText, buttons) {
    const path = require('path');
    const tempDir = path.join(__dirname, '../../temp');

    try {
      // WhatsApp allows max 3 buttons
      if (buttons.length > 3) {
        logToFile('⚠️ Too many buttons for image message, WhatsApp allows max 3', { count: buttons.length });
        return false;
      }

      // Format buttons for WhatsApp API
      const formattedButtons = buttons.map(btn => ({
        type: 'reply',
        reply: {
          id: btn.id,
          title: btn.title.substring(0, 20) // WhatsApp button title max 20 chars
        }
      }));

      // Bug #14 Fix: Check if this is an R2 URL (private endpoint)
      // R2 URLs contain "r2.cloudflarestorage.com" - WhatsApp can't download from these
      // We need to download first, then upload to WhatsApp to get a media_id
      const isR2Url = imageUrl.includes('r2.cloudflarestorage.com');
      let imageHeader;

      if (isR2Url) {
        logToFile('📥 Downloading image from R2 (private URL)', { imageUrl });

        // Extract R2 key and download using credentials
        const key = extractKeyFromUrl(imageUrl);
        const imageBuffer = await downloadFromR2(key);

        // Save to temp file
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFilePath = path.join(tempDir, `vocab_${Date.now()}.png`);
        fs.writeFileSync(tempFilePath, imageBuffer);

        logToFile('📤 Uploading image to WhatsApp Media API', { size: imageBuffer.length });

        // Upload to WhatsApp Media API
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFilePath), {
          contentType: 'image/png',
          filename: 'vocabulary.png',
        });
        formData.append('messaging_product', 'whatsapp');

        const uploadResponse = await axios.post(
          `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              ...formData.getHeaders(),
            },
          }
        );

        const mediaId = uploadResponse.data.id;
        logToFile('✅ Image uploaded to WhatsApp', { mediaId });

        // Clean up temp file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }

        // Use media ID instead of link
        imageHeader = { id: mediaId };
      } else {
        // Public URL - WhatsApp can download directly
        imageHeader = { link: imageUrl };
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: {
            type: 'image',
            image: imageHeader
          },
          body: { text: bodyText },
          action: {
            buttons: formattedButtons
          }
        }
      };

      const response = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logToFile('✅ Image with buttons sent successfully', {
        response: response.data,
        imageUrl,
        usedMediaId: isR2Url,
        buttonCount: buttons.length
      });
      return true;
    } catch (error) {
      logToFile('❌ Error sending image with buttons', {
        error: error.message,
        errorDetails: error.response?.data,
        imageUrl
      });
      return false;
    }
  }

  /**
   * Send interactive list message (used for Reading Assessment)
   * Supports WhatsApp Interactive Lists with sections and rows
   * @param {string} to - WhatsApp phone number (with country code)
   * @param {object} listData - List configuration object
   * @returns {Promise<boolean>} Success status
   */
  static async sendInteractiveMessage(to, listData) {
    try {
      // Extract from nested structure (reading-assessment.service.js passes action.sections)
      const { header, body, footer, action } = listData;
      const { button, sections } = action || {};

      // Validate sections (WhatsApp allows max 10 sections, max 10 total rows)
      if (!sections || sections.length === 0) {
        logToFile('⚠️ No sections provided for interactive list', { listData });
        return false;
      }

      if (sections.length > 10) {
        logToFile('⚠️ Too many sections, WhatsApp allows max 10', { count: sections.length });
        return false;
      }

      // Count total rows across all sections
      const totalRows = sections.reduce((sum, section) => sum + (section.rows?.length || 0), 0);
      if (totalRows > 10) {
        logToFile('⚠️ Too many rows, WhatsApp allows max 10 total', { count: totalRows });
        return false;
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: body.text || body // Support both {text: '...'} and direct string
          },
          action: {
            button: button || 'Options',
            sections: sections
          }
        }
      };

      // Add optional header and footer
      if (header) {
        payload.interactive.header = {
          type: header.type || 'text',
          text: header.text || header // Support both {type: 'text', text: '...'} and direct string
        };
      }

      if (footer) {
        payload.interactive.footer = {
          text: footer.text || footer // Support both {text: '...'} and direct string
        };
      }

      const response = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logToFile('✅ Interactive list message sent successfully', { response: response.data });
      return true;
    } catch (error) {
      logToFile('❌ Error sending interactive list message', {
        error: error.message,
        errorDetails: error.response?.data
      });
      return false;
    }
  }

  /**
   * Send a WhatsApp Flow
   * @param {string} to - Recipient phone number
   * @param {object} flowData - Flow configuration
   * @param {string} flowData.flowId - Flow ID (e.g., '819028084215847')
   * @param {string} flowData.header - Header text
   * @param {string} flowData.body - Body text
   * @param {string} flowData.footer - Footer text (optional)
   * @param {string} flowData.buttonText - CTA button text (default: 'Start')
   * @param {string} flowData.screen - Initial screen to navigate to (default: 'READING_ASSESSMENT')
   * @param {string} flowData.flowToken - Custom flow token for data endpoint (optional, auto-generated if not provided)
   * @returns {Promise<boolean>} Success status
   */
  static async sendFlow(to, flowData) {
    try {
      const { flowId, header, body, footer, buttonText = 'Start', screen, flowToken } = flowData;

      if (!flowId) {
        logToFile('❌ Flow ID is required', { flowData });
        return false;
      }

      // Determine flow action mode (bd-191):
      // - If screen is specified: use 'navigate' with flow_action_payload.screen (static flows)
      // - If no screen but flowToken exists: use 'data_exchange' (endpoint-based flows with data_api_version 3.0+)
      const useDataExchange = !screen && flowToken;
      const flowAction = useDataExchange ? 'data_exchange' : 'navigate';

      const parameters = {
        flow_message_version: '3',
        flow_token: flowToken || `flow_${Date.now()}`,
        flow_id: flowId,
        flow_cta: buttonText,
        flow_action: flowAction
      };

      // Only add flow_action_payload with screen for navigate mode
      if (!useDataExchange) {
        parameters.flow_action_payload = {
          screen: screen || 'READING_ASSESSMENT' // Default for backward compatibility
        };
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: header ? { type: 'text', text: header } : undefined,
          body: { text: body },
          footer: footer ? { text: footer } : undefined,
          action: {
            name: 'flow',
            parameters: parameters
          }
        }
      };

      // Remove undefined fields
      if (!payload.interactive.header) delete payload.interactive.header;
      if (!payload.interactive.footer) delete payload.interactive.footer;

      logToFile('📤 Sending WhatsApp Flow', {
        to,
        flowId,
        header,
        body,
        hasCustomFlowToken: !!flowToken
      });

      const response = await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logToFile('✅ WhatsApp Flow sent successfully', {
        response: response.data,
        flowId
      });

      return true;
    } catch (error) {
      logToFile('❌ Error sending WhatsApp Flow', {
        error: error.message,
        errorDetails: error.response?.data,
        flowData
      });
      return false;
    }
  }

  /**
   * Send language selection interactive list
   * Allows users to choose their preferred language via /language command
   *
   * @param {string} to - Recipient phone number
   * @param {string} currentLanguage - User's current language for bilingual header
   * @returns {Promise<boolean>}
   */
  static async sendLanguageSelectionList(to, currentLanguage = 'en') {
    try {
      logToFile('Sending language selection list', { to, currentLanguage });

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
              type: 'list',
              header: {
                type: 'text',
                text: 'Select Language / زبان منتخب کریں'
              },
              body: {
                text: 'Choose your preferred language. I will respond in this language for all conversations.\n\nاپنی پسندیدہ زبان منتخب کریں۔'
              },
              footer: {
                text: 'You can change this anytime by typing /language'
              },
              action: {
                button: 'Languages',
                sections: [
                  {
                    title: 'Available Languages',
                    rows: [
                      { id: 'lang_auto', title: 'Auto-detect', description: 'Let me detect your language automatically' },
                      { id: 'lang_en', title: 'English', description: 'English language' },
                      { id: 'lang_ur', title: 'اردو', description: 'Urdu language' },
                      { id: 'lang_pa-PK', title: 'پنجابی', description: 'Punjabi (Shahmukhi)' },
                      { id: 'lang_sd-PK', title: 'سنڌي', description: 'Sindhi' },
                      { id: 'lang_ps-PK', title: 'پښتو', description: 'Pashto (Pakistani)' },
                      { id: 'lang_bal-PK', title: 'بلوچی', description: 'Balochi' },
                      { id: 'lang_ta-LK', title: 'தமிழ்', description: 'Tamil (Sri Lankan)' },
                      { id: 'lang_ar', title: 'العربية', description: 'Arabic' },
                      { id: 'lang_es', title: 'Español', description: 'Spanish' }
                    ]
                  }
                ]
              }
            }
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        logToFile('❌ Error sending language selection list', { error: data });
        return false;
      }

      logToFile('✅ Language selection list sent successfully', { messageId: data.messages?.[0]?.id });
      return true;
    } catch (error) {
      logToFile('❌ Error sending language selection list', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Build style carousel payload for video style selection
   * Issue #35: Video Style Selection via WhatsApp Carousel
   * @param {string} to - Recipient phone number
   * @returns {Object} WhatsApp template message payload
   */
  static buildStyleCarouselPayload(to) {
    const assetsBase = process.env.ASSETS_BASE_URL || '';
    // Issue #35: Style sample images stored in template (uploaded via Meta Business Suite)
    // The template uses pre-uploaded images, we just need to provide button payloads
    return {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'video_style_selection',
        language: { code: 'en' },
        components: [
          {
            type: 'CAROUSEL',
            cards: [
              // Card 1: Photorealistic
              {
                card_index: 0,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'image', image: { link: `${assetsBase}/carousel/style_photorealistic.png` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'style_photorealistic' }]
                  }
                ]
              },
              // Card 2: Infographic
              {
                card_index: 1,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'image', image: { link: `${assetsBase}/carousel/style_infographic.png` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'style_infographic' }]
                  }
                ]
              },
              // Card 3: Cartoon
              {
                card_index: 2,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'image', image: { link: `${assetsBase}/carousel/style_cartoon.png` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'style_cartoon' }]
                  }
                ]
              },
              // Card 4: Sketch
              {
                card_index: 3,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'image', image: { link: `${assetsBase}/carousel/style_sketch.png` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'style_sketch' }]
                  }
                ]
              }
            ]
          }
        ]
      }
    };
  }

  /**
   * Send style selection carousel for video generation
   * Issue #35: Video Style Selection via WhatsApp Carousel
   * Falls back to interactive list if carousel template fails
   * @param {string} to - Recipient phone number
   * @returns {Promise<boolean>}
   */
  static async sendStyleCarousel(to) {
    try {
      const payload = this.buildStyleCarouselPayload(to);

      logToFile('Attempting to send style carousel template', {
        to,
        templateName: 'video_style_selection'
      });

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logToFile('❌ Style carousel template FAILED - using fallback list', {
          to,
          errorCode: data.error?.code,
          errorMessage: data.error?.message,
          errorDetails: data.error?.error_data?.details
        });

        // Fallback to interactive list (no images, but always works)
        return await this.sendStyleListFallback(to);
      }

      logToFile('✅ Style carousel sent successfully', {
        to,
        messageId: data.messages?.[0]?.id
      });
      return true;
    } catch (error) {
      logToFile('❌ Style carousel exception - using fallback list', {
        to,
        error: error.message,
        stack: error.stack
      });

      // Fallback to interactive list on any exception
      return await this.sendStyleListFallback(to);
    }
  }

  /**
   * Fallback: Send style selection as interactive list (no images)
   * Used when carousel template fails (template not approved, rate limited, etc.)
   * Issue #35: Fallback for carousel template failures
   * @param {string} to - Recipient phone number
   * @returns {Promise<boolean>}
   */
  static async sendStyleListFallback(to) {
    try {
      logToFile('Sending style selection via interactive list fallback', { to });

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: '🎨 Choose Video Style'
          },
          body: {
            text: 'Select a visual style for your educational video. Each style creates a different look and feel.'
          },
          footer: {
            text: 'Tap to see options'
          },
          action: {
            button: 'View Styles',
            sections: [
              {
                title: 'Video Styles',
                rows: [
                  {
                    id: 'style_photorealistic',
                    title: 'Photorealistic',
                    description: 'Camera-quality, HDR, 8K realistic images'
                  },
                  {
                    id: 'style_infographic',
                    title: 'Infographic',
                    description: 'TED-Ed/Kurzgesagt flat vector style'
                  },
                  {
                    id: 'style_cartoon',
                    title: 'Cartoon',
                    description: 'Pixar-inspired animated characters'
                  },
                  {
                    id: 'style_sketch',
                    title: 'Sketch',
                    description: 'Whiteboard hand-drawn style'
                  }
                ]
              }
            ]
          }
        }
      };

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logToFile('❌ Style list fallback also FAILED', {
          to,
          errorCode: data.error?.code,
          errorMessage: data.error?.message
        });
        return false;
      }

      logToFile('✅ Style list fallback sent successfully', {
        to,
        messageId: data.messages?.[0]?.id
      });
      return true;
    } catch (error) {
      logToFile('❌ Style list fallback exception', {
        to,
        error: error.message
      });
      return false;
    }
  }

  // ============================================================================
  // Feature Menu Carousel Methods
  // ============================================================================

  /**
   * Feature video header handles from Resumable Upload API
   * These are used when SENDING the carousel template
   * Uploaded via: STAGING=true node scripts/templates/upload-menu-videos.js
   */
  static FEATURE_VIDEO_HANDLES = {
    lesson_plan: '4:bGVzc29uX3BsYW5fZmVhdHVyZV92Nl8yLjV4Lm1wNA==:dmlkZW8vbXA0:ARav8vOKJTl5fnsg-nyyevkOuJ6IUNuVnBK7dpP7ovG1JQLDtdoLbCUKPR19cCvnTiG_MMS32k59APiBaDeOMHtZaARSn3A1mVPS1O3vaGQRxw:e:1767013579:2002410153890842:100089382537557:ARZS6wFbgGvGa7H0wsg',
    coaching: '4:Y29hY2hpbmdfZmVhdHVyZV92aWRlby5tcDQ=:dmlkZW8vbXA0:ARYspNEUJd49DiAZgZuDbHWKHzFjMpYafHMMrYoUDLTdt-xSXHo9wMZxuPZLyJW1ADiofQ-Z5mL7WC-j-unLohNTLj1X0XvO2-nVIycdtQDTjQ:e:1767013583:2002410153890842:100089382537557:ARZtLT_ZnRdQFfjPmKw',
    reading: '4:cmVhZGluZ19mZWF0dXJlX3ZpZGVvXzIuNXgubXA0:dmlkZW8vbXA0:ARZ3vuitHyzNqImAOjoyY07n_JtcAmVFF0iK_q082zoFg3Z0Id9bxI40Dt0z2cUDVMqKKLkpzGonh2vkQkRBGK4fZqrrVNSn7DW4ctDuzhnUQg:e:1767013588:2002410153890842:100089382537557:ARatYbIdUUYco3hSeoU'
  };

  /**
   * Build feature menu carousel payload
   * Follows same pattern as buildStyleCarouselPayload - includes HEADER params
   * @param {string} to - Recipient phone number
   * @returns {Object} WhatsApp template message payload
   */
  static buildFeatureMenuCarouselPayload(to) {
    // v3: 4 cards - Lesson Plans, Video Generation, Coaching, Reading
    return {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'feature_menu_carousel_v3',
        language: { code: 'en' },
        components: [
          {
            type: 'CAROUSEL',
            cards: [
              // Card 1: Lesson Plans
              {
                card_index: 0,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'video', video: { link: `${ASSETS_BASE_URL}/videos/lesson-plans.mp4` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'menu_lesson_plan' }]
                  }
                ]
              },
              // Card 2: Video Generation
              {
                card_index: 1,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'video', video: { link: `${ASSETS_BASE_URL}/videos/video-generation-v2.mp4` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'menu_video' }]
                  }
                ]
              },
              // Card 3: Classroom Coaching
              {
                card_index: 2,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'video', video: { link: `${ASSETS_BASE_URL}/videos/classroom-coaching.mp4` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'menu_coaching' }]
                  }
                ]
              },
              // Card 4: Reading Assessment
              {
                card_index: 3,
                components: [
                  {
                    type: 'HEADER',
                    parameters: [{ type: 'video', video: { link: `${ASSETS_BASE_URL}/videos/reading-assessment.mp4` } }]
                  },
                  {
                    type: 'BUTTON',
                    sub_type: 'QUICK_REPLY',
                    index: 0,
                    parameters: [{ type: 'payload', payload: 'menu_reading' }]
                  }
                ]
              }
            ]
          }
        ]
      }
    };
  }

  /**
   * Send feature menu carousel
   * @param {string} to - Recipient phone number
   * @returns {Promise<boolean>}
   */
  static async sendFeatureMenuCarousel(to) {
    try {
      logToFile('Sending feature menu carousel', { to });

      const payload = this.buildFeatureMenuCarouselPayload(to);

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logToFile('❌ Feature menu carousel failed, using fallback', {
          to,
          error: data.error?.message || 'Unknown error',
          errorCode: data.error?.code,
          errorDetails: JSON.stringify(data.error)
        });
        return await this.sendFeatureMenuListFallback(to);
      }

      logToFile('✅ Feature menu carousel sent successfully', {
        to,
        messageId: data.messages?.[0]?.id
      });
      return true;
    } catch (error) {
      logToFile('❌ Feature menu carousel exception', {
        to,
        error: error.message
      });
      return await this.sendFeatureMenuListFallback(to);
    }
  }

  /**
   * Fallback: Send feature menu as interactive list (no videos)
   * Used when carousel template is not approved or fails
   * @param {string} to - Recipient phone number
   * @returns {Promise<boolean>}
   */
  static async sendFeatureMenuListFallback(to) {
    try {
      logToFile('Sending feature menu list fallback', { to });

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: "Here's what I can do!"
          },
          body: {
            text: "I'm your Digital Coach. I can help you with lesson plans, classroom coaching, reading assessments, and more. Choose a feature to get started:"
          },
          footer: {
            text: 'Tap to see options'
          },
          action: {
            button: 'View Features',
            sections: [
              {
                title: 'My Features',
                rows: [
                  {
                    id: 'menu_lesson_plan',
                    title: 'Lesson Plans',
                    description: 'Create detailed PDF lesson plans'
                  },
                  {
                    id: 'menu_coaching',
                    title: 'Classroom Coaching',
                    description: 'Get teaching feedback from recordings'
                  },
                  {
                    id: 'menu_reading',
                    title: 'Reading Assessment',
                    description: 'Test student reading fluency'
                  },
                  {
                    id: 'menu_video',
                    title: 'AI Video Generation',
                    description: 'Create educational videos'
                  },
                  {
                    id: 'menu_other',
                    title: 'Ask Anything',
                    description: 'General teaching questions'
                  }
                ]
              }
            ]
          }
        }
      };

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logToFile('❌ Feature menu list fallback failed', {
          to,
          error: data.error?.message || 'Unknown error',
          errorCode: data.error?.code,
          errorDetails: JSON.stringify(data.error),
          status: response.status
        });
        return false;
      }

      logToFile('✅ Feature menu list fallback sent', {
        to,
        messageId: data.messages?.[0]?.id
      });
      return true;
    } catch (error) {
      logToFile('❌ Feature menu list fallback exception', {
        to,
        error: error.message
      });
      return false;
    }
  }
}

module.exports = WhatsAppService;
module.exports.buildStyleCarouselPayload = WhatsAppService.buildStyleCarouselPayload;
module.exports.sendStyleCarousel = WhatsAppService.sendStyleCarousel;
module.exports.sendStyleListFallback = WhatsAppService.sendStyleListFallback;
module.exports.sendFeatureMenuCarousel = WhatsAppService.sendFeatureMenuCarousel;
module.exports.sendFeatureMenuListFallback = WhatsAppService.sendFeatureMenuListFallback;
