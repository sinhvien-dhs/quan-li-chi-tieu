/**
 * Máy chủ tĩnh nhỏ để kiểm thử giao diện cục bộ (không cần npm install)
 * Chạy: node tools/serve.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

    // Chặn truy cập ra ngoài thư mục dự án
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || stat.isDirectory()) {
        // Với đường dẫn thư mục, thử lấy index.html bên trong
        const idx = path.join(filePath, 'index.html');
        if (!err && stat.isDirectory() && fs.existsSync(idx)) {
          res.writeHead(301, { Location: urlPath.replace(/\/?$/, '/') + 'index.html' }).end();
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 - Khong tim thay');
        }
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  })
  .listen(PORT, () => console.log('Dang phuc vu ' + ROOT + ' tren http://localhost:' + PORT));