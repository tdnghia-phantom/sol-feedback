# DEPLOY RUNBOOK — Trang Feedback đa-workshop SOL

> Phiên bản: v1.3.0 (CHG-01 bỏ intent · CHG-02 WIZARD · CHG-03 thẻ mở đầu theo poster) + **Phase 2 (trang quản trị admin.html + staff-role)** · Ngày: 2026-07-19 · Thời gian deploy dự kiến: **~15 phút** (+5' cho admin)
> Nguyên tắc sắt: project ĐỘC LẬP 100% khỏi landing — **Sheet MỚI, Apps Script MỚI,
> repo MỚI, subdomain riêng.** Không dùng lại bất kỳ ID/URL nào của landing.

## Bước 1 — Google Sheet + Apps Script (5 phút)

1. Tạo **Google Sheet MỚI**, đặt tên ví dụ `SOL Feedback (ALL workshops)`.
2. Menu `Tiện ích mở rộng → Apps Script` → xóa code mặc định → dán toàn bộ
   `apps-script/Code.gs` → Lưu.
   **Thêm file HTML cho trang quản trị:** trong editor bấm `+ → HTML`, đặt tên **`admin`**
   (Apps Script tự thêm đuôi → file `admin.html`) → dán toàn bộ `apps-script/admin.html` → Lưu.
3. Trong editor, chọn hàm **`setupFeedbackSheet`** → Run → cấp quyền khi được hỏi.
   → Kiểm tra Sheet: có tab `feedback` (13 cột, hàng 1 đóng băng, cột I=phone định
   dạng text) + tab `dashboard` (4 bảng thống kê).
   Chọn tiếp hàm **`setupStaffRoleSheet`** → Run → tạo tab **`staff-role`** (7 cột:
   `passcode·name·role·active·telegram_user_id·phone·note`) + 1 dòng admin mẫu.
   **Xem hộp thoại/Executions log để lấy passcode admin mẫu** (dạng `ADMIN-… (5 ký tự)`).
   Chọn tiếp hàm **`setupFeedbackPageList`** → Run → tạo tab **`feedback-page-list`** (6 cột:
   `slug·label·active·note·open_at·close_at`) + nạp sẵn 2 dòng: `ckry` (SOL Cookery) và `test` (trang test) — đều BẬT.
   Chọn tiếp hàm **`installAutoToggleTrigger`** → Run → cài lịch tự bật/tắt (kiểm tra **mỗi 1 tiếng**).
   → **Đặt Time zone project = `Asia/Ho_Chi_Minh`** (Project Settings) để giờ hẹn `open_at/close_at` đúng giờ VN.
4. `Deploy → New deployment → Web app`:
   - Execute as: **Me** · Who has access: **Anyone**
   - Bấm Deploy → **copy URL** dạng `https://script.google.com/macros/s/…/exec`.
5. Health check: mở **`<URL>?action=health`** trên trình duyệt (GET) → phải thấy
   `{"ok":true,"service":"sol-feedback"...}` ✅ (TC-13). *(Mở URL không kèm `?action=health`
   giờ ra **trang đăng nhập quản trị** — đúng, xem Bước 6.)*

## Bước 2 — Telegram (3 phút)

> **MỌI cảm nhận mới đều bắn 1 tin Telegram** (`💬 CẢM NHẬN MỚI (n★)`); riêng rating ≤ 2★
> nhấn mạnh `⚠️ FEEDBACK THẤP`. **Bắt buộc điền 2 property dưới, KHÔNG có = không có tin nào.**

1. `Project Settings → Script properties` → thêm 2 property:
   - `TELEGRAM_BOT_TOKEN` = token bot *(dùng lại bot cũ hoặc tạo bot riêng — khuyến
     nghị **group Telegram riêng cho feedback** để tin không chìm giữa tin đơn hàng)*
   - `TELEGRAM_CHAT_ID` = chat id của group nhận tin
2. Trong editor chạy hàm **`testTelegramAlert`** → group phải nhận tin
   `⚠️ FEEDBACK THẤP (2★)…(test)`. Không nhận → kiểm token/chat_id/bot đã được add vào group.

## Bước 3 — Nối frontend (1 phút)

Mở `feedback-submit.js` → thay dòng:
```js
ENDPOINT: '{{APPS_SCRIPT_FEEDBACK_URL}}'
```
bằng URL Web app vừa copy ở Bước 1.4. **Chỉ sửa đúng 1 chỗ này.**

## Bước 4 — Host tĩnh + subdomain (5 phút)

1. Push 5 file `index.html · router.js · cookery.html · test.html · feedback-submit.js`
   (+ thư mục `assets/` nếu muốn giữ file ảnh gốc — trang đã nhúng base64 nên không
   bắt buộc) lên **repo GitHub MỚI** → import vào **Vercel** (hoặc Netlify/Cloudflare
   Pages — trang tĩnh thuần, không cần build command, output = root).
2. Vercel → Settings → Domains → thêm `feedback.sol.vn` → về trình quản lý DNS của
   `sol.vn` tạo **CNAME**: `feedback` → `cname.vercel-dns.com` *(Netlify/CF Pages:
   theo CNAME nền tảng chỉ định)*. Chờ SSL tự cấp (vài phút).
3. Smoke test ngay: `feedback.sol.vn/?sw=ckry` → trang cookery ·
   `feedback.sol.vn` → fallback ✅ (TC-01, TC-02).

## Bước 5 — Chạy trọn bộ test tay (10 phút)

Mở `docs/test-plan-uat.md` → chạy TC-01 → TC-13 (checklist tick từng ô).
Đặc biệt đừng bỏ: **TC-07/08** (Telegram đúng ngưỡng) · **TC-10** (số 0 đầu SĐT) ·
**TC-16** (rà chéo không dính landing).

## Bước 6 — TRANG QUẢN TRỊ `admin.html` (Phase 2 — mới)

> Dashboard giờ là **giao diện Apps Script có đăng nhập theo role**, không chỉ là tab Sheet.
> Cơ chế bảo mật giống project Landingpage-SOL-COOK: đăng nhập **chỉ bằng passcode**, role
> do server tra sheet `staff-role` (không có ô chọn role), phiên token ~6h, hàm admin bị
> chặn ở **tầng server** (staff gọi vào là bị từ chối, không chỉ ẩn nút).

1. **URL trang quản trị = chính URL Web app** (`https://script.google.com/macros/s/…/exec`,
   không kèm `?action=`). Mở ra → màn **Đăng nhập** (1 ô passcode).
2. Đăng nhập bằng **passcode admin mẫu** lấy ở Bước 1.3 (`ADMIN-… (5 ký tự)`).
   → Vào được 3 tab: **💬 Cảm nhận** · **📊 Dashboard** · **🛠️ Quản lý** *(Quản lý gồm 2 mục:
   Trang Feedback + Nhân viên; mỗi mục có danh sách + nút **+ Tạo mới** mở popup)*.
3. **ĐỔI passcode admin ngay:** tab **Quản lý → Nhân viên** → **Sửa** dòng "Admin SOL" → đổi ô
   *Passcode* → **Lưu**. *(Passcode cũ chỉ mất khi bạn khóa/đổi dòng đó.)*
4. **Thêm nhân viên:** Quản lý → Nhân viên → **+ Tạo mới** → điền `passcode·tên·vai trò·telegram_user_id·SĐT·ghi chú`
   → Lưu (bắn Telegram cho admin). Role `staff` chỉ thấy tab **Cảm nhận**; role `admin` thấy cả 3 tab.
5. **Cột `telegram_user_id`**: điền user_id Telegram (số) của từng người — danh bạ/whitelist bot Telegram sau này. Để trống nếu chưa dùng.
6. **Bật/tắt trang feedback:** Quản lý → **Trang Feedback** → mỗi trang có nút **Bật/Tắt** (có **popup xác nhận**;
   xác nhận xong **bắn Telegram** cho admin). **Tắt** một trang ⇒ phụ huynh mở link **bị redirect thẳng về
   `https://fbk.solenglishland.vn/` ngay ở router — KHÔNG tải trang workshop** (nhanh, không lộ nội dung);
   **Bật** lại là dùng ngay. Danh sách quản lý bằng sheet **`feedback-page-list`**; mỗi dòng hiện sẵn
   **đường dẫn `?sw=…`** để copy đi in QR/gửi Zalo. Thêm trang mới: **+ Tạo mới** (slug phải khớp `?sw=` trên link) → bắn Telegram.
   *(Có sẵn trang **`?sw=test`** — chỉ chữ "test" giữa màn hình — để bạn thử bật/tắt + redirect.)*
   **Lịch tự động:** trong popup Tạo/Sửa có 2 ô **🟢 Giờ bắt đầu (tự MỞ)** / **🔴 Giờ kết thúc (tự TẮT)** —
   **bấm vào ô để chọn ngày+giờ bằng lịch** (khung 24h, hiển thị `dd-mm-yy hh:mm`, không gõ tay). Đến giờ hẹn,
   hệ thống **tự bật/tắt** (trigger `autoTogglePages` **mỗi 1 tiếng**) và **bắn Telegram**. **Khi bấm Lưu, trạng thái
   Bật/Tắt được TÍNH LẠI ngay theo lịch + giờ hiện tại.** Để trống = không tự động. *(Đặt giờ tương lai; kiểm tra
   mỗi 1 tiếng nên tự bật/tắt có thể trễ tối đa ~1 tiếng.)*
7. **Quy trình xử lý ≤2★ ngay trong trang**: tab Cảm nhận → lọc **"≤ 2★"** → đọc góp ý/SĐT →
   gọi phụ huynh → gõ kết quả vào ô **Ghi chú xử lý** của đúng dòng → **Lưu note** (ghi thẳng
   vào cột `note` của Sheet).

**Kiểm thử nhanh (tự kiểm):**
- [ ] Login sai passcode → báo lỗi, không vào.
- [ ] Login admin → 3 tab (Cảm nhận/Dashboard/Quản lý); login staff → **CHỈ thấy Cảm nhận**.
- [ ] Mở DevTools console gọi `google.script.run…apiDashboard(token_staff)` → **bị từ chối**
  (`FORBIDDEN`), không lộ số liệu.
- [ ] `<URL>?action=health` vẫn trả JSON `{ok:true}` (form phụ huynh không bị ảnh hưởng).

---

## §6 — Thêm workshop MỚI trong 10 phút (FR-09)

Ví dụ thêm workshop Science:

1. Copy `cookery.html` → `science.html`.
2. Trong `science.html` sửa: (a) `window.WS_ID = 'sci'` · (b) `<title>` ·
   (c) headline/câu chữ/emoji/ảnh + toàn bộ nội dung thẻ mở đầu trong section `data-fb-intro` (bỏ hẳn section này nếu workshop không cần) *(tự do đổi toàn bộ thiết kế — trang standalone)* ·
   (d) nếu đổi bộ câu hỏi: giữ nguyên các `data-fb-group`/`data-fb` bắt buộc
   (`rating`, `child_enjoy`) là đủ để backend hoạt động — câu hỏi riêng cứ thêm control
   với `data-check`/`data-chip` mới, tất cả tự vào `answers_json`, **không cần sửa backend**.
3. Mở `router.js` → thêm 1 dòng registry:
   ```js
   sci: 'science.html',
   ```
4. Push → chạy TC-14: `/?sw=sci` hiển thị trang mới, ghi cùng Sheet với
   `ws_id=science`, cookery không suy chuyển.

## §7 — Vận hành sau go-live

- **QR mỗi workshop**: tạo QR trỏ `https://feedback.sol.vn/?sw=ckry&utm_source=qr_class`
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
| `?sw=abc` ra fallback dù đã tạo trang | Quên thêm dòng registry trong `router.js` | Thêm dòng + push |

## Còn `[CẦN VERIFY]` (chốt trước go-live)

- [ ] `APPS_SCRIPT_FEEDBACK_URL` (Bước 1.4 → Bước 3)
- [ ] **Passcode admin thật** — đổi khỏi mã mẫu `ADMIN-… (5 ký tự)` ngay sau lần đăng nhập đầu (Bước 6.3)
- [ ] **Nhập nhân viên + role + telegram_user_id** vào `staff-role` (Bước 6.4–6.5)
- [ ] `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — dùng lại bot cũ hay tách group riêng?
- [ ] Link group Zalo phụ huynh (nếu muốn hiện nút ở màn cảm ơn) → `window.ZALO_GROUP_URL` trong `cookery.html`
- [ ] Link **Chính sách bảo vệ dữ liệu cá nhân** của SOL → chèn vào `privacy-note`
  trong `cookery.html` (NFR-PDP-02 — Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP)
- [ ] Nội dung/ảnh trang cookery (ảnh hero hiện dùng collage từ poster Cảm ơn — muốn
  thay ảnh khác: thay chuỗi base64 hoặc trỏ `src` sang `assets/…`)
- [ ] Danh sách workshop tiếp theo cần thêm vào registry
