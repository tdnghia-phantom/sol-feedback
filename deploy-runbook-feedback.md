# DEPLOY RUNBOOK — Trang Feedback đa-workshop SOL

> Phiên bản: v1.3.0 (CHG-01 bỏ intent · CHG-02 WIZARD · CHG-03 thẻ mở đầu theo poster) · Ngày: 2026-07-19 · Thời gian deploy dự kiến: **~15 phút**
> Nguyên tắc sắt: project ĐỘC LẬP 100% khỏi landing — **Sheet MỚI, Apps Script MỚI,
> repo MỚI, subdomain riêng.** Không dùng lại bất kỳ ID/URL nào của landing.

## Bước 1 — Google Sheet + Apps Script (5 phút)

1. Tạo **Google Sheet MỚI**, đặt tên ví dụ `SOL Feedback (ALL workshops)`.
2. Menu `Tiện ích mở rộng → Apps Script` → xóa code mặc định → dán toàn bộ
   `apps-script/Code.gs` → Lưu.
3. Trong editor, chọn hàm **`setupFeedbackSheet`** → Run → cấp quyền khi được hỏi.
   → Kiểm tra Sheet: có tab `feedback` (13 cột, hàng 1 đóng băng, cột I=phone định
   dạng text) + tab `dashboard` (4 bảng thống kê).
4. `Deploy → New deployment → Web app`:
   - Execute as: **Me** · Who has access: **Anyone**
   - Bấm Deploy → **copy URL** dạng `https://script.google.com/macros/s/…/exec`.
5. Mở URL đó bằng trình duyệt (GET) → phải thấy `{"ok":true,"service":"sol-feedback"...}` ✅ (TC-13).

## Bước 2 — Telegram (3 phút)

1. `Project Settings → Script properties` → thêm 2 property:
   - `TELEGRAM_BOT_TOKEN` = token bot *(dùng lại bot cũ hoặc tạo bot riêng — khuyến
     nghị **group Telegram riêng cho feedback** để cảnh báo ≤2★ không chìm giữa tin đơn hàng)*
   - `TELEGRAM_CHAT_ID` = chat id của group nhận cảnh báo
2. Trong editor chạy hàm **`testTelegramAlert`** → group phải nhận tin
   `⚠️ FEEDBACK THẤP (2★)…(test)`. Không nhận → kiểm token/chat_id/bot đã được add vào group.

## Bước 3 — Nối frontend (1 phút)

Mở `feedback-submit.js` → thay dòng:
```js
ENDPOINT: '{{APPS_SCRIPT_FEEDBACK_URL}}'
```
bằng URL Web app vừa copy ở Bước 1.4. **Chỉ sửa đúng 1 chỗ này.**

## Bước 4 — Host tĩnh + subdomain (5 phút)

1. Push 4 file `index.html · router.js · cookery.html · feedback-submit.js`
   (+ thư mục `assets/` nếu muốn giữ file ảnh gốc — trang đã nhúng base64 nên không
   bắt buộc) lên **repo GitHub MỚI** → import vào **Vercel** (hoặc Netlify/Cloudflare
   Pages — trang tĩnh thuần, không cần build command, output = root).
2. Vercel → Settings → Domains → thêm `feedback.sol.vn` → về trình quản lý DNS của
   `sol.vn` tạo **CNAME**: `feedback` → `cname.vercel-dns.com` *(Netlify/CF Pages:
   theo CNAME nền tảng chỉ định)*. Chờ SSL tự cấp (vài phút).
3. Smoke test ngay: `feedback.sol.vn/?ws=cookery` → trang cookery ·
   `feedback.sol.vn` → fallback ✅ (TC-01, TC-02).

## Bước 5 — Chạy trọn bộ test tay (10 phút)

Mở `docs/test-plan-uat.md` → chạy TC-01 → TC-13 (checklist tick từng ô).
Đặc biệt đừng bỏ: **TC-07/08** (Telegram đúng ngưỡng) · **TC-10** (số 0 đầu SĐT) ·
**TC-16** (rà chéo không dính landing).

---

## §6 — Thêm workshop MỚI trong 10 phút (FR-09)

Ví dụ thêm workshop Science:

