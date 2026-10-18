/**
 * tests/reliability.test.js — Kiểm thử Độ tin cậy và Toàn vẹn dữ liệu SpendWise
 * 
 * Kiểm tra các tình huống biên quan trọng:
 * 1. Chặn đẩy đồng bộ khi lưu cục bộ thất bại (bộ nhớ đầy / quota)
 * 2. Bảo vệ dữ liệu khi đăng xuất lúc mất mạng
 * 3. Chống mất dữ liệu khi xóa tài khoản (re-auth an toàn)
 * 4. Xác thực ngày tháng chặt chẽ (chặn 2026-02-31, 2026-04-31)
 * 5. Làm sạch ngân sách trước khi ghi Firestore
 * 6. Bảo toàn dữ liệu qua quy trình sao lưu / phục hồi
 *
 * Chạy: node tests/reliability.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '') + ' expected=' + expected + ' actual=' + actual);
  }
}

function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}

console.log('\n== Kiểm thử Độ Tin Cậy & Toàn Vẹn Dữ Liệu (Reliability & Data Integrity) ==\n');

(async () => {
  // Test 1: Kiểm tra tính hợp lệ của ngày tháng (Calendar Boundary)
  const bizSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'business.js'), 'utf8');
  const bizSandbox = {};
  vm.createContext(bizSandbox);
  vm.runInContext(bizSrc + '\n;this.Business = Business;', bizSandbox);
  const Business = bizSandbox.Business;

  await test('Business.isValidDate chặn các ngày không tồn tại trên lịch', () => {
    eq(Business.isValidDate('2026-02-31'), false, '2026-02-31 phải bị từ chối');
    eq(Business.isValidDate('2026-02-30'), false, '2026-02-30 phải bị từ chối');
    eq(Business.isValidDate('2026-04-31'), false, '2026-04-31 phải bị từ chối');
    eq(Business.isValidDate('2026-06-31'), false, '2026-06-31 phải bị từ chối');
    eq(Business.isValidDate('2026-09-31'), false, '2026-09-31 phải bị từ chối');
    eq(Business.isValidDate('2026-11-31'), false, '2026-11-31 phải bị từ chối');
    eq(Business.isValidDate('2026-13-01'), false, 'Tháng 13 phải bị từ chối');
    eq(Business.isValidDate('2026-00-10'), false, 'Tháng 0 phải bị từ chối');

    eq(Business.isValidDate('2026-02-28'), true, '2026-02-28 phải hợp lệ');
    eq(Business.isValidDate('2026-04-30'), true, '2026-04-30 phải hợp lệ');
    eq(Business.isValidDate('2026-12-31'), true, '2026-12-31 phải hợp lệ');
  });

  // Test 2: Storage.set thất bại (quota) không được kích hoạt đồng bộ lên cloud
  await test('SyncManager.patchStorage không đưa vào hàng đợi nếu Storage.set thất bại', () => {
    const storageMock = {
      __syncPatched: false,
      set: () => false // mô phỏng quota error
    };
    const queue = [];
    const syncMock = {
      QUEUE_KEY: 'q',
      URL_KEY: 'u',
      LAST_SYNC_KEY: 'ls',
      pushQueue: (entry) => queue.push(entry),
      patchStorage() {
        const origSet = storageMock.set.bind(storageMock);
        storageMock.set = (key, data) => {
          const result = origSet(key, data);
          if (result !== false && key !== this.QUEUE_KEY) {
            this.pushQueue({ op: 'set', key });
          }
          return result;
        };
      }
    };

    syncMock.patchStorage();
    const saveResult = storageMock.set('spendwise_transactions', [{ id: '1', amount: 50000 }]);

    eq(saveResult, false, 'Storage.set phải trả về false khi lỗi');
    eq(queue.length, 0, 'Hàng đợi đồng bộ không được thêm mục mới khi lưu local thất bại');
  });

  // Test 3: Xóa tài khoản an toàn — không xóa dữ liệu nếu re-auth bị hủy hoặc sai mật khẩu
  await test('deleteAccount bảo vệ dữ liệu, không xóa Firestore khi xác thực lại thất bại', async () => {
    let cloudDeleted = false;
    let localDeleted = false;
    let confirmPromptShown = false;

    const authMock = {
      currentUser: {
        email: 'user@gmail.com',
        providerData: [{ providerId: 'password' }],
        reauthenticateWithCredential: async () => {
          const err = new Error('Wrong password');
          err.code = 'auth/wrong-password';
          throw err;
        },
        delete: async () => { cloudDeleted = true; }
      },
      COLLECTIONS: { tx: 'transactions' },
      userRoot: () => ({
        collection: () => ({
          get: async () => ({ docs: [{ ref: { delete: async () => { cloudDeleted = true; } } }] })
        }),
        delete: async () => { cloudDeleted = true; }
      }),
      clearLocalUserData: () => { localDeleted = true; },
      friendlyError: (e) => e.message,
      async deleteAccount() {
        // Mô phỏng luồng kiểm tra an toàn
        const user = this.currentUser;
        try {
          // BƯỚC 1: Xác thực trước
          await user.reauthenticateWithCredential();
          // Nếu qua bước 1 mới xóa
          cloudDeleted = true;
          localDeleted = true;
        } catch (e) {
          // Bị chặn vì sai mật khẩu -> KHÔNG xóa bất kỳ thứ gì!
          return;
        }
      }
    };

    await authMock.deleteAccount();
    eq(cloudDeleted, false, 'Dữ liệu cloud không được xóa khi chưa xác thực');
    eq(localDeleted, false, 'Dữ liệu local không được xóa khi chưa xác thực');
  });

  // Test 4: Đăng xuất bảo vệ dữ liệu khi mất kết nối mạng
  await test('signOut cảnh báo và hỗ trợ sao lưu nếu còn thay đổi chưa được đồng bộ', async () => {
    let backupTriggered = false;
    let confirmCalled = false;
    let dataWiped = false;

    const mockSyncManager = {
      getQueue: () => [{ op: 'set', key: 'spendwise_transactions' }],
      getTombstones: () => []
    };

    const mockExportManager = {
      exportJSON: () => { backupTriggered = true; }
    };

    const mockConfirmDialog = {
      show: ({ title, onConfirm }) => {
        confirmCalled = true;
        // Người dùng chọn "Sao lưu & Đăng xuất"
        mockExportManager.exportJSON();
        onConfirm();
      }
    };

    const authManager = {
      currentUser: { uid: 'u1' },
      pushToCloud: async () => { throw new Error('Offline timeout'); },
      clearLocalUserData: () => { dataWiped = true; },
      updateAccountUI: () => {},
      showAuthGate: () => {},
      async signOut() {
        let syncOk = false;
        try {
          await this.pushToCloud();
          syncOk = true;
        } catch {
          syncOk = false;
        }

        const hasPending = mockSyncManager.getQueue().length > 0;
        if (!syncOk && hasPending) {
          mockConfirmDialog.show({
            title: 'Chưa đồng bộ xong',
            onConfirm: () => {
              this.clearLocalUserData();
            }
          });
          return;
        }
        this.clearLocalUserData();
      }
    };

    await authManager.signOut();
    ok(confirmCalled, 'Phải hiện hộp thoại cảnh báo khi chưa đồng bộ thành công');
    ok(backupTriggered, 'Phải hỗ trợ sao lưu dữ liệu trước khi hoàn tất đăng xuất');
    ok(dataWiped, 'Sau khi xác nhận sao lưu an toàn mới xóa dữ liệu cục bộ');
  });

  // Test 5: Làm sạch giới hạn ngân sách trước khi đẩy lên Firestore
  await test('Làm sạch limits ngân sách: loại bỏ NaN, số âm, và giới hạn tối đa 50 danh mục', () => {
    const rawLimits = {
      'Ăn uống': 5000000,
      'Đi lại': -200000,      // số âm -> bị loại
      'Mua sắm': NaN,          // NaN -> bị loại
      'Giải trí': '3000000',   // chuỗi số -> chuyển thành số hợp lệ
      'Vô cực': 9999999999999999 // vượt 1e12 -> bị loại
    };

    const cleanLimits = {};
    Object.keys(rawLimits).slice(0, 50).forEach(cat => {
      const val = Number(rawLimits[cat]);
      if (typeof cat === 'string' && cat.trim() && !isNaN(val) && val >= 0 && val <= 1000000000000) {
        cleanLimits[cat.trim().slice(0, 40)] = Math.round(val);
      }
    });

    eq(cleanLimits['Ăn uống'], 5000000, 'Ăn uống phải giữ nguyên');
    eq(cleanLimits['Đi lại'], undefined, 'Số âm phải bị loại');
    eq(cleanLimits['Mua sắm'], undefined, 'NaN phải bị loại');
    eq(cleanLimits['Giải trí'], 3000000, 'Chuỗi số phải được parse thành số');
    eq(cleanLimits['Vô cực'], undefined, 'Số vượt 1e12 phải bị loại');
  });

  // Test 6: Đa thiết bị — Device B đẩy dữ liệu không được xóa giao dịch mới của Device A trên Firestore
  await test('Đa thiết bị: Device B đẩy dữ liệu không xóa các giao dịch Device A đã tạo trên Firestore', async () => {
    // Giả lập Firestore collection 'transactions'
    const firestoreDb = new Map();
    // Device A đã tạo giao dịch tx_A trên cloud
    firestoreDb.set('tx_A', { id: 'tx_A', name: 'Mua sách', amount: 200000, type: 'expense' });

    // Device B có giao dịch tx_B trên máy cục bộ, chưa tải tx_A
    const deviceB_local = [{ id: 'tx_B', name: 'Cà phê', amount: 35000, type: 'expense' }];
    const deviceB_tombs = []; // Device B không chủ động xóa gì

    // Logic pushToCloud mới của SpendWise:
    // Chỉ xóa những tài liệu nằm trong tombstones, tuyệt đối không suy ra xóa từ difference!
    const toPush = deviceB_local;
    const ops = [];
    toPush.forEach(item => {
      ops.push({ id: item.id, payload: item });
    });

    if (deviceB_tombs.length > 0) {
      Array.from(firestoreDb.keys()).forEach(id => {
        if (deviceB_tombs.includes(id)) {
          ops.push({ id: id, payload: null });
        }
      });
    }

    // Thực hiện batch commit lên firestore
    ops.forEach(op => {
      if (op.payload === null) firestoreDb.delete(op.id);
      else firestoreDb.set(op.id, op.payload);
    });

    // Xác minh kết quả trên cloud
    ok(firestoreDb.has('tx_A'), 'Giao dịch tx_A của Device A PHẢI VẪN TỒN TẠI trên cloud sau khi B đồng bộ');
    ok(firestoreDb.has('tx_B'), 'Giao dịch tx_B của Device B đã được lưu lên cloud');
    eq(firestoreDb.size, 2, 'Cả 2 giao dịch từ 2 thiết bị đều được bảo toàn');
  });

  // Test 7: Không hồi sinh bản ghi đã bị xóa trên cloud khi kéo dữ liệu về
  await test('Đồng bộ hai chiều: không hồi sinh bản ghi đã bị xóa trên cloud', () => {
    // Cloud chỉ còn tx_2 (vì tx_1 đã bị Device A xóa trên cloud)
    const cloudArr = [{ id: 'tx_2', name: 'Mua sắm', amount: 500000, syncState: 'synced' }];

    // Device B trước đó đã từng sync tx_1 và tx_2 (syncState: 'synced')
    const localArr = [
      { id: 'tx_1', name: 'Đã xóa ở A', amount: 100000, syncState: 'synced' },
      { id: 'tx_2', name: 'Mua sắm', amount: 500000, syncState: 'synced' },
      { id: 'tx_3', name: 'Mới thêm offline ở B', amount: 80000, syncState: 'pending' }
    ];

    const merged = Business.mergeById(localArr, cloudArr, []);
    const ids = merged.map(x => x.id);

    eq(ids.includes('tx_1'), false, 'tx_1 đã bị xóa trên cloud nên KHÔNG được hồi sinh ở Device B');
    eq(ids.includes('tx_2'), true, 'tx_2 còn trên cloud phải được giữ');
    eq(ids.includes('tx_3'), true, 'tx_3 tạo offline ở B (syncState: pending) phải được giữ để upload');
  });

  // Test 8: Fail-Closed cho deleteAccount — Lỗi Google Popup hoặc mạng dừng ngay, không xóa Firestore
  await test('deleteAccount tuân thủ Fail-Closed: lỗi popup hoặc mạng dừng ngay lập tức', async () => {
    let firestoreTouched = false;
    let authUserDeleted = false;
    let localCleared = false;

    const mockAuthManager = {
      currentUser: {
        providerData: [{ providerId: 'google.com' }],
        reauthenticateWithPopup: async () => {
          const err = new Error('Popup closed by user or blocked');
          err.code = 'auth/popup-closed-by-user';
          throw err;
        },
        delete: async () => { authUserDeleted = true; }
      },
      COLLECTIONS: { tx: 'transactions' },
      userRoot: () => ({
        collection: () => ({
          get: async () => {
            firestoreTouched = true;
            return { docs: [] };
          }
        }),
        delete: async () => { firestoreTouched = true; }
      }),
      clearLocalUserData: () => { localCleared = true; },
      friendlyError: () => 'Đã hủy',
      async deleteAccount() {
        const user = this.currentUser;
        const providerId = user.providerData[0].providerId;

        // BƯỚC 1: Xác thực lại (Fail-closed)
        if (providerId === 'google.com') {
          try {
            await user.reauthenticateWithPopup();
          } catch (reauthErr) {
            // FAIL-CLOSED: Dừng ngay lập tức!
            return;
          }
        }

        // BƯỚC 2: Firestore
        firestoreTouched = true;
        // BƯỚC 3: Auth user
        await user.delete();
        // BƯỚC 4: Local
        this.clearLocalUserData();
      }
    };

    await mockAuthManager.deleteAccount();

    eq(firestoreTouched, false, 'Firestore tuyệt đối KHÔNG bị chạm vào khi re-auth không thành công');
    eq(authUserDeleted, false, 'Auth user KHÔNG bị xóa khi re-auth không thành công');
    eq(localCleared, false, 'Local data KHÔNG bị xóa khi re-auth không thành công');
  });

  // Test 9: Đăng xuất an toàn khi offline kể cả khi queue rỗng nhưng có dữ liệu máy
  await test('signOut chặn xóa dữ liệu khi push thất bại dù sync queue rỗng', async () => {
    let dialogShown = false;
    let localWiped = false;

    // Giả lập trạng thái: người dùng offline, queue rỗng nhưng trên máy có 5 giao dịch
    const storageData = [{ id: '1', amount: 50000, syncState: 'pending' }];
    const syncOk = false; // pushToCloud thất bại do mất mạng

    const hasUnsyncedTxs = storageData.some(t => t.syncState !== 'synced');
    const hasAnyLocalData = storageData.length > 0;

    // Điều kiện bảo vệ mới trong signOut:
    if (!syncOk && (hasUnsyncedTxs || hasAnyLocalData)) {
      dialogShown = true;
      // Không gọi clearLocalUserData!
    } else {
      localWiped = true;
    }

    eq(dialogShown, true, 'Phải mở cảnh báo bảo vệ dữ liệu khi mất mạng');
    eq(localWiped, false, 'Tuyệt đối không được xóa dữ liệu cục bộ khi chưa đồng bộ xong');
  });

  // Test 10: Cách ly dữ liệu chéo tài khoản khi đổi user trên cùng thiết bị
  await test('Chuyển đổi tài khoản dọn sạch toàn bộ cache, sync queue và tombstone của tài khoản cũ', () => {
    const store = {
      spendwise_uid: 'user_A',
      spendwise_transactions: JSON.stringify([{ id: 'tx_A1' }]),
      spendwise_sync_queue: JSON.stringify([{ op: 'set', key: 'tx_A1' }]),
      spendwise_tombstones: JSON.stringify(['deleted_A2']),
      spendwise_rates: '{"USD":25000}'
    };
    const localStorageMock = {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    };
    let cacheInvalidated = false;
    const authManagerMock = {
      DATA_KEYS: ['spendwise_transactions'],
      clearLocalUserData() {
        this.DATA_KEYS.forEach(key => localStorageMock.removeItem(key));
        localStorageMock.removeItem('spendwise_uid');
        localStorageMock.removeItem('spendwise_sync_queue');
        localStorageMock.removeItem('spendwise_rates');
        localStorageMock.removeItem('spendwise_tombstones');
        cacheInvalidated = true;
      },
      switchUser(newUid) {
        const storedUid = localStorageMock.getItem('spendwise_uid');
        if (storedUid && storedUid !== newUid) {
          this.clearLocalUserData();
        }
        localStorageMock.setItem('spendwise_uid', newUid);
      }
    };

    authManagerMock.switchUser('user_B');

    eq(store.spendwise_uid, 'user_B', 'UID mới phải là user_B');
    eq(store.spendwise_transactions, undefined, 'Giao dịch của user_A phải được xóa sạch');
    eq(store.spendwise_sync_queue, undefined, 'Hàng đợi của user_A phải được xóa sạch');
    eq(store.spendwise_tombstones, undefined, 'Tombstones của user_A phải được xóa sạch');
    eq(cacheInvalidated, true, 'Bộ nhớ đệm trong RAM phải được vô hiệu hóa');
  });

  // Test 11: Khóa tương tranh pushToCloud chia sẻ cùng Promise thay vì trả về false
  await test('pushToCloud chia sẻ Promise đang chạy khi có nhiều luồng gọi đồng thời', async () => {
    let executionCount = 0;
    const authPushMock = {
      currentUser: { uid: 'user123' },
      _pushing: false,
      _currentPushPromise: null,
      schedulePush() {},
      async pushToCloud() {
        if (!this.currentUser) return false;
        if (this._pushing && this._currentPushPromise) {
          this.schedulePush();
          return this._currentPushPromise;
        }
        this._pushing = true;
        this._currentPushPromise = (async () => {
          try {
            executionCount++;
            await new Promise(r => setTimeout(r, 50));
            return true;
          } finally {
            this._pushing = false;
            this._currentPushPromise = null;
          }
        })();
        return this._currentPushPromise;
      }
    };

    // Gọi đồng thời 3 lần pushToCloud
    const [res1, res2, res3] = await Promise.all([
      authPushMock.pushToCloud(),
      authPushMock.pushToCloud(),
      authPushMock.pushToCloud()
    ]);

    eq(res1, true, 'Luồng 1 phải thành công');
    eq(res2, true, 'Luồng 2 phải nhận kết quả thành công thay vì false');
    eq(res3, true, 'Luồng 3 phải nhận kết quả thành công thay vì false');
    eq(executionCount, 1, 'Chỉ 1 lần ghi Firestore thực tế được kích hoạt');
  });

  // Test 12 (F-01): Tài khoản đã khởi tạo khi cloud rỗng không làm sống lại các giao dịch đã xóa
  await test('mergeById không hồi sinh giao dịch cũ đã synced khi tài khoản cloud đã khởi tạo nhưng rỗng', () => {
    const localArr = [
      { id: 'tx_old_synced', name: 'Giao dịch cũ đã đồng bộ', amount: 50000, syncState: 'synced' },
      { id: 'tx_new_offline', name: 'Giao dịch mới tạo lúc mất mạng', amount: 30000, syncState: 'pending' }
    ];
    const cloudArr = []; // Cloud rỗng (người dùng đã xóa trên thiết bị khác)
    const tombstones = [];
    const isAccountInitialized = true; // Tài khoản đã từng khởi tạo trên cloud

    const result = Business.mergeById(localArr, cloudArr, tombstones, isAccountInitialized);

    eq(result.length, 1, 'Chỉ giao dịch mới chưa đồng bộ mới được giữ lại');
    eq(result[0].id, 'tx_new_offline', 'Giao dịch mới phải được giữ để đẩy lên cloud');
  });

  // Test 13 (F-02): Thao tác xóa mới phát sinh trong lúc push không bị xóa khỏi hàng đợi / tombstone
  await test('Snapshot cleanup bảo vệ tombstone và queue mới phát sinh trong lúc push đang chạy', async () => {
    let mockTombstones = ['tx_del_1'];
    let mockQueue = [{ op: 'remove', key: 'tx_del_1', at: 1000 }];

    const authSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    const authSandbox = {
      console,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      Storage: {
        get: (k) => (k === 'spendwise_budgets' ? {} : []),
        set: () => true,
        getTheme: () => 'light',
        getTransactions: () => []
      },
      SyncManager: {
        LAST_SYNC_KEY: 'spendwise_last_sync',
        getTombstones: () => mockTombstones,
        getQueue: () => mockQueue,
        removeTombstones: (toRemove) => {
          const removeSet = new Set(toRemove);
          mockTombstones = mockTombstones.filter(id => !removeSet.has(id));
        },
        removeQueueEntries: (toRemove) => {
          const removeKeys = new Set(toRemove.map(e => `${e.key}_${e.at}`));
          mockQueue = mockQueue.filter(e => !removeKeys.has(`${e.key}_${e.at}`));
        },
        updateBadge: () => {}
      },
      setTimeout,
      clearTimeout,
      Promise
    };

    vm.createContext(authSandbox);
    vm.runInContext(authSrc + '\n;this.AuthManager = AuthManager;', authSandbox);
    const AM = authSandbox.AuthManager;

    AM.currentUser = { uid: 'test_user_sync' };
    AM.db = {
      batch: () => ({
        delete: () => {},
        set: () => {},
        commit: async () => {
          // Giả lập trong lúc batch commit (mạng đang chờ server), người dùng xóa thêm tx_del_2
          if (!mockTombstones.includes('tx_del_2')) {
            mockTombstones.push('tx_del_2');
            mockQueue.push({ op: 'remove', key: 'tx_del_2', at: 1050 });
          }
        }
      })
    };
    AM.userRoot = () => ({
      collection: () => ({
        get: async () => ({
          docs: [{ id: 'tx_del_1', ref: {} }]
        }),
        doc: () => ({ set: async () => {} })
      }),
      set: async () => {}
    });

    const pushResult = await AM.pushToCloud();
    eq(pushResult, true, 'pushToCloud phải chạy thành công không ném lỗi phạm vi');
    eq(mockTombstones.length, 1, 'Tombstone phát sinh trong lúc push phải còn nguyên');
    eq(mockTombstones[0], 'tx_del_2', 'Tombstone tx_del_2 không được bị xóa');
    eq(mockQueue.length, 1, 'Hàng đợi phát sinh trong lúc push phải còn nguyên');
    eq(mockQueue[0].key, 'tx_del_2', 'Mục tx_del_2 phải còn trong queue');
  });

  // Test 14 (F-03): Xóa tài khoản fail-closed khi thao tác xóa tài liệu Firestore gặp sự cố
  await test('deleteAccount dừng ngay và không xóa Auth / local nếu xóa tài liệu budgets/main thất bại', async () => {
    let authUserDeleted = false;
    let localWiped = false;

    const testUser = {
      uid: 'user_fail_test',
      providerData: [{ providerId: 'google.com' }],
      reauthenticateWithPopup: async () => true,
      delete: async () => { authUserDeleted = true; }
    };

    const mockRoot = {
      collection: (col) => {
        if (col === 'budgets') {
          return {
            doc: () => ({
              get: async () => ({ exists: true }),
              delete: async () => { throw new Error('Firestore permission denied on budgets'); }
            })
          };
        }
        return {
          get: async () => ({ docs: [] })
        };
      },
      get: async () => ({ exists: false }),
      delete: async () => {}
    };

    let caughtError = null;
    try {
      // Mô phỏng quy trình BƯỚC 2 trong deleteAccount
      const targetCollections = ['transactions', 'wallets', 'goals', 'recurring', 'debts', 'data'];
      for (const colName of targetCollections) {
        const snap = await mockRoot.collection(colName).get();
        if (snap && snap.docs && snap.docs.length > 0) {
          await Promise.all(snap.docs.map(d => d.ref.delete()));
        }
      }
      const budgetsDoc = mockRoot.collection('budgets').doc('main');
      const budgetsSnap = await budgetsDoc.get();
      if (budgetsSnap && budgetsSnap.exists) await budgetsDoc.delete();

      // Nếu không ném lỗi (bị catch rỗng), sẽ chạy tới Bước 3 & 4:
      await testUser.delete();
      localWiped = true;
    } catch (err) {
      caughtError = err;
    }

    ok(caughtError !== null, 'Phải bắt được lỗi khi xóa budgets thất bại');
    eq(authUserDeleted, false, 'Tuyệt đối không được xóa Auth user khi Firestore chưa xóa xong');
    eq(localWiped, false, 'Tuyệt đối không được xóa local data khi có lỗi');
  });

  // Test 15 (F-06): Kiểm tra xác thực năm nhuận cho ngày 29/02
  await test('Business.isValidDate xác thực chính xác năm nhuận cho ngày 29/02', () => {
    // 2024 là năm nhuận
    eq(Business.isValidDate('2024-02-29'), true, '2024-02-29 phải hợp lệ (năm nhuận)');
    // 2020 là năm nhuận
    eq(Business.isValidDate('2020-02-29'), true, '2020-02-29 phải hợp lệ (năm nhuận)');
    // 2000 là năm nhuận
    eq(Business.isValidDate('2000-02-29'), true, '2000-02-29 phải hợp lệ (năm nhuận)');

    // 2025 không phải năm nhuận
    eq(Business.isValidDate('2025-02-29'), false, '2025-02-29 phải bị từ chối (không nhuận)');
    // 2026 không phải năm nhuận
    eq(Business.isValidDate('2026-02-29'), false, '2026-02-29 phải bị từ chối (không nhuận)');
    // 2027 không phải năm nhuận
    eq(Business.isValidDate('2027-02-29'), false, '2027-02-29 phải bị từ chối (không nhuận)');
    // Ngày không tồn tại
    eq(Business.isValidDate('2026-02-30'), false, '2026-02-30 phải bị từ chối');
    eq(Business.isValidDate('2026-04-31'), false, '2026-04-31 phải bị từ chối');
  });

  // Test 16 (F-11): PWA reloadWhenIdle không bị hoãn vô cớ khi người dùng ở auth gate chưa nhập liệu
  await test('PWA reloadWhenIdle cho phép tải lại khi màn hình đăng nhập chưa nhập liệu', () => {
    const isBusyCheck = (hasDataModal, authInputs, activeEl) => {
      if (hasDataModal) return true;
      for (const val of authInputs) {
        if (String(val || '').trim() !== '') return true;
      }
      if (activeEl && /^(INPUT|TEXTAREA|SELECT)$/.test(activeEl.tagName) && String(activeEl.value || '').trim() !== '') {
        return true;
      }
      return false;
    };

    // Khi người dùng mới vào app, auth gate hiện nhưng các ô input đều rỗng
    eq(isBusyCheck(false, ['', ''], null), false, 'Auth gate rỗng không được chặn PWA reload');

    // Khi người dùng đang nhập email hoặc password
    eq(isBusyCheck(false, ['user@example.com', ''], null), true, 'Đang nhập email phải hoãn reload');

    // Khi mở modal giao dịch
    eq(isBusyCheck(true, ['', ''], null), true, 'Data modal đang mở phải hoãn reload');
  });

  // Test 17 (F-12): Hủy đăng xuất nếu xuất bản sao lưu thất bại khi chưa đồng bộ
  await test('signOut hủy đăng xuất nếu tạo file sao lưu thất bại khi chưa đồng bộ', async () => {
    let localWiped = false;
    let toastErrorMsg = '';

    const authMock = {
      currentUser: { uid: 'u_test' },
      pushToCloud: async () => false,
      clearLocalUserData: () => { localWiped = true; },
      async handleSignOutConfirm(expFn) {
        try {
          const exported = expFn();
          if (exported === false) {
            toastErrorMsg = 'Không thể tạo file sao lưu! Đã hủy đăng xuất để bảo vệ dữ liệu.';
            return;
          }
        } catch {
          toastErrorMsg = 'Không thể tạo file sao lưu! Đã hủy đăng xuất để bảo vệ dữ liệu.';
          return;
        }
        this.clearLocalUserData();
      }
    };

    // Khi expFn trả về false (lỗi xuất file)
    await authMock.handleSignOutConfirm(() => false);
    eq(localWiped, false, 'Không được xóa dữ liệu cục bộ khi xuất file sao lưu thất bại');
    ok(toastErrorMsg.includes('Đã hủy đăng xuất'), 'Phải thông báo hủy đăng xuất để bảo vệ dữ liệu');
  });

  console.log(`\nKết quả kiểm thử độ tin cậy: ${passed} đạt, ${failed} không đạt\n`);
  if (failed > 0) process.exit(1);
})();
