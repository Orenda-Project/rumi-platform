/**
 * Setup WhatsApp Flow Encryption
 *
 * Generates an RSA-2048 keypair, saves both keys to disk, registers
 * the public key with Meta's Graph API, and records the result in
 * the setup state file.
 *
 * Idempotent: if encryption is already configured (per state file),
 * the function returns immediately without regenerating keys.
 *
 * @module setup-encryption
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { MetaAPI } = require('./meta-api');
const { SetupState } = require('./setup-state');

/**
 * Generate RSA-2048 keypair, register public key with Meta, and persist state.
 *
 * @param {object}  opts
 * @param {string}  opts.wabaId          WhatsApp Business Account ID
 * @param {string}  opts.accessToken     System-user or short-lived token
 * @param {string}  opts.phoneNumberId   Phone-number ID (used for encryption endpoint)
 * @param {string} [opts.keyOutputDir]   Directory to write PEM files (default: ../../keys)
 * @param {string} [opts.statePath]      Path to .setup-state.json (default: managed by SetupState)
 *
 * @returns {Promise<{
 *   success: boolean,
 *   privateKeyPath?: string,
 *   publicKeyPath?: string,
 *   registered?: boolean,
 *   error?: string
 * }>}
 */
async function setupEncryption({
  wabaId,
  accessToken,
  phoneNumberId,
  keyOutputDir,
  statePath,
}) {
  // Default key output directory: bot/keys (two levels up from bot/scripts/setup/)
  const outputDir = keyOutputDir || path.resolve(__dirname, '../../keys');

  // ------------------------------------------------------------------
  // 1. Load setup state and check idempotency
  // ------------------------------------------------------------------
  const state = new SetupState(statePath);
  await state.load();

  const existing = state.getEncryption();
  if (existing && existing.configured) {
    console.log('Encryption already configured — skipping.');
    return { success: true };
  }

  // ------------------------------------------------------------------
  // 2. Generate RSA-2048 keypair
  // ------------------------------------------------------------------
  console.log('Generating RSA-2048 key pair...');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  console.log('Key pair generated.');

  // ------------------------------------------------------------------
  // 3. Write keys to disk
  // ------------------------------------------------------------------
  fs.mkdirSync(outputDir, { recursive: true });

  const privateKeyPath = path.join(outputDir, 'flow_private_key.pem');
  const publicKeyPath = path.join(outputDir, 'flow_public_key.pem');

  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);

  console.log(`Private key saved to: ${privateKeyPath}`);
  console.log(`Public key saved to:  ${publicKeyPath}`);

  // ------------------------------------------------------------------
  // 4. Output FLOW_PRIVATE_KEY env var hint (base64 encoded)
  // ------------------------------------------------------------------
  const base64PrivateKey = Buffer.from(privateKey).toString('base64');
  console.log(`Set this env var: FLOW_PRIVATE_KEY=${base64PrivateKey}`);

  // ------------------------------------------------------------------
  // 5. Register public key with Meta
  // ------------------------------------------------------------------
  console.log('Registering public key with Meta...');

  const api = new MetaAPI({ wabaId, accessToken, phoneNumberId });
  const registerResult = await api.registerPublicKey(publicKey);

  if (!registerResult.success) {
    const errMsg = registerResult.error?.message || 'Unknown registration error';
    console.log(`Failed to register public key: ${errMsg}`);

    // Keys are saved locally but not registered — report partial result
    return {
      success: false,
      privateKeyPath,
      publicKeyPath,
      registered: false,
      error: errMsg,
    };
  }

  console.log('Public key registered with Meta.');

  // ------------------------------------------------------------------
  // 6. Record in setup state
  // ------------------------------------------------------------------
  const publicKeyHash = crypto.createHash('sha256').update(publicKey).digest('hex');

  await state.setEncryption({
    configured: true,
    publicKeyHash,
    registeredAt: new Date().toISOString(),
  });

  console.log('Encryption state recorded.');

  return {
    success: true,
    privateKeyPath,
    publicKeyPath,
    registered: true,
  };
}

module.exports = { setupEncryption };
