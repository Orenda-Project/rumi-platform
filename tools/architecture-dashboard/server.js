/**
 * server.js
 * Lightweight zero-dependency HTTP server for the Rumi Monolith Architecture Dashboard.
 * Adheres to camelCase structure for all JSON API responses.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const architectureData = require('./architectureData');

const port = process.env.PORT || 4242;
const publicDir = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API: Get Full Architecture Data
  if (pathname === '/api/architecture') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      statusCode: 200,
      systemData: architectureData
    }));
    return;
  }

  // API: Health / Status
  if (pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      status: 'healthy',
      serverPort: port,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Serve architectureData.js for client script tag
  if (pathname === '/architectureData.js') {
    const dataPath = path.join(__dirname, 'architectureData.js');
    fs.readFile(dataPath, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(`window.architectureData = ${JSON.stringify(architectureData)};`);
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for SPA-style routing
        fs.readFile(path.join(publicDir, 'index.html'), (indexErr, indexContent) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexContent);
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Rumi Architecture & Ingress Dashboard is running!`);
  console.log(`🔗 Local URL: http://localhost:${port}`);
  console.log(`======================================================\n`);
});
