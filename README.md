# 💰 SpendWise — Quản Lý Chi Tiêu Cá Nhân

Ứng dụng web **Single Page Application (SPA)** giúp theo dõi thu chi cá nhân, phân tích ngân sách theo danh mục, trực quan hóa dữ liệu bằng biểu đồ và xuất báo cáo — hoạt động được cả **offline** như một app điện thoại.

![SpendWise](https://img.shields.io/badge/SpendWise-v1.0-6C63FF?style=for-the-badge&logo=wallet)
![Tech](https://img.shields.io/badge/HTML5%20%7C%20CSS3%20%7C%20VanillaJS-orange?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-00C897?style=for-the-badge)

---

## ✨ Tính Năng

### 💵 Thu Chi hàng ngày
- Thêm / sửa / xóa giao dịch thu & chi, có xác nhận trước khi xóa
- 14 danh mục trực quan (Ăn uống, Di chuyển, Mua sắm, Lương, Freelance...)
- Lọc nhanh: **Tất cả / Chi tiêu / Thu nhập**
- **Tìm kiếm & lọc nâng cao:** theo tên, ghi chú, danh mục, ví — kèm nút "Xem thêm" khi có hàng nghìn giao dịch
- Nhập số tiền linh hoạt kiểu Việt: `50000`, `1.500.000`, `2tr`, `20k`, `1.2 tỷ`
- Tự động tính số dư, cảnh báo khi số dư âm
- Điều khiển được bằng **bàn phím**: Tab/Enter để mở giao dịch, Esc để đóng hộp thoại

### 📊 Thống kê & Biểu đồ (Chart.js)
- **Biểu đồ tròn:** cơ cấu chi tiêu theo danh mục
- **Biểu đồ cột kép:** so sánh Thu nhập vs Chi tiêu
- **Biểu đồ đường:** xu hướng chi tiêu lũy kế
- Lọc theo **Tuần này / Tháng này / Năm nay**

### 🎯 Ngân sách
- Đặt hạn mức chi tiêu tháng theo từng danh mục
- Thanh tiến độ + trạng thái: *Ổn định / Sắp chạm hạn mức / Vượt hạn mức*
- Toast cảnh báo tự động khi chi ≥ 85% hoặc ≥ 100% hạn mức

### 📑 Dữ liệu & Báo cáo
- Xuất **Excel (.xlsx)** (2 sheet: GiaoDich + TomTat) và **báo cáo PDF**; **Sao lưu/Phục hồi JSON** đầy đủ (giao dịch, ngân sách, ví, mục tiêu, quy tắc định kỳ, cài đặt)
- File khôi phục được kiểm tra & làm sạch trước khi ghi đè (loại bản ghi hỏng, chống XSS, tự sao lưu bản hiện tại)
- Chế độ **dữ liệu mẫu (demo)** tách biệt hoàn toàn: không bao giờ đẩy lên tài khoản thật, tắt là xoá đúng các bản ghi mẫu
- Nhắc nhở ghi chép hằng ngày qua Web Notification (hoạt động khi app đang mở)

### 📱 PWA & Giao diện
- Cài đặt như app (A2HS), chạy offline nhờ Service Worker
- **Dark / Light mode** — biểu đồ tự đồng bộ theme, màu chữ đạt chuẩn **WCAG AA** ở cả hai chế độ
- Mobile-first, responsive trên điện thoại / tablet / PC
- Bill Splitter — chia tiền nhanh cho nhóm (tổng luôn khớp tuyệt đối)
- Tour hướng dẫn cho người dùng mới
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
4. **Project settings → Web app** → copy `firebaseConfig` dán vào `js/config.js`.
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
