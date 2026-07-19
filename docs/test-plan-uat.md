# TEST PLAN + UAT — Trang Feedback đa-workshop SOL

> Phiên bản: v1.3.0 (CHG-01 + CHG-02 wizard + CHG-03 thẻ mở đầu) · Ngày: 2026-07-19 · Tầng: **T1-Lean** (gd5)
> Oracle: Gherkin trong `docs/feedback-srs-lite.md` (spec-driven — KHÔNG lấy code làm chuẩn).

## 1. Kết quả automated (đã chạy trong môi trường build)

```
UNIT TEST: 46 passed · 0 failed   (node tests/unit.test.js — v1.2.0)
  UT-R1…R11   Router: resolve/fallback/giữ-utm/chống open-redirect/prototype-safe
  UT-V1…V11   Validate: bắt buộc rating+child_enjoy, bảng SĐT 9–11 số, normalize
  UT-P1…P9+6b Payload: Field Schema Contract, liked[], cắt 1500, intent luôn '' (CHG-01)
  UT-S1…S9    fbStepGuard: gác từng bước wizard (CHG-02 / FR-UX-01)
  UT-Q1…Q3    utm_source parser
SANITY CHECK: PASS
  · 0 id trùng (index: 0 id · cookery: 10 id)      · 17/17 hook data-fb đúng contract
  · không thẻ <form> thật (FR-04)                   · checkbox testimonial KHÔNG tick sẵn (NFR-PDP-01)
  · honeypot ẩn bằng CSS, không type=hidden          · 5 step đúng thứ tự, auto-advance đúng 2 bước bắt buộc
  · nhãn chip/checkbox khớp contract từng ký tự       · size: cookery 245KB · index 72KB (≤350KB NFR-PERF-01)
```

⚠️ Chưa test được trong build (cần deploy thật): Apps Script + Sheet + Telegram
→ phủ bằng TC tay bên dưới, chạy NGAY SAU deploy theo runbook (10 phút).

## 2. Test case tay — map 1:1 Definition of Done (spec §6)

| TC | DoD | Bước | Kỳ vọng | ✔ |
|---|---|---|---|---|
| TC-01 | §6.1 | Mở `feedback.sol.vn/?ws=cookery` | Hiện trang cookery (redirect, URL thành `/cookery.html`) | ☐ |
| TC-02 | §6.1 | Mở `/?ws=lung-tung` và `/` (không ws) | Trang fallback: logo SOL + Zalo 0938.206.968 — không trắng trang, không lỗi kỹ thuật | ☐ |
| TC-03 | §6.3 | Bấm Gửi khi CHƯA chọn sao / chưa chọn "bé có thích" | Chặn gửi, báo nhẹ nhàng cạnh đúng mục, cuộn tới lỗi | ☐ |
| TC-04 | §6.4 | SĐT bỏ trống → Gửi · SĐT `abc` → Gửi | Trống: gửi được · `abc`: báo lỗi tại ô SĐT | ☐ |
| TC-05 | §6.2 | Điền đủ (rating 4, chọn 2 mục liked, comment tiếng Việt có dấu — form chỉ còn 5 bước, KHÔNG còn câu "muốn học tiếp") → Gửi | Màn 🎉 hiện, form ẩn | ☐ |
| TC-06 | §6.2 | Mở Sheet `feedback` | Đúng 1 dòng mới: `ws_id=cookery`, rating=4, các cột khớp; `answers_json` parse được, chứa đủ `liked[]` 2 phần tử; cột `intent` (F) trống — đúng CHG-01; comment giữ nguyên dấu tiếng Việt | ☐ |
| TC-07 | §6.5 | Gửi feedback rating=2 | Telegram nhận `⚠️ FEEDBACK THẤP (2★) · Workshop: cookery` đúng template, có SĐT nếu điền | ☐ |
| TC-08 | §6.5 | Gửi feedback rating=5 | Telegram KHÔNG nhận gì | ☐ |
| TC-09 | — | Bấm Gửi 2 lần thật nhanh (mạng chậm: bật throttling) | Nút chuyển "Đang gửi… ⏳" + disabled → Sheet chỉ có 1 dòng | ☐ |
| TC-10 | — | Gửi với SĐT `0938206968` | Ô phone trong Sheet hiển thị ĐỦ số 0 đầu (cột I định dạng text) | ☐ |
| TC-11 | — | Dev console: điền input honeypot (`document.querySelector('[data-fb-hp]').value='x'`) rồi Gửi | Client vẫn báo thành công NHƯNG Sheet KHÔNG có dòng mới (silent drop) | ☐ |
| TC-12 | — | Tạm điền sai `TELEGRAM_BOT_TOKEN` → gửi rating=1 | Dòng VẪN vào Sheet, client vẫn 🎉 (Telegram hỏng không phá ghi dữ liệu) → sửa lại token | ☐ |
| TC-13 | — | Mở URL Apps Script bằng GET (trình duyệt) | JSON `{ok:true, service:"sol-feedback"}` — không phục vụ HTML | ☐ |
| TC-14 | §6.6 | Làm theo runbook §6 "Thêm workshop mới": tạo `science.html` (WS_ID='science') + 1 dòng registry | `/?ws=science` chạy; dòng mới trong CÙNG Sheet với `ws_id=science`; trang cookery KHÔNG bị đụng | ☐ |
| TC-15 | — | Mở sheet `dashboard` sau vài feedback | Bảng điểm TB theo workshop, bảng hiệu quả kênh utm_source (thay bảng intent — CHG-01), danh sách ≤2★, ứng viên testimonial 5★ tự cập nhật | ☐ |
| TC-16 | §6.8 | Rà chéo cấu hình | Sheet ID / Apps Script URL / repo KHÔNG trùng bất kỳ giá trị nào của project landing | ☐ |
| TC-17 | §6.7 | Mở trên điện thoại thật (iOS Safari + Android Chrome) | Mỗi câu chiếm trọn màn hình, nút nằm vùng ngón cái, sao bấm dễ (58px), không phải zoom | ☐ |
| TC-18 | CHG-02 | Chọn 4★ → tự chuyển câu 2 → bấm ← quay lại | Sao 4 VẪN sáng + caption giữ nguyên; hiện nút "Tiếp tục ➜"; progress lùi về 1/5 | ☐ |
| TC-19 | CHG-02 | Ở câu 3 (liked) chưa chọn gì | Nút ghi "Bỏ qua bước này"; tick 1 mục → nút đổi thành "Tiếp tục ➜"; bỏ tick → đổi lại | ☐ |
| TC-20 | CHG-02 | Ở câu 5 chạm ô SĐT (bàn phím iOS mở) | Ô nhập + nút Gửi không bị bàn phím che khuất hẳn; cuộn được tới nút | ☐ |
| TC-21 | CHG-02 | Gửi thành công | Progress bar đầy 100%, nút ← và bộ đếm ẩn đi, confetti rơi 1 lần (tắt nếu máy bật giảm chuyển động) | ☐ |
| TC-22 | CHG-03 | Mở `/?ws=cookery` | Thẻ mở đầu hiện TRƯỚC (2 logo, thư cảm ơn, ảnh Story Telling, green-box); KHÔNG thấy topbar/progress/câu hỏi | ☐ |
| TC-23 | CHG-03 | Bấm "Gửi cảm nhận cho SOL 💌" ở thẻ mở đầu | Vào thẳng câu 1 (sao), topbar + progress 1/5 xuất hiện, không quay lại được intro bằng nút ← | ☐ |

