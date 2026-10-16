/**
 * config.example.js — Mẫu cấu hình Firebase
 *
 * Cách dùng:
 *   1. Copy file này → js/config.local.js
 *   2. Điền key thật từ Firebase Console vào
 *   3. Không bao giờ commit config.local.js lên Git
 */

// eslint-disable-next-line no-var
var FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:abcdef1234567890"
};

// URL Cloudflare Worker proxy cho AI (tùy chọn — xem hướng dẫn trong worker/README.md)
// eslint-disable-next-line no-var
var AI_PROXY_URL = "";

