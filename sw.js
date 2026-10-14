/**
 * sw.js — Service Worker cho SpendWise PWA
 * Hỗ trợ chạy offline khi không có kết nối Internet
 */

const CACHE_NAME = 'spendwise-cache-v55';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/style.css',
  './css/stats.css',
  './css/budget.css',
  './css/pwa.css',
  './css/responsive.css',
  './js/utils.js',
  './js/storage.js',
  './js/category.js',
  './js/transaction.js',
  './js/chart.js',
  './js/budget.js',
  './js/export.js',
  './js/notification.js',
  './js/pwa.js',
  './js/features.js',
  './js/sync.js',
  './js/config.js',
  './js/auth.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js'
];

// Cài đặt Service Worker và lưu bộ nhớ đệm
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Đang lưu trữ tài nguyên tĩnh để chạy offline...');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Một số tài nguyên ngoài mạng không cache được ngay:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Kích hoạt và dọn dẹp cache cũ nếu có
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Xử lý các request mạng: Thử tìm trong Cache trước, nếu không có thì gọi Network
self.addEventListener('fetch', (event) => {
  // Bỏ qua các scheme không phải HTTP/HTTPS (vd chrome-extension)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      // Cập nhật cache bằng bản mới nhất (network-first cho dev)
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      // Offline: dùng cache
      return caches.match(event.request).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