1. Copy `cookery.html` → `science.html`.
2. Trong `science.html` sửa: (a) `window.WS_ID = 'science'` · (b) `<title>` ·
   (c) headline/câu chữ/emoji/ảnh + toàn bộ nội dung thẻ mở đầu trong section `data-fb-intro` (bỏ hẳn section này nếu workshop không cần) *(tự do đổi toàn bộ thiết kế — trang standalone)* ·
   (d) nếu đổi bộ câu hỏi: giữ nguyên các `data-fb-group`/`data-fb` bắt buộc
   (`rating`, `child_enjoy`) là đủ để backend hoạt động — câu hỏi riêng cứ thêm control
   với `data-check`/`data-chip` mới, tất cả tự vào `answers_json`, **không cần sửa backend**.
3. Mở `router.js` → thêm 1 dòng registry:
   ```js
   science: 'science.html',
   ```
4. Push → chạy TC-14: `/?ws=science` hiển thị trang mới, ghi cùng Sheet với
   `ws_id=science`, cookery không suy chuyển.

## §7 — Vận hành sau go-live

- **QR mỗi workshop**: tạo QR trỏ `https://feedback.sol.vn/?ws=cookery&utm_source=qr_class`
  (đổi `utm_source` theo kênh: `qr_class`, `zalo_oa`, `zalo_group`…) → in kèm poster
  "Cảm ơn Quý phụ huynh" phát cuối buổi — cột `utm_source` sẽ tự cho biết kênh nào hiệu quả.
- **Quy trình 3 bước khi có cảnh báo ≤2★** *(mục tiêu: gọi xử lý TRONG NGÀY trước khi
  phụ huynh đăng review 1 sao)*: (1) đọc góp ý + SĐT trong tin Telegram → (2) người phụ
  trách gọi/Zalo xin lỗi + lắng nghe → (3) ghi kết quả xử lý vào cột `note` của dòng đó.
- **Khai thác testimonial**: tab `dashboard` → bảng "🌟 ỨNG VIÊN TESTIMONIAL" (5★ +
  đã cho phép) → chọn câu hay đưa vào landing SOL Cookery. *(Chỉ dùng feedback có
  `allow_testimonial=TRUE` — đây là bằng chứng consent theo Luật 91/2025.)*
- **Backup**: Google Sheet tự lưu; mỗi cuối tháng File → Download → xlsx cất 1 bản.

## §8 — Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Bấm Gửi báo "chưa cấu hình máy chủ" | Quên Bước 3 (ENDPOINT còn placeholder) | Dán URL Web app vào `feedback-submit.js`, push lại |
| Gửi được nhưng Sheet trống | Deploy Apps Script chưa để "Anyone" / dán nhầm URL bản cũ | Deploy lại Web app, **New deployment** (URL đổi sau mỗi lần deploy mới) → cập nhật ENDPOINT |
| Telegram im lặng khi ≤2★ | Sai token/chat_id, bot chưa vào group | Chạy `testTelegramAlert` để chẩn đoán |
| SĐT mất số 0 đầu | Ai đó xóa định dạng cột I | Chạy lại `setupFeedbackSheet` (không mất dữ liệu cũ) |
| `?ws=abc` ra fallback dù đã tạo trang | Quên thêm dòng registry trong `router.js` | Thêm dòng + push |

## Còn `[CẦN VERIFY]` (chốt trước go-live)

- [ ] `APPS_SCRIPT_FEEDBACK_URL` (Bước 1.4 → Bước 3)
- [ ] `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — dùng lại bot cũ hay tách group riêng?
- [ ] Link group Zalo phụ huynh (nếu muốn hiện nút ở màn cảm ơn) → `window.ZALO_GROUP_URL` trong `cookery.html`
- [ ] Link **Chính sách bảo vệ dữ liệu cá nhân** của SOL → chèn vào `privacy-note`
  trong `cookery.html` (NFR-PDP-02 — Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP)
- [ ] Nội dung/ảnh trang cookery (ảnh hero hiện dùng collage từ poster Cảm ơn — muốn
  thay ảnh khác: thay chuỗi base64 hoặc trỏ `src` sang `assets/…`)
- [ ] Danh sách workshop tiếp theo cần thêm vào registry
