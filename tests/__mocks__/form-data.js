/**
 * form-data mock for OSS test suite.
 * form-data lives in bot/node_modules but not the root, and the root test job
 * runs before bot deps install — so source files that require 'form-data' (e.g.
 * whatsapp.service) can't resolve it. This stub lets them load; the multipart
 * upload paths that actually use it aren't exercised in the root suite.
 */

class FormData {
  append() {}
  getHeaders() {
    return { 'content-type': 'multipart/form-data' };
  }
  getBuffer() {
    return Buffer.from('');
  }
}

module.exports = FormData;
module.exports.default = FormData;
