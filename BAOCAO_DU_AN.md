# 📋 BÁO CÁO DỰ ÁN — SpendWise (Quản Lý Chi Tiêu Cá Nhân)

> Ngày cập nhật: 16/10/2026  
> Phiên bản: v1.0.0 (Build v77)  
> Thư mục dự án: `D:\web số 1`  
> Live Demo: [https://sinhvien-dhs.github.io/quan-li-chi-tieu/](https://sinhvien-dhs.github.io/quan-li-chi-tieu/)

---

## 1. Tổng quan dự án

**SpendWise** là một ứng dụng web dạng **Progressive Web App (PWA) / Single Page Application (SPA)** hoàn chỉnh hỗ trợ quản lý chi tiêu cá nhân và nhóm. Ứng dụng hoạt động mượt mà cả **online lẫn offline**, hỗ trợ cài đặt trực tiếp lên điện thoại/máy tính như một ứng dụng native, đồng thời có khả năng đồng bộ đám mây đa thiết bị thông qua Firebase.

### Điểm nổi bật & khác biệt:
- **Nhập liệu thông minh bằng AI**: Nhận diện câu nói tự nhiên bằng tiếng Việt (giọng nói hoặc văn bản) và tự động bóc tách thành giao dịch chuẩn xác (hỗ trợ cả bộ phân tích cục bộ không cần mạng lẫn Google Gemini API).
- **Chia tiền nhóm (Bill Splitter) & VietQR**: Thuật toán chia tiền bảo toàn tổng, tự động sinh mã VietQR kèm số tiền và nội dung chuyển khoản, tích hợp sổ nợ nhóm.
- **Bảo mật nhiều lớp**: Khóa ứng dụng bằng mã PIN (băm PBKDF2 150.000 vòng), ẩn số dư nơi công cộng, Firestore Security Rules chặt chẽ phân quyền theo UID người dùng.
- **Chuyển tiền giữa các ví (Transfer)**: Quản lý tiền theo nhiều ví (tiền mặt, thẻ, ví điện tử) mà không làm lệch tổng số dư tài chính.
- **Chế độ ngoại tuyến (Offline-First)**: Service Worker thông minh với chiến lược Network-First / Cache Fallback và hàng đợi đồng bộ hai chiều (Sync Queue & Tombstones).

---

## 2. Cấu trúc thư mục dự án

```
D:\web số 1\
├── .github/
│   └── workflows/
│       └── ci.yml            # CI/CD tự động kiểm thử cú pháp, unit tests & inject config
├── assets/
│   ├── icon.svg              # Favicon vector
│   ├── icon-192.png          # Icon PWA 192x192
│   └── icon-512.png          # Icon PWA 512x512 (chuẩn any & maskable)
├── css/
│   ├── variables.css         # Hệ thống Design Tokens: màu sắc WCAG AA, light/dark theme
│   ├── style.css             # Style chung: typography, layout, summary, forms, modals
│   ├── stats.css             # Style màn hình Thống kê & biểu đồ Chart.js
│   ├── budget.css            # Style màn hình Ngân sách & Mục tiêu tiết kiệm
│   ├── pwa.css               # Style banner cài đặt PWA, onboarding tour
│   ├── home.css              # Bố cục 2 cột desktop & thẻ AI / Demo trang chủ
│   ├── debts.css             # Giao diện chia tiền nhóm, sổ nợ & VietQR
│   ├── lock.css              # Giao diện màn hình khoá mã PIN
│   └── responsive.css        # Tối ưu hiển thị responsive đa kích thước màn hình
├── js/
│   ├── config.js             # Cấu hình Firebase công khai (template an toàn cho Git)
│   ├── config.local.js       # Cấu hình Firebase môi trường dev (được bảo vệ bởi .gitignore)
│   ├── config.example.js     # File mẫu hướng dẫn cấu hình môi trường
│   ├── utils.js              # Tiện ích: format tiền VNĐ, xử lý múi giờ địa phương, sanitize
│   ├── business.js           # Lớp nghiệp vụ dùng chung (Single Source of Truth cho tài chính)
│   ├── storage.js            # Quản lý localStorage có bộ nhớ đệm in-memory và chống tràn quota
│   ├── category.js           # 14 danh mục chi tiêu & thu nhập trực quan
│   ├── transaction.js        # CRUD giao dịch, bộ lọc, tìm kiếm không dấu
│   ├── chart.js              # Khởi tạo và render biểu đồ Chart.js (tròn, cột kép, đường)
│   ├── budget.js             # Theo dõi hạn mức ngân sách tháng & mục tiêu tiết kiệm
│   ├── export.js             # Xuất file Excel (.xlsx), CSV tiếng Việt, sao lưu/phục hồi JSON
│   ├── notification.js       # Nhắc nhở ghi chép hàng ngày qua Web Notification API
│   ├── pwa.js                # Quản lý vòng đời Service Worker, banner cài đặt PWA
│   ├── features.js           # Đa tiền tệ, nén ảnh hóa đơn, quản lý ví, giao dịch định kỳ
│   ├── sync.js               # Quản lý hàng đợi đồng bộ và xóa an toàn (Tombstones)
│   ├── auth.js               # Xác thực Firebase Auth & đồng bộ Firestore phân tán
│   ├── ai.js                 # Bộ bóc tách ngôn ngữ tự nhiên hybrid (Offline parser + 9Router AI Gateway)
│   ├── lock.js               # Cơ chế khoá bảo vệ PIN PBKDF2 và ẩn số dư
│   ├── split.js              # Nghiệp vụ chia tiền nhóm, mã VietQR và quản lý nợ
│   ├── home.js               # Quản lý widget trang chủ, phân tích ngân sách nhanh
│   ├── demo.js               # Quản lý dữ liệu mẫu cô lập (không đồng bộ lên cloud)
│   └── app.js                # Entry point: điều hướng SPA, Toast, quản lý Theme
├── tests/
│   ├── business.test.js      # Unit test lớp nghiệp vụ tài chính
│   ├── ai.test.js            # Unit test bộ phân tích AI, tiếng lóng và nhận diện ngày
│   ├── split.test.js         # Unit test chia tiền bảo toàn tổng và VietQR
│   ├── storage.test.js       # Unit test bộ nhớ, xử lý lỗi lưu trữ và phân loại ví
│   ├── firestore.rules.test.js # Kiểm thử quy tắc bảo mật Firestore
│   └── rules-debt-check.js   # Kiểm tra tính toàn vẹn dữ liệu sổ nợ
├── tools/
│   ├── build.js              # Script đóng gói và tối ưu hóa bản phát hành (dist/)
│   └── serve.js              # Server HTTP phục vụ kiểm thử cục bộ
├── index.html                # Cấu trúc HTML5 ngữ nghĩa của toàn bộ ứng dụng SPA
├── manifest.json             # Manifest cấu hình ứng dụng web tiến bộ (PWA)
├── sw.js                     # Service Worker lưu cache offline (v79)
├── firestore.rules           # Quy tắc bảo mật Firestore Rules chi tiết
├── README.md                 # Hướng dẫn cài đặt và sử dụng dự án
└── .gitignore                # Danh sách loại trừ tệp nhạy cảm (API key, dist, node_modules)
```

---

## 3. Công nghệ & Thư viện sử dụng

| Thành phần | Giải pháp công nghệ | Vai trò |
|---|---|---|
| **Frontend Core** | HTML5, CSS3 (Variables, Grid, Flexbox), Vanilla JS (ES6+) | Không cần framework nặng, tối ưu hiệu năng và dung lượng tải |
| **Data Visualization** | Chart.js v4.4.4 (UMD CDN) | Vẽ biểu đồ tròn cơ cấu chi, cột kép thu/chi, đường xu hướng |
| **Excel Export** | SheetJS (xlsx.full.min.js v0.20.0) | Xuất báo cáo thu chi dạng file Excel `.xlsx` gồm 2 sheet chi tiết |
| **Icon & Typography** | Font Awesome 6.5.0, Google Fonts (Inter) | Giao diện hiện đại, chuẩn nhận diện tài chính |
| **Backend & Cloud** | Firebase Authentication + Cloud Firestore | Đăng nhập Email/Password, Google OAuth, lưu trữ thời gian thực |
| **Offline & PWA** | Service Worker (`sw.js`), Web App Manifest | Chạy ngoại tuyến, lưu cache tài nguyên, cài đặt như Native App |
| **AI Assistant (Hybrid)** | Web Speech API + Regex Engine (Offline) + 9Router AI Gateway (Gemini / GPT) | Phân tích tiếng Việt thông minh qua 9Router Gateway, tự động fallback về AI cục bộ khi ngoại tuyến |
| **Banking QR** | VietQR Open API (`img.vietqr.io`) | Sinh mã QR chuẩn NAPAS chuyển khoản nhanh chính xác số tiền |
| **Security** | Web Crypto API (SubtleCrypto: PBKDF2-SHA256) | Băm mật mã PIN 150.000 vòng bảo vệ thiết bị cá nhân |

---

## 4. Các màn hình chính (SPA Navigation)

1. **Trang Chủ (`pageHome`)**:
   - Thẻ thống kê số dư tổng quan, thu nhập, chi tiêu tức thời.
   - Hộp nhập nhanh bằng AI (gõ hoặc thu âm tiếng Việt).
   - Widget ngân sách tháng cảnh báo tiến độ sử dụng.
   - Thanh tìm kiếm thông minh (tìm không dấu) và lọc giao dịch đa tiêu chí (Ví, Danh mục, Loại giao dịch).
   - Danh sách giao dịch phân trang linh hoạt ("Xem thêm giao dịch").

2. **Thống Kê (`pageStats`)**:
   - Thống kê chi tiết theo các mốc thời gian: *Tuần này / Tháng này / Năm nay*.
   - Tính toán trung bình chi tiêu mỗi ngày và danh mục chi nhiều nhất.
   - 3 biểu đồ trực quan hóa dữ liệu tự động thích ứng chế độ sáng/tối (Dark/Light Mode).
   - Màn hình trạng thái rỗng thân thiện (Empty State) gợi ý bật dữ liệu mẫu.

3. **Ngân Sách (`pageBudget`)**:
   - Thiết lập hạn mức chi tiêu cho từng danh mục trong tháng.
   - Thanh tiến độ trực quan với cảnh báo màu: Xanh (an toàn), Vàng ($\ge 85\%$), Đỏ ($\ge 100\%$).
   - Quản lý mục tiêu tiết kiệm tích lũy theo phần trăm hoàn thành.

4. **Cài Đặt (`pageSettings`)**:
   - Chia nhóm khoa học bằng 4 tab con: *Tổng quan, Quản lý, Tiện ích & AI, Tài khoản*.
   - Xuất dữ liệu đa định dạng (Excel, PDF in ấn, JSON sao lưu).
   - Cài đặt đa tiền tệ (VNĐ, USD, EUR) với tỷ giá tùy biến.
   - Quản lý danh sách ví tài khoản (chuyển đổi an toàn khi xóa ví).
   - Thiết lập giao dịch định kỳ tự động kiểm tra khi mở ứng dụng.
   - Khóa ứng dụng bằng PIN và ẩn số dư tại nơi công cộng.

---

## 5. Kết quả kiểm thử & Đánh giá chất lượng

- **Unit Tests**: Đạt **64/64 bài kiểm thử tự động** bao gồm:
  - 19 bài kiểm thử lớp nghiệp vụ tài chính (`business.test.js`).
  - 20 bài kiểm thử phân chia hóa đơn và sinh mã ngân hàng (`split.test.js`).
  - 25 bài kiểm thử an toàn lưu trữ và giao dịch chuyển ví (`storage.test.js`).
- **Bảo mật & Tối ưu hóa**:
  - Không còn lộ API key ra kho mã nguồn công khai (tách file `config.local.js` và áp dụng GitHub Secrets).
  - Áp dụng Content Security Policy (CSP) chặt chẽ trong `meta` tag chống XSS.
  - Xử lý triệt để lỗi múi giờ địa phương (local timezone normalization).
  - Tích hợp bộ nhớ đệm in-memory cho `Storage.getTransactions()` giúp giao diện phản hồi mượt mà ngay cả khi có hàng nghìn bản ghi.
