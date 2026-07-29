/**
 * Lightweight stub for @aws-sdk/client-s3 — the root test suite runs before
 * bot/node_modules installs, so source that requires the S3 client can't
 * resolve it. Same pattern as the axios/form-data/pino/canvas stubs.
 * Tests that exercise storage behaviour mock the storage module itself.
 */
class S3Client {
  constructor() {}
  async send() { throw new Error('S3 stub: not available in the root test suite'); }
}
class PutObjectCommand { constructor(input) { this.input = input; } }
class GetObjectCommand { constructor(input) { this.input = input; } }
class DeleteObjectCommand { constructor(input) { this.input = input; } }
class HeadObjectCommand { constructor(input) { this.input = input; } }
class ListObjectsV2Command { constructor(input) { this.input = input; } }

module.exports = {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
};
