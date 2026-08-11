/**
 * The reading assessment must survive having no object storage.
 *
 * The pipeline round-trips the recording: the handler persists it and stores a
 * URL, then the QUEUED analysis step downloads it again to transcribe. That
 * upload used to be unconditional, so on a deployment with no bucket it threw
 * "S3Client cannot be constructed — missing env: R2_ENDPOINT…" and aborted the
 * whole assessment ("🚨 CRITICAL: Reading assessment audio processing failed")
 * — after the teacher had already recorded the student reading. A sandbox has no
 * bucket by definition, which made the entire reading feature unusable there.
 *
 * The fallback keeps the recording on local disk and stores a file:// URL.
 * Single-machine by nature — correct for a sandbox, where the analysis runs in
 * the same process; R2 remains the answer when workers live on other hosts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const R2_KEYS = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];

function setR2(enabled) {
  for (const k of R2_KEYS) {
    if (enabled) process.env[k] = `test-${k}`;
    else delete process.env[k];
  }
}

describe('isR2Configured', () => {
  afterEach(() => setR2(false));

  it('is false when no credentials are set', () => {
    setR2(false);
    jest.resetModules();
    expect(require('../../bot/shared/storage/r2').isR2Configured()).toBe(false);
  });

  it('is true only when ALL three credentials are present', () => {
    setR2(true);
    jest.resetModules();
    const { isR2Configured } = require('../../bot/shared/storage/r2');
    expect(isR2Configured()).toBe(true);

    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(isR2Configured()).toBe(false);
  });
});

describe('transcription.service.downloadAudio — file:// URLs', () => {
  let tmpDir;

  function loadService() {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-reading-'));
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/utils/constants', () => ({ TEMP_DIR: tmpDir, SONIOX_API_KEY: 'k' }));
    jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }), { virtual: true });
    const downloadFromR2 = jest.fn();
    jest.doMock('../../bot/shared/storage/r2', () => ({
      downloadFromR2,
      extractKeyFromUrl: jest.fn(() => 'audio/x.ogg'),
      isR2Configured: jest.fn(() => false),
    }));
    const service = require('../../bot/shared/services/reading/transcription.service');
    return { service, downloadFromR2 };
  }

  afterEach(() => {
    jest.resetModules();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads a locally-stored recording without touching R2', async () => {
    const { service, downloadFromR2 } = loadService();
    const source = path.join(tmpDir, 'recording.ogg');
    fs.writeFileSync(source, 'OGGAUDIOBYTES');

    const result = await service.downloadAudio(`file://${source}`, 'assess-1');

    expect(fs.readFileSync(result, 'utf-8')).toBe('OGGAUDIOBYTES');
    expect(downloadFromR2).not.toHaveBeenCalled();
  });

  it('COPIES rather than moves, so the caller deleting its temp file is safe', async () => {
    // transcribeReading() deletes whatever path it gets back. Returning the
    // original would destroy the only copy of the student's reading.
    const { service } = loadService();
    const source = path.join(tmpDir, 'recording.ogg');
    fs.writeFileSync(source, 'BYTES');

    const returned = await service.downloadAudio(`file://${source}`, 'assess-2');

    expect(returned).not.toBe(source);
    fs.unlinkSync(returned); // simulate the caller's cleanup
    expect(fs.existsSync(source)).toBe(true);
  });

  it('fails clearly when the local recording is gone', async () => {
    const { service } = loadService();
    await expect(service.downloadAudio(`file://${tmpDir}/missing.ogg`, 'assess-3'))
      .rejects.toThrow(/no longer on disk/i);
  });

  it('still goes through R2 for a normal https URL', async () => {
    const { service, downloadFromR2 } = loadService();
    downloadFromR2.mockResolvedValue(Buffer.from('FROM-R2'));

    const result = await service.downloadAudio('https://bucket.r2.dev/audio/x.ogg', 'assess-4');

    expect(downloadFromR2).toHaveBeenCalledWith('audio/x.ogg');
    expect(fs.readFileSync(result, 'utf-8')).toBe('FROM-R2');
  });
});

describe('the handler chooses its persistence by configuration, not by hope', () => {
  // main()'s voice branch needs a live socket, DB and Soniox to run, so the
  // guarantee is pinned to the source — same approach as tests/setup/bin-rumi.test.js.
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../bot/shared/handlers/voice-message.handler.js'), 'utf-8'
  );

  it('only uploads to R2 when R2 is configured', () => {
    expect(src).toMatch(/if \(isR2Configured\(\)\) \{[\s\S]{0,200}uploadAudio\(/);
  });

  it('falls back to a file:// URL otherwise', () => {
    expect(src).toMatch(/audioUrl = `file:\/\/\$\{audioPath\}`/);
  });

  it('does NOT delete the recording it still needs to read back', () => {
    // The unlink must live inside the R2 branch only.
    const fallback = src.slice(src.indexOf('audioUrl = `file://'));
    const nextBlockEnd = fallback.indexOf('typingController.stop()');
    expect(fallback.slice(0, nextBlockEnd)).not.toMatch(/unlinkSync/);
  });
});
