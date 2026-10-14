/**
 * sw.js — Service Worker cho SpendWise PWA
 * Hỗ trợ chạy offline khi không có kết nối Internet
 */

const CACHE_NAME = 'spendwise-cache-v56';

// Tài nguyên CỐT LÕI: bắt buộc phải cache thành công, nếu không thì hủy cài đặt
// (tránh trường hợp bản mới thiếu file cốt lõi nhưng cache cũ đã bị xóa)
const CORE_ASSETS = [
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
  './assets/icon.svg'
];

// Tài nguyên PHỤ (CDN): nếu lỗi thì bỏ qua, không ảnh hưởng bản cài đặt
const OPTIONAL_ASSETS = [
  './assets/icon-192.png',
  './assets/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js'
];

const ASSETS_TO_CACHE = CORE_ASSETS;
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

// Cài đặt: chỉ kích hoạt khi cache CỐT LÕI thành công đầy đủ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Đang lưu trữ tài nguyên cốt lõi...');
      // addAll sẽ ném lỗi nếu bất kỳ tài nguyên cốt lõi nào thất bại
      return cache.addAll(CORE_ASSETS).then(() => {
        // Tài nguyên phụ: cache từng cái một, bỏ qua lỗi
        return Promise.all(OPTIONAL_ASSETS.map(url =>
          cache.add(url).catch(() => null)
        ));
      });
    }).then(() => self.skipWaiting())
  );
});

// Kích hoạt: chỉ xóa cache cũ sau khi cache mới đã sẵn sàng
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Xác nhận cache cốt lõi thực sự tồn tại trước khi dọn cache cũ
      cache.match(CORE_ASSETS[1]).then(() =>
        caches.keys().then((keys) =>
          Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
          )
        )
      )
    ).then(() => self.clients.claim())
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
