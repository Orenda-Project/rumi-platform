/**
 * Upload WhatsApp Flow JSON to Meta
 *
 * Usage: node scripts/assets/upload-flow.js [flow_id]
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');

// Credentials from environment
require('dotenv').config();
const STAGING_TOKEN = process.env.WHATSAPP_TOKEN;
const FLOW_ID = process.argv[2] || '870222682369657';

// Read and clean the flow JSON (remove _comment and _instructions)
const flowJson = JSON.parse(fs.readFileSync('docs/flows/reading-assessment-flow-v2.json', 'utf8'));
delete flowJson._comment;
delete flowJson._instructions;

// Remove _comment from nested objects
function removeComments(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(removeComments);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key !== '_comment') {
      result[key] = removeComments(value);
    }
  }
  return result;
}

const cleanJson = removeComments(flowJson);
const flowJsonStr = JSON.stringify(cleanJson);

console.log('📤 Uploading Flow JSON to Meta...');
console.log('   Flow ID:', FLOW_ID);
console.log('   Flow Version:', cleanJson.version);

// Create multipart form data boundary
const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
const crlf = '\r\n';

const body = [
  '--' + boundary,
  'Content-Disposition: form-data; name="name"',
  '',
  'flow.json',
  '--' + boundary,
  'Content-Disposition: form-data; name="asset_type"',
  '',
  'FLOW_JSON',
  '--' + boundary,
  'Content-Disposition: form-data; name="file"; filename="flow.json"',
  'Content-Type: application/json',
  '',
  flowJsonStr,
  '--' + boundary + '--',
  ''
].join(crlf);

const options = {
  hostname: 'graph.facebook.com',
  port: 443,
  path: '/v21.0/' + FLOW_ID + '/assets',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + STAGING_TOKEN,
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.success) {
        console.log('✅ Flow JSON uploaded successfully!');
        console.log('   Validation Errors:', response.validation_errors?.length || 0);

        if (response.validation_errors?.length > 0) {
          console.log('\n⚠️ Validation Errors:');
          response.validation_errors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err.error || JSON.stringify(err)}`);
          });
        }
      } else {
        console.log('❌ Upload failed:');
        console.log(JSON.stringify(response, null, 2));
      }
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(body);
req.end();
