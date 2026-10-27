/**
 * config.js — Cấu hình Firebase (project Spendwise)
 *
 * Lưu ý: Firebase API key cho Web App là public client identifier (không phải secret server key),
 * an toàn khi nhúng phía client vì mọi quyền truy cập được kiểm soát bởi Firebase Auth
 * và Firestore Security Rules (firestore.rules).
 */

if (typeof FIREBASE_CONFIG === 'undefined') {
  // eslint-disable-next-line no-var
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyABs3B__DjsNQ15b_yMKdbAgc4ajQNdXg4",
    authDomain: "spendwise-364bd.firebaseapp.com",
    projectId: "spendwise-364bd",
    storageBucket: "spendwise-364bd.firebasestorage.app",
    messagingSenderId: "1079249129670",
    appId: "1:1079249129670:web:57c26febad2c2fe50887c7"
  };
}

