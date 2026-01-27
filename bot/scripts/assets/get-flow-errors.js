/**
 * Get detailed validation errors for a WhatsApp Flow
 */

require('dotenv').config();
const https = require('https');

// Staging credentials
const STAGING_TOKEN = 'EAAUmySBYQd4BQDsfnE07oZAZB1As7LmaW4Pyw2drLyuXS0RZAcXbpIouVSjGzlm4ZB9hrVYZByWHVZBW6Nl4dZCSaLdCbwanVE9psNSsWFLyCRvV4XZApmeXqj9vY5BoMMzt4kceDuQ9nMJVZBOy38R1jOhSKE8h8G0yrXM1esM1m7fP0m81j5QP2aF2ftDBZAFiJrNwZDZD';
const FLOW_ID = process.argv[2] || '870222682369657';

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
