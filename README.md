# 💰 SpendWise — Quản Lý Chi Tiêu Cá Nhân

Ứng dụng web **Single Page Application (SPA)** giúp theo dõi thu chi cá nhân, phân tích ngân sách theo danh mục, trực quan hóa dữ liệu bằng biểu đồ và xuất báo cáo — hoạt động được cả **offline** như một app điện thoại.

![SpendWise](https://img.shields.io/badge/SpendWise-v1.0-6C63FF?style=for-the-badge&logo=wallet)
![Tech](https://img.shields.io/badge/HTML5%20%7C%20CSS3%20%7C%20VanillaJS-orange?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-00C897?style=for-the-badge)

---

## ✨ Tính Năng

### 🚀 Nhập nhanh bằng AI (Hybrid Online / Offline)
- Gõ/nói tự nhiên: **"Ăn bún bò 40k, đổ xăng 50 cành bằng ví MoMo, hôm qua mua áo 2 lít"** → tự động bóc tách thành các giao dịch chuẩn xác.
- **Hệ thống AI Đa tầng (Hybrid AI Router):**
  - **Ngoại tuyến (Offline):** Bộ phân tích tích hợp chạy ngay trong trình duyệt (0ms, không tốn data, hiểu tiếng lóng `cành`, `lít`, `loét`, `củ`, `xu`, `nửa củ`, `nửa lít` và mốc thời gian `hôm qua`, `hôm kia`, `sáng nay`, `15/10`).
  - **Trực tuyến (Online):** Kết nối qua **9Router AI Gateway** (OpenAI-compatible) đến **Google Gemini / GPT** — tự động tối ưu token, fallback linh hoạt.
  - **Dự phòng thông minh:** Tự động chuyển mượt về AI cục bộ nếu mất mạng hoặc máy chủ không phản hồi (>8s).
- Nhập bằng **giọng nói** (Web Speech API, hỗ trợ tiếng Việt).
- Xem trước kết quả trước khi lưu — không ghi nhầm vào sổ.

### 💵 Thu Chi hàng ngày
- Thêm / sửa / xóa giao dịch thu & chi, có xác nhận trước khi xóa
- **Chuyển tiền giữa các ví**: rút ATM về ví tiền mặt, chuyển qua MoMo… — *không làm thay đổi tổng số dư*, chỉ đổi nơi tiền nằm
- 14 danh mục trực quan (Ăn uống, Di chuyển, Mua sắm, Lương, Freelance...)
- Lọc nhanh: **Tất cả / Chi tiêu / Thu nhập / Chuyển ví**
- **Tìm kiếm & lọc nâng cao:** theo tên, ghi chú, danh mục, ví — tìm không dấu ("nuoc" ra "Mua nước"), kèm nút "Xem thêm"
- Nhập số tiền linh hoạt kiểu Việt: `50000`, `1.500.000`, `2tr`, `20k`, `1.2 tỷ`
- Điều khiển được bằng **bàn phím**: Tab/Enter để mở giao dịch, Esc để đóng hộp thoại

### 🍜 Chia tiền nhóm + VietQR + Sổ nợ
- Chia tiền **bảo toàn tổng** (chia phần nguyên + phân bổ phần dư, 300.000đ/4 người không bao giờ lệch 1đ)
- **Sinh mã VietQR** đóng sẵn số tiền + nội dung chuyển khoản — người khác chỉ cần quét (hỗ trợ MoMo, ZaloPay và 10+ ngân hàng)
- **Sổ nợ nhóm**: lập phiếu nợ, đánh dấu ai đã trả / chưa trả, tổng hợp đang phải thu
- Nút **"Ghi vào chi tiêu"** để lưu ngay phần của bạn vào sổ giao dịch thật

### 📊 Thống kê & Biểu đồ (Chart.js)
- **Biểu đồ tròn:** cơ cấu chi tiêu theo danh mục
- **Biểu đồ cột kép:** so sánh Thu nhập vs Chi tiêu
- **Biểu đồ đường:** xu hướng chi tiêu lũy kế
- Lọc theo **Tuần này / Tháng này / Năm nay** (đã sửa lỗi múi giờ: giao dịch hôm nay luôn được tính)

### 🎯 Ngân sách & Mục tiêu
- Đặt hạn mức chi tiêu tháng theo từng danh mục
- Thanh tiến độ + trạng thái: *Ổn định / Sắp chạm hạn mức / Vượt hạn mức*
- Toast cảnh báo tự động khi chi ≥ 85% hoặc ≥ 100% hạn mức
- Mục tiêu tiết kiệm với tiến độ %

### 🔐 Bảo mật
- **Khoá ứng dụng bằng mã PIN** (băm bằng PBKDF2 150.000 vòng, không lưu PIN dạng rõ), tự khoá lại sau 5 phút
- **Ẩn số dư** khi ở nơi công cộng
- Đăng nhập bằng **Google** hoặc tài khoản riêng, đồng bộ Firestore theo tài khoản
- Firestore Security Rules chặt chẽ: mỗi bản ghi 1 tài liệu, kiểm tra kiểu dữ liệu & giới hạn kích thước

### 📑 Dữ liệu & Báo cáo
- Xuất **Excel (.xlsx)** (2 sheet: GiaoDich + TomTat) và **báo cáo PDF**
- **Sao lưu/Phục hồi JSON** đầy đủ, file khôi phục được kiểm tra & làm sạch trước khi ghi đè
- Chế độ **dữ liệu mẫu (demo)** tách biệt hoàn toàn: không đồng bộ lên tài khoản thật, tắt là xoá đúng các bản ghi mẫu

### 📱 PWA & Giao diện
- **Bố cục 2 cột trên desktop** (trên mobile vẫn 1 cột): danh sách bên trái, AI + ngân sách bên phải
- Cài đặt như app, chạy offline nhờ Service Worker; có nút **"Xem nhanh bản Demo"** ngay trên Trang chủ
- **Dark / Light mode** — màu chữ đạt chuẩn **WCAG AA** ở cả hai chế độ
- Shortcut PWA: `?action=add` (ghi nhanh), `?page=stats` (mở thống kê)

---

## 🚀 Chạy ứng dụng

**Cách 1 — mở trực tiếp:** Nhấp đúp `index.html` để mở bằng trình duyệt.

**Cách 2 — chạy bằng local server** (khuyến nghị, để PWA hoạt động đầy đủ):

```bash
# Dùng Node.js
npx serve .

# hoặc Python
python -m http.server 8000
```

Sau đó mở `http://localhost:8000`.

---

## 🛠️ Công nghệ

| Thành phần | Chi tiết |
|---|---|
| Frontend | HTML5, CSS3 (CSS Variables, Flexbox, Grid), Vanilla JavaScript (ES6+) |
| Biểu đồ | [Chart.js v4](https://www.chartjs.org/) |
| Xuất Excel | [SheetJS (xlsx)](https://sheetjs.com/) |
| Icon | [Font Awesome 6](https://fontawesome.com/) |
| Font | Google Fonts — Inter |
| Lưu trữ | `localStorage` |
| Offline | Service Worker (`sw.js`) + Web App Manifest |

Không cần `npm install` hay build step — mở là chạy.

---

## 📂 Cấu trúc dự án

```
├── index.html          # Markup SPA (4 trang: Chủ, Thống kê, Ngân sách, Cài đặt)
├── manifest.json       # Cấu hình PWA
├── sw.js               # Service Worker (cache offline)
├── assets/             # Icon app (svg, png 192/512)
├── css/                # variables, style, stats, budget, pwa, responsive
└── js/                 # app, utils, storage, category, transaction,
                        # chart, budget, export, notification, pwa
```

---

## 💾 Sao lưu dữ liệu

- **Chưa đăng nhập**: dữ liệu chỉ lưu trên trình duyệt này — xóa dữ liệu trình duyệt sẽ mất. Hãy dùng **Cài đặt → Sao lưu & Phục hồi** để tải file JSON.
- **Đã đăng nhập**: dữ liệu được đồng bộ lên máy chủ Firestore theo tài khoản, dùng lại được trên nhiều thiết bị.
- **Đăng xuất**: app đẩy nốt thay đổi chưa đồng bộ lên máy chủ *trước*, rồi mới xóa dữ liệu cục bộ.

## 🔐 Nguyên tắc bảo mật đã triển khai

- Firestore Security Rules: mỗi người dùng chỉ đọc/ghi được dữ liệu của chính mình (`firestore.rules`), mặc định chặn mọi truy cập khác.
- Kiểm tra kiểu dữ liệu, khoảng giá trị và định dạng ngay trong Rules.
- Kiểm tra (validate) mọi dữ liệu đọc từ cloud, từ file sao lưu và từ bộ nhớ cục bộ trước khi sử dụng.
- Escape toàn bộ nội dung người dùng khi hiển thị + Content-Security-Policy.
- **Tiền tệ**: số tiền luôn lưu gốc bằng VNĐ; chọn USD/EUR chỉ thay đổi cách hiển thị, không sửa dữ liệu lịch sử.

---

## ☁️ Tài khoản & Lưu đám mây (Firebase)

Mỗi người dùng có tài khoản **email + mật khẩu** riêng; dữ liệu tự đồng bộ lên Firestore khi online, đọc lại khi đăng nhập ở thiết bị khác. Khi chưa cấu hình Firebase, app vẫn chạy bình thường ở chế độ local (localStorage).

### Thiết lập (1 lần)

1. Tạo project tại [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: bật **Email/Password**.
3. **Firestore Database → Create database** (test mode hoặc production).
4. **Project settings → Web app** → copy `firebaseConfig` dán vào `js/config.local.js` (copy từ `js/config.example.js` — file này được `.gitignore` bảo vệ, không bao giờ bị lộ lên GitHub).
5. Đẩy rule bảo mật (mỗi user chỉ thấy dữ liệu của mình):

```bash
npm i -g firebase-tools
firebase login
firebase init firestore   # chọn project, dùng sẵn firestore.rules trong thư mục này
firebase deploy --only firestore:rules
```

Hoặc copy nội dung `firestore.rules` dán tay vào mục *Firestore → Rules* trên Firebase Console.

---

## 📄 Giấy phép

Dự án phục vụ học tập & sử dụng cá nhân — free to use.
