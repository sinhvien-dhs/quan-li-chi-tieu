/**
 * sw.js — Service Worker cho SpendWise PWA
 * Hỗ trợ chạy offline khi không có kết nối Internet
 */

const CACHE_NAME = 'spendwise-cache-v90';

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
  './css/home.css',
  './css/debts.css',
  './css/lock.css',
  './js/ai.js',
  './js/split.js',
  './js/lock.js',
  './js/home.js',
  './css/responsive.css',
  './js/utils.js',
  './js/business.js',
  './js/demo.js',
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
  'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
];

// Chỉ được phép cache các tài nguyên tĩnh của ứng dụng và CDN tĩnh.
// Mọi tên miền khác (Firestore, Auth API...) phải đi thẳng ra ngoài.
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'cdn.sheetjs.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'
];

const stripVersionQuery = (url) => {
  try {
    const clean = new URL(url);
    if (!/^v\d+$/.test(clean.searchParams.get('v') || '')) return null;
    clean.searchParams.delete('v');
    return clean.toString();
  } catch (err) {
    return null;
  }
};

const isCacheableUrl = (url) =>
  url.origin === self.location.origin || CDN_HOSTS.indexOf(url.hostname) > -1;

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

// Xử lý request mạng: network-first (ưu tiên bản mới khi có mạng), fallback cache khi offline
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Không can thiệp POST/PUT/DELETE: đó là dữ liệu, không phải tài nguyên tĩnh
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  // Bỏ qua mọi API của Firebase/Google (Firestore, Auth...) để không làm hỏng đồng bộ
  if (!isCacheableUrl(url)) return;

  const cacheable = url.origin !== self.location.origin;

  event.respondWith(
    fetch(request).then((networkResponse) => {
      const canStore = networkResponse &&
        (networkResponse.status === 200 || networkResponse.type === 'opaque') &&
        (cacheable || networkResponse.type === 'basic');
      if (canStore) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache.clone());
          // Lưu thêm bản không có ?v= để lần sau offline vẫn khớp
          const stripped = stripVersionQuery(request.url);
          if (stripped) cache.put(stripped, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      // Offline: dùng cache (thử cả bản có và không có tham số ?v=)
      return caches.match(request).then((cached) => {
        if (cached) return cached;
        const stripped = stripVersionQuery(request.url);
        if (stripped) {
          return caches.match(stripped).then((cachedBase) => {
            if (cachedBase) return cachedBase;
          });
        }
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