## 3. Kịch bản UAT (đóng vai phụ huynh — 3 phút)

1. Quét QR/bấm link sau buổi học → trang mở < 2 giây trên 4G.
2. "Con mình thích lắm" → chạm 5 sao (thấy caption 🥰 đổi theo) → "Rất thích" → tick
   "Cô giáo" + "Thành phẩm (bánh) của bé" → "Có, rất muốn" → gõ 1 câu góp ý → điền tên
   + SĐT → tick cho phép testimonial → Gửi → thấy 🎉 + (nếu cấu hình) nút group Zalo.
3. Cảm nhận: KHÔNG bị hỏi thứ không cần, KHÔNG bắt buộc SĐT, giọng điệu ấm áp đúng SOL.

## 4. Quality gate trước go-live (T1)

- [ ] 100% TC-01→TC-13 + TC-18→TC-23 (wizard + intro) pass; TC-14/15/17 pass trước khi nhân rộng workshop.
- [ ] Zero defect Critical (mất dữ liệu feedback / trắng trang / lộ secret).
- [ ] `[CẦN VERIFY]` đã chốt: ENDPOINT thật · token/chat_id Telegram · link group Zalo ·
  link Chính sách bảo vệ DLCN (NFR-PDP-02) · ảnh/nội dung cookery nếu muốn thay.

## 5. Biên bản nghiệm thu nội bộ (mini)

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Bộ giao diện (index + cookery + router + submit JS) | ☐ Đạt / ☐ Chưa | |
| Backend Apps Script + Sheet + dashboard | ☐ Đạt / ☐ Chưa | |
| Cảnh báo Telegram điểm thấp | ☐ Đạt / ☐ Chưa | |
| Cô lập tuyệt đối với landing | ☐ Đạt / ☐ Chưa | |
| Ngày nghiệm thu / Người nghiệm thu | ____ / ____ | |

Defect tìm thấy → ghi vào bảng dưới, trả về vòng sửa (GĐ4), re-test đúng TC liên quan:

| # | TC | Mô tả defect | Severity | Trạng thái |
|---|---|---|---|---|
| | | | | |
