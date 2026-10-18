# 💰 SpendWise — Quản Lý Chi Tiêu Cá Nhân Thông Minh

Ứng dụng web **Single Page Application (SPA)** chuẩn **Progressive Web App (PWA)** giúp theo dõi thu chi cá nhân, phân tích ngân sách theo danh mục, chia tiền nhóm VietQR, nhập nhanh bằng AI và trực quan hoá tài chính bằng biểu đồ — hoạt động mượt mà cả khi **offline**.

![SpendWise](https://img.shields.io/badge/SpendWise-v83-6C63FF?style=for-the-badge&logo=wallet)
![Tech](https://img.shields.io/badge/HTML5%20%7C%20CSS3%20%7C%20VanillaJS-orange?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-00C897?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-115%2F115%20Passed%20(100%25)-brightgreen?style=for-the-badge)
![Zero Dependency](https://img.shields.io/badge/Zero%20NPM%20Dependencies-black?style=for-the-badge)

---

## ✨ Tính Năng Nổi Bật

### 🔒 1. Đăng nhập bắt buộc & Bảo mật (Auth Wall)
- **Màn hình khóa đăng nhập bắt buộc (Login Gate):** Bảo vệ toàn diện dữ liệu tài chính cá nhân ngay từ cổng vào; chỉ người dùng đã đăng nhập mới có thể truy cập và sử dụng ứng dụng.
- **Không thể bỏ qua:** Màn hình đăng nhập không thể tắt bằng phím `Escape` hay nhấp ngoài khi chưa đăng nhập. Mọi nội dung dashboard phía sau đều bị làm mờ và vô hiệu hoá thao tác (`pointer-events: none`).
- **Hỗ trợ đa phương thức:** Đăng nhập an toàn qua **Email/Password** hoặc **Google OAuth**.
- **Đồng bộ đám mây Firestore:** Dữ liệu tự động đồng bộ theo tài khoản thực tế, bảo lưu khi đổi máy, đồng thời hỗ trợ cache ngoại tuyến (IndexedDB).
- **Đăng xuất an toàn:** Đẩy nốt dữ liệu còn tồn lên cloud trước khi xóa sạch dữ liệu cục bộ trên máy và ngay lập tức khóa màn hình lại.

---

### 🤖 2. Nhập nhanh bằng AI (Tích hợp sẵn — Không cần API Key)
- **Dùng ngay không cần cài đặt:** Ứng dụng tích hợp sẵn mô hình NLP tiếng Việt xử lý trực tiếp trên thiết bị (phản hồi tức thì, không tốn dữ liệu mạng, bảo vệ quyền riêng tư).
- **Hiểu tiếng lóng tài chính Việt Nam:**
  - Tiền tệ: `cành`, `lít`, `loét`, `củ`, `xu`, `nửa củ`, `nửa lít` (VD: *"ăn phở 40 cành, mua áo 2 lít"*).
  - Mốc thời gian linh hoạt: `hôm qua`, `hôm kia`, `sáng nay`, `ngày 15/10`.
  - Tách nhiều giao dịch trong 1 câu không cần dấu phẩy (VD: *"ăn bún bò 40k đổ xăng 50k ví momo"*).
- **Hỗ trợ 9Router AI Gateway:** Kết nối chuẩn OpenAI-compatible (`http://localhost:20128/v1`) tới Google Gemini/GPT với tính năng tự động khởi động nền trên Windows (`9router-silent.vbs`), tiết kiệm token và bảo mật.
- **Nhập liệu bằng giọng nói (Voice Input):** Sử dụng Web Speech API tiếng Việt với hiệu ứng animation micro trực quan.
- **Xem trước an toàn:** Bảng xem trước cho phép kiểm tra chi tiết danh mục, số tiền, ví trước khi xác nhận lưu vào sổ.

---

### 💵 3. Quản lý Thu Chi & Đa ví
- **14 Danh mục trực quan:** Ăn uống, Mua sắm, Di chuyển, Hóa đơn, Tiền lương, Thưởng, Đầu tư...
- **Chuyển tiền giữa các ví (Transfer):** Rút ATM về tiền mặt, chuyển ngân hàng qua ví điện tử (MoMo, ZaloPay...) — **bảo toàn tổng số dư**, chỉ đổi vị trí ví lưu trữ.
- **Tìm kiếm thông minh:** Tìm kiếm không dấu tiếng Việt ("nuoc" ra "Mua nước ngọt"), lọc kết hợp theo Ví và Danh mục, hỗ trợ nút "Xem thêm giao dịch".
- **Nhập số tiền kiểu Việt Nam:** Hỗ trợ gõ tắt tiện lợi `50000`, `1.500.000`, `2tr`, `20k`, `1.2 tỷ`.
- **Thao tác bàn phím chuẩn:** Phím `Tab` duyệt form, phím `Enter` lưu nhanh, phím `Esc` đóng modal linh hoạt.

---

### 🍜 4. Chia tiền nhóm (Bill Splitter) + VietQR + Sổ nợ
- **Chia tiền bảo toàn tổng:** Thuật toán phân bổ phần nguyên và xử lý phần dư chính xác đến từng đồng (300.000đ chia 4 người không bao giờ lệch 1 đồng).
- **Tạo mã VietQR tự động:** Tự sinh mã QR ngân hàng nhúng sẵn số tiền chính xác và nội dung chuyển khoản theo chuẩn Napas 247 (hỗ trợ MoMo, ZaloPay và 16 ngân hàng lớn: Vietcombank, Techcombank, MBBank, ACB, BIDV...).
- **Sổ nợ nhóm (Debt Tracker):** Lập phiếu nợ, theo dõi danh sách ai đã trả / chưa trả, tổng số tiền còn phải thu.
- **Ghi nhanh vào chi tiêu:** Nút 1 chạm lưu phần tiền của bạn vào danh sách giao dịch cá nhân.

---

### 📊 5. Thống kê & Biểu đồ trực quan (Chart.js)
- **Biểu đồ tròn (Doughnut):** Cơ cấu tỷ trọng chi tiêu theo từng danh mục.
- **Biểu đồ cột kép (Bar):** So sánh trực quan giữa Thu nhập và Chi tiêu.
- **Biểu đồ đường (Line):** Theo dõi xu hướng tích lũy tài chính theo thời gian.
- **Bộ lọc thời gian chuẩn:** Tuần này, Tháng này, Năm nay (chuẩn hóa múi giờ Việt Nam GMT+7).

---

### 🎯 6. Ngân sách & Mục tiêu tài chính
- **Hạn mức chi tiêu:** Thiết lập ngân sách riêng cho từng danh mục trong tháng.
- **Cảnh báo thông minh:** Thanh tiến độ đổi màu và thông báo toast tự động khi chi tiêu chạm ngưỡng cảnh báo (≥ 80%) hoặc vượt hạn mức (≥ 100%).
- **Mục tiêu tiết kiệm:** Theo dõi tiến độ tích lũy % cho các dự định lớn (mua xe, du lịch, quỹ khẩn cấp).

---

### 🛡️ 7. An toàn & Bảo mật nhiều lớp
- **Khóa PIN ứng dụng:** Mã PIN được băm an toàn bằng PBKDF2 (150.000 vòng lặp Web Crypto API), tự động khóa sau 5 phút không thao tác.
- **Ẩn số dư:** Chế độ ẩn nhanh số dư khi mở ứng dụng ở nơi đông người.
- **Firestore Security Rules:** Luật bảo mật đám mây nghiêm ngặt, mỗi tài khoản được cô lập hoàn toàn, xác thực kiểu dữ liệu và chống chèn trường lạ.
- **Chính sách bảo mật Content-Security-Policy (CSP):** Chặn tiêm mã độc XSS và bảo vệ phiên làm việc.

---

### 📑 8. Dữ liệu & Báo cáo
- **Xuất Excel chuyên nghiệp (.xlsx):** Báo cáo 2 sheet (GiaoDich và TomTat) định dạng đẹp mắt bằng SheetJS.
- **Xuất Báo cáo PDF:** In hoặc lưu file PDF tổng kết thu chi hàng tháng.
- **Sao lưu / Phục hồi JSON:** Đóng gói toàn bộ cơ sở dữ liệu vào file JSON, có cơ chế xác thực dữ liệu khi khôi phục.
- **Chế độ dữ liệu mẫu (Demo Mode):** Dành riêng cho trình diễn; tắt chế độ là tự động xóa sạch dữ liệu mẫu, không lẫn vào tài khoản thật.

---

### 📱 9. Giao diện & PWA
- **Bố cục 2 cột thích ứng:** Hiển thị 2 cột trên Desktop / Tablet và 1 cột gọn gàng trên Smartphone.
- **Dark / Light mode:** Chuyển đổi giao diện Sáng / Tối mượt mà, màu chữ đạt chuẩn tương phản cao **WCAG AA**.
- **Cài đặt như App Native (PWA):** Tải nhanh qua Service Worker, icon màn hình chính, mở trực tiếp không cần thanh địa chỉ trình duyệt.

---

## 🚀 Hướng Dẫn Chạy Ứng Dụng

### Cách 1 — Nhấp đúp mở ngay (Windows — Khuyên dùng)
Nhấp đúp vào file **`Mo SpendWise.cmd`** trong thư mục gốc. Ứng dụng sẽ tự động kích hoạt máy chủ cục bộ bằng PowerShell (có sẵn trên Windows) và mở trình duyệt. Không cần cài thêm bất kỳ phần mềm nào.

### Cách 2 — Mở trực tiếp file HTML
Nhấp đúp vào file **`index.html`** để mở ngay trên trình duyệt (Chrome, Edge, Firefox...).

### Cách 3 — Chạy bằng dòng lệnh

```bash
# Sử dụng PowerShell (có sẵn trên Windows):
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8000

# Sử dụng Node.js (nếu máy có Node):
npx serve .

# Sử dụng Python:
python -m http.server 8000
```
Truy cập địa chỉ: `http://localhost:8000`

---

## 🛠️ Công Nghệ Sử Dụng

| Thành phần | Công nghệ / Thư viện |
|---|---|
| **Core** | Pure Vanilla JavaScript (ES6+), HTML5 Semantic, CSS3 Modern (Variables, Flexbox, Grid) |
| **Bảo mật & Xác thực** | Firebase Auth (Email/Password, Google OAuth) + PBKDF2 Web Crypto API (150.000 rounds) |
| **Cơ sở dữ liệu đám mây** | Google Cloud Firestore (Security Rules phân quyền theo `uid`) |
| **Xử lý AI** | Local Regex/NLP Engine tiếng Việt + 9Router AI Gateway (OpenAI-compatible) |
| **Biểu đồ** | [Chart.js v4](https://www.chartjs.org/) |
| **Xuất Excel** | [SheetJS (xlsx)](https://sheetjs.com/) |
| **Thanh toán & QR** | VietQR Specification (Napas 247) |
| **Offline & PWA** | Service Worker (`sw.js` v82) + Web App Manifest |
| **Fonts & Icons** | Inter (Google Fonts), Font Awesome 6 |

---

## 📂 Cấu Trúc Mã Nguồn

```
quan-li-chi-tieu/
├── .github/
│   └── workflows/ci.yml       # Tự động kiểm thử & đóng gói CI trên GitHub Actions
├── assets/                    # Biểu tượng ứng dụng PWA (192px, 512px, SVG)
├── css/
│   ├── variables.css          # Bảng biến màu sắc, kích thước, hiệu ứng
│   ├── style.css              # Giao diện chính, modal, form và Auth Wall
│   ├── stats.css              # Kiểu dáng biểu đồ thống kê
│   ├── budget.css             # Thanh ngân sách và cảnh báo
│   ├── debts.css              # Giao diện chia tiền và sổ nợ nhóm
│   ├── lock.css               # Màn hình mã PIN và khóa ứng dụng
│   ├── pwa.css                # Giao diện thông báo PWA & tour hướng dẫn
│   └── responsive.css         # Thiết kế responsive thích ứng Desktop/Mobile
├── js/
│   ├── app.js                 # Điểm khởi động, điều hướng trang, ModalHelper
│   ├── auth.js                # Quản lý tài khoản Firebase Auth & đồng bộ Firestore
│   ├── ai.js                  # Bộ xử lý ngôn ngữ tự nhiên tiếng Việt & 9Router
│   ├── business.js            # Nghiệp vụ tính toán, phân bổ phần dư, gộp dữ liệu
│   ├── storage.js             # Tầng lưu trữ bộ nhớ và cache cục bộ
│   ├── transaction.js         # Quản lý danh sách giao dịch thu chi
│   ├── category.js            # Định nghĩa 14 danh mục tài chính
│   ├── budget.js              # Quản lý ngân sách và giới hạn chi tiêu
│   ├── split.js               # Công cụ chia tiền nhóm VietQR và sổ nợ
│   ├── lock.js                # Băm PBKDF2 và màn hình khóa PIN
│   ├── chart.js               # Khởi tạo và vẽ biểu đồ Chart.js
│   ├── export.js              # Xuất Excel, PDF, JSON sao lưu
│   ├── notification.js        # Nhắc nhở ghi chép và thông báo hệ thống
│   ├── pwa.js                 # Quản lý cài đặt PWA và onboarding
│   ├── features.js            # Quản lý ví, mục tiêu tiết kiệm, chi định kỳ
│   ├── sync.js                # Quản lý hàng đợi đồng bộ ngoại tuyến
│   ├── demo.js                # Dữ liệu mẫu phục vụ trình diễn
│   ├── config.js              # Cấu hình Firebase công khai (CI inject)
│   ├── config.example.js      # Mẫu cấu hình Firebase cho lập trình viên
│   └── utils.js               # Hàm tiện ích định dạng tiền tệ, ngày tháng
├── tests/
│   ├── auth.test.js           # Kiểm thử màn hình khóa Auth Wall & xác thực
│   ├── business.test.js       # Kiểm thử 19 ca nghiệp vụ cốt lõi
│   ├── ai.test.js             # Kiểm thử phân tích tiếng Việt & từ lóng AI
│   ├── split.test.js          # Kiểm thử thuật toán chia tiền & VietQR
│   ├── storage.test.js        # Kiểm thử tầng lưu trữ & cache
│   ├── rules.lint.js          # Kiểm tra cú pháp Firestore Security Rules
│   ├── rules-debt-check.js    # Kiểm tra payload dữ liệu sổ nợ
│   └── reliability.test.js    # Kiểm thử độ tin cậy, toàn vẹn dữ liệu & bảo vệ tài khoản
├── tools/
│   └── build.js               # Kịch bản đóng gói bản phát hành dist/ (tối ưu nén)
├── dist/                      # Bản phát hành tối ưu hoá (HTML + minified CSS/JS)
├── firestore.rules            # Quy tắc bảo mật Firestore đám mây
├── index.html                 # Giao diện chính Single Page Application
├── manifest.json              # Cấu hình PWA Web App Manifest
├── sw.js                      # Service Worker quản lý bộ nhớ đệm offline (v82)
├── Mo SpendWise.cmd           # Lối tắt chạy app 1-click trên Windows
└── README.md                  # Tài liệu hướng dẫn sử dụng dự án
```

---

## 🧪 Kiểm Thử Tự Động (Automated Testing)

Dự án tích hợp sẵn **8 bộ kiểm thử độc lập** viết thuần bằng JavaScript chạy trên môi trường Node.js (không cần tải thêm thư viện test bên ngoài):

```bash
# Chạy toàn bộ 8 bộ kiểm thử:
node tests/business.test.js
node tests/ai.test.js
node tests/split.test.js
node tests/storage.test.js
node tests/auth.test.js
node tests/rules.lint.js
node tests/rules-debt-check.js
node tests/reliability.test.js
```

**Kết quả kiểm thử:**
- ✅ **Nghiệp vụ tài chính (`business.test.js`):** 19/19 test passed
- ✅ **Phân tích AI & Tiếng lóng (`ai.test.js`):** 10/10 test passed
- ✅ **Chia tiền & VietQR & Sổ nợ (`split.test.js`):** 20/20 test passed
- ✅ **Lưu trữ & Dữ liệu (`storage.test.js`):** 25/25 test passed
- ✅ **Auth Wall & Xác thực (`auth.test.js`):** 9/9 test passed
- ✅ **Kiểm tra cú pháp Firestore Rules (`rules.lint.js`):** 0 syntax errors (247 dòng, 12 hàm, 9 đường dẫn)
- ✅ **Kiểm thử payload Sổ nợ Firestore (`rules-debt-check.js`):** 14/14 test passed
- ✅ **Độ tin cậy & Toàn vẹn dữ liệu (`reliability.test.js`):** 17/17 test passed
- **Tổng cộng: 115/115 kiểm thử thành công 100%.**

---

## 📦 Đóng Gói Bản Phát Hành (`dist/`)

Dự án cung cấp công cụ tự đóng gói và nén code mà không cần cài đặt Webpack/Vite:

```bash
node tools/build.js 83
```

Thư mục `dist/` sẽ được tạo ra với:
- `app.min.js`: Toàn bộ các module JavaScript được nối tiếp và loại bỏ chú thích/khoảng trắng thừa.
- `style.min.css`: CSS gộp và nén tối ưu dung lượng.
- `index.html`: Cập nhật liên kết nạp phiên bản phát hành tối ưu.

---

## ☁️ Hướng Dẫn Cấu Hình Firebase (Tùy Chọn)

Để đồng bộ dữ liệu lên Firebase Firestore của riêng bạn:

1. Đăng nhập vào [Firebase Console](https://console.firebase.google.com/) và tạo một Project mới.
2. Bật dịch vụ **Authentication** → Kích hoạt phương thức **Email/Password** và **Google**.
3. Bật **Cloud Firestore Database** (ở chế độ Production hoặc Test mode).
4. Vào **Project Settings** → Tạo **Web App** → Sao chép thông tin `firebaseConfig`.
5. Tạo file `js/config.local.js` (dựa trên mẫu `js/config.example.js`) và dán thông tin cấu hình vào (file này được `.gitignore` bảo vệ tự động).
6. Triển khai Firestore Security Rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

---

## 📄 Giấy Phép & Bản Quyền

Dự án được xây dựng phục vụ học tập, nghiên cứu và quản lý tài chính cá nhân — **Free & Open Source**.
