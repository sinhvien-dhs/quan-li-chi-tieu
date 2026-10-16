/**
 * config.js — Cấu hình Firebase (project Spendwise)
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KHÔNG ĐẶT API KEY THẬT VÀO FILE NÀY — file này được commit   ║
 * ║  lên GitHub. Key thật nằm trong js/config.local.js (gitignored) ║
 * ║  hoặc được CI inject qua GitHub Secrets khi deploy.             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Cách dùng:
 *   1. Copy file js/config.example.js → js/config.local.js
 *   2. Điền key thật vào config.local.js
 *   3. File này tự đọc config.local.js (nếu có) — không cần sửa gì ở đây.
 *
 * Khi deploy lên GitHub Pages, CI sẽ tự thay "__FIREBASE_*__" bằng
 * giá trị từ repository secrets (xem .github/workflows/ci.yml).
 */

// Placeholder — sẽ được CI thay thế bằng giá trị thật khi build
// Nếu chạy local, config.local.js (tải trước file này) đã gán FIREBASE_CONFIG rồi
if (typeof FIREBASE_CONFIG === 'undefined') {
  // eslint-disable-next-line no-var
  var FIREBASE_CONFIG = {
    apiKey:            "__FIREBASE_API_KEY__",
    authDomain:        "__FIREBASE_AUTH_DOMAIN__",
    projectId:         "__FIREBASE_PROJECT_ID__",
    storageBucket:     "__FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId:             "__FIREBASE_APP_ID__"
  };
}

// Placeholder cho Cloudflare Worker AI Proxy — sẽ được CI thay thế nếu có secret
if (typeof AI_PROXY_URL === 'undefined') {
  // eslint-disable-next-line no-var
  var AI_PROXY_URL = "__AI_PROXY_URL__";
}

