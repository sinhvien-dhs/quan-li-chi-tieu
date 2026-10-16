# SpendWise AI Proxy (Cloudflare Worker)

Máy chủ Serverless trung gian bảo vệ **Google Gemini 2.0 Flash API Key** cho SpendWise:
- **Người dùng không cần nhập API key:** Người dùng vào web là dùng được AI ngay.
- **Bảo mật tuyệt đối:** API key được lưu trong Secret của Cloudflare, không lộ lên GitHub Pages hay trình duyệt.
- **Miễn phí 100%:** Cloudflare Workers cung cấp 100.000 requests/ngày miễn phí; Google AI Studio cung cấp 15 RPM / 1.500 RPD miễn phí cho Gemini 2.0 Flash.
- **Hỗ trợ Hybrid:** Khi mất mạng (offline) hoặc worker lỗi, ứng dụng tự động dùng AI nội bộ trong máy (0ms).

---

## Cách triển khai nhanh (2 phút — giao diện Web, không cần cài đặt gì)

### Bước 1: Lấy Gemini API Key miễn phí
1. Truy cập [Google AI Studio](https://aistudio.google.com/).
2. Đăng nhập tài khoản Google và bấm **Get API key** → **Create API key**.
3. Copy chuỗi API Key (`AIzaSy...`).

---

### Bước 2: Tạo Worker trên Cloudflare
1. Đăng nhập vào [Cloudflare Dashboard](https://dash.cloudflare.com/) (tạo tài khoản miễn phí nếu chưa có).
2. Ở thanh menu bên trái, chọn **Workers & Pages** → **Overview** → bấm **Create application** (hoặc **Create Worker**).
3. Đặt tên worker: ví dụ `spendwise-ai` → bấm **Deploy**.
4. Sau khi deploy xong, bấm nút **Edit code**:
   - Xóa toàn bộ code mặc định trong trình soạn thảo.
   - Mở file [`worker/worker.js`](worker.js) trong dự án này, copy toàn bộ nội dung và paste vào trình soạn thảo Cloudflare.
   - Bấm **Deploy** (ở góc trên bên phải).

---

### Bước 3: Thêm Secret `GEMINI_API_KEY`
1. Vẫn trong trang quản lý của Worker `spendwise-ai`, bấm vào tab **Settings** → chọn **Variables and Secrets**.
2. Tại mục **Secrets**, bấm **Add**:
   - Tên biến (Variable name): `GEMINI_API_KEY`
   - Giá trị (Value): Dán API key Gemini bạn đã lấy ở Bước 1.
3. Bấm **Deploy** hoặc **Save**.

---

### Bước 4: Kết nối với SpendWise
1. Copy đường dẫn Worker của bạn (ví dụ: `https://spendwise-ai.<ten-cua-ban>.workers.dev`).
2. Bạn có thể sử dụng theo 2 cách:
   - **Cách 1 (Dành cho người quản trị / Deploy web):** Mở `js/config.local.js` (hoặc cấu hình secret GitHub `AI_PROXY_URL`), thêm:
     ```javascript
     var AI_PROXY_URL = "https://spendwise-ai.<ten-cua-ban>.workers.dev";
     ```
   - **Cách 2 (Trực tiếp trên giao diện web):** Vào tab **Cài đặt** → **Tiện ích & AI** → Dán link vào ô **Máy chủ AI Cloudflare** → Bấm **Thử kết nối**.

---

## Kiểm tra hoạt động
Bạn có thể mở trực tiếp link worker trên trình duyệt (`https://spendwise-ai.<ten-cua-ban>.workers.dev`).
Kết quả trả về dạng JSON:
```json
{
  "status": "ok",
  "service": "SpendWise AI Proxy",
  "version": "1.0.0",
  "model": "gemini-2.0-flash",
  "configured": true
}
```
Nếu `configured: true`, hệ thống đã sẵn sàng phục vụ phân tích câu văn thông minh!
