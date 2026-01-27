/**
 * WhatsApp Flow Encryption Service
 *
 * Handles end-to-end encryption for WhatsApp Flows with data_api_version 3.0+
 *
 * Flow:
 * 1. WhatsApp sends encrypted payload: { encrypted_flow_data, encrypted_aes_key, initial_vector }
 * 2. Decrypt AES key using RSA private key
 * 3. Decrypt payload using AES-128-GCM
 * 4. Process request, generate response
 * 5. Encrypt response using flipped IV + AES key
 * 6. Return Base64 encoded response
 *
 * Bead: bd-186
 * Created: January 25, 2026
 *
 * References:
 * - https://docs.360dialog.com/docs/waba-messaging/flows
 * - https://n8n.io/workflows/3973-create-secure-interactive-applications-with-whatsapp-flows-end-to-end-encryption/
 */

const crypto = require('crypto');
const { logToFile } = require('../utils/logger');

// Environment variables for encryption keys
// Keys can be stored either directly or base64 encoded (for easier env var handling)
function getPrivateKey() {
  // Try direct key first
  if (process.env.FLOW_PRIVATE_KEY && process.env.FLOW_PRIVATE_KEY.includes('BEGIN PRIVATE KEY')) {
    return process.env.FLOW_PRIVATE_KEY;
  }
  // Try base64 encoded key
  if (process.env.FLOW_PRIVATE_KEY_B64) {
    return Buffer.from(process.env.FLOW_PRIVATE_KEY_B64, 'base64').toString('utf8');
  }
  return '';
}

function getPublicKey() {
  // Try direct key first
  if (process.env.FLOW_PUBLIC_KEY && process.env.FLOW_PUBLIC_KEY.includes('BEGIN PUBLIC KEY')) {
    return process.env.FLOW_PUBLIC_KEY;
  }
  // Try base64 encoded key
  if (process.env.FLOW_PUBLIC_KEY_B64) {
    return Buffer.from(process.env.FLOW_PUBLIC_KEY_B64, 'base64').toString('utf8');
  }
  return '';
}

// Lazy-load keys at runtime (not at module load time)
let _privateKey = null;
let _publicKey = null;

function getFlowPrivateKey() {
  if (_privateKey === null) {
    _privateKey = getPrivateKey();
  }
  return _privateKey;
}

function getFlowPublicKey() {
  if (_publicKey === null) {
    _publicKey = getPublicKey();
  }
  return _publicKey;
}

/**
 * Flip IV bytes for response encryption (XOR 0xFF each byte)
 * @param {Buffer} iv - Original initialization vector
 * @returns {Buffer} - Flipped IV
 */
function flipIV(iv) {
  const flipped = Buffer.alloc(iv.length);
  for (let i = 0; i < iv.length; i++) {
    flipped[i] = iv[i] ^ 0xFF;
  }
  return flipped;
}

/**
 * Decrypt the AES key using RSA private key
 * @param {string} encryptedAesKeyBase64 - Base64 encoded encrypted AES key
 * @returns {Buffer} - Decrypted AES key
 */
function decryptAesKey(encryptedAesKeyBase64) {
  const privateKey = getFlowPrivateKey();
  if (!privateKey) {
    throw new Error('FLOW_PRIVATE_KEY not configured');
  }

  const encryptedAesKey = Buffer.from(encryptedAesKeyBase64, 'base64');

  const decryptedKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedAesKey
  );

  return decryptedKey;
}

/**
 * Decrypt the flow data using AES-128-GCM
 * @param {string} encryptedDataBase64 - Base64 encoded encrypted data
 * @param {Buffer} aesKey - Decrypted AES key
 * @param {Buffer} iv - Initialization vector
 * @returns {Object} - Decrypted JSON payload
 */
function decryptFlowData(encryptedDataBase64, aesKey, iv) {
  const encryptedData = Buffer.from(encryptedDataBase64, 'base64');

  // Last 16 bytes are the auth tag
  const authTag = encryptedData.slice(-16);
  const ciphertext = encryptedData.slice(0, -16);

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Encrypt the response using AES-128-GCM with flipped IV
 * @param {Object} response - Response object to encrypt
 * @param {Buffer} aesKey - AES key (same as used for decryption)
 * @param {Buffer} iv - Original IV (will be flipped)
 * @returns {string} - Base64 encoded encrypted response
 */
function encryptResponse(response, aesKey, iv) {
  const flippedIV = flipIV(iv);
  const responseStr = JSON.stringify(response);

  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIV);

  let encrypted = cipher.update(responseStr, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Append auth tag
  const authTag = cipher.getAuthTag();
  const result = Buffer.concat([encrypted, authTag]);

  return result.toString('base64');
}

/**
 * Process an encrypted WhatsApp Flow request
 * @param {Object} encryptedRequest - { encrypted_flow_data, encrypted_aes_key, initial_vector }
 * @param {Function} handler - Function to handle decrypted request and return response
 * @returns {string} - Base64 encoded encrypted response
 */
async function processEncryptedRequest(encryptedRequest, handler) {
  const { encrypted_flow_data, encrypted_aes_key, initial_vector } = encryptedRequest;

  logToFile('Processing encrypted flow request', {
    hasFlowData: !!encrypted_flow_data,
    hasAesKey: !!encrypted_aes_key,
    hasIV: !!initial_vector,
  });

  // Decode IV
  const iv = Buffer.from(initial_vector, 'base64');

  // Decrypt AES key using RSA private key
  const aesKey = decryptAesKey(encrypted_aes_key);

  // Decrypt flow data
  const decryptedData = decryptFlowData(encrypted_flow_data, aesKey, iv);

  logToFile('Decrypted flow data', {
    action: decryptedData.action,
    screen: decryptedData.screen,
    flow_token: decryptedData.flow_token ? 'present' : 'missing',
  });

  // Call handler to process request and get response
  const response = await handler(decryptedData);

  // Encrypt response
  const encryptedResponse = encryptResponse(response, aesKey, iv);

  logToFile('Encrypted flow response', {
    responseLength: encryptedResponse.length,
  });

  return encryptedResponse;
}

/**
 * Generate a new RSA key pair for Flow encryption
 * @returns {Object} - { publicKey, privateKey }
 */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

/**
 * Check if encryption keys are configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!(getFlowPrivateKey());
}

/**
 * Handle ping action (health check from WhatsApp)
 * Per Meta docs: response should only include data, no version field
 * @returns {Object} - Ping response
 */
function handlePing() {
  return {
    data: {
      status: 'active',
    },
  };
}

/**
 * Create an error response
 * Per Meta docs: response should only include data, no version field
 * @param {string} message - Error message
 * @returns {Object} - Error response
 */
function createErrorResponse(message) {
  return {
    data: {
      error: true,
      error_message: message,
    },
  };
}

module.exports = {
  flipIV,
  decryptAesKey,
  decryptFlowData,
  encryptResponse,
  processEncryptedRequest,
  generateKeyPair,
  isConfigured,
  handlePing,
  createErrorResponse,
};
