/**
 * Get detailed validation errors for a WhatsApp Flow
 */

require('dotenv').config();
const https = require('https');

// Credentials from environment
const STAGING_TOKEN = process.env.WHATSAPP_TOKEN;
const FLOW_ID = process.argv[2] || process.env.READING_ASSESSMENT_FLOW_ID;

const options = {
  hostname: 'graph.facebook.com',
  port: 443,
  path: '/v21.0/' + FLOW_ID + '?fields=id,name,status,validation_errors,json_version',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + STAGING_TOKEN
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Flow Details:');
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.on('error', e => console.error('Error:', e.message));
req.end();
