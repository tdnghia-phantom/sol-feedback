# SRS-LITE — Trang Feedback đa-workshop SOL English Land

> **CHG-01 · v1.1.0 (2026-07-19)** — Theo yêu cầu chủ đầu tư: (a) **BỎ mục 4 "intent"**
> (Có muốn học tiếp?) khỏi form — cột `intent` (F) GIỮ NGUYÊN trong Sheet contract để ổn
> định schema, backend luôn ghi `''`; dashboard thay bảng intent bằng bảng hiệu quả kênh
> `utm_source`; tin Telegram bỏ dòng "Học tiếp". (b) **Redesign toàn bộ UI** concept
> "thiệp công thức bếp SOL" (scalloped card, polaroid + tape, sticker, confetti) — mọi hook
> `data-fb-*` và Field Schema GIỮ NGUYÊN, `feedback-submit.js` không đổi 1 dòng.

> **CHG-02 · v1.2.0 (2026-07-19)** — Theo yêu cầu chủ đầu tư ("layout khác đi, smart
> UI/UX, ưu tiên mobile"): thay layout cuộn-dọc bằng **WIZARD từng-câu-một** (kiểu
> Typeform) — SUPERSEDE phần (b) của CHG-01; giữ nguyên phần (a) (không intent) và toàn
> bộ thẩm mỹ "thiệp bếp" (scallop, sticker-select, polaroid, confetti ở màn cảm ơn).
> **FR-UX-01:** 5 bước `rating → child_enjoy → liked → comment → contact`; bước bắt buộc
> (rating, child_enjoy) **auto-advance ~420ms** sau khi chọn và bị `fbStepGuard` chặn nếu
> chưa trả lời; bước tùy chọn có nút "Bỏ qua bước này" ↔ "Tiếp tục" đổi nhãn theo trạng
> thái; nút ← quay lại **giữ nguyên đáp án**; progress bar + đếm bước n/5; lỗi validate
> cuối cùng tự nhảy về đúng bước. `feedback-submit.js` nâng v2: thêm wizard controller
> (tự phát hiện `[data-fb-step]`) + pure function `fbStepGuard` — trang layout phẳng cũ
> vẫn chạy (chế độ classic, tương thích ngược). Field Schema Contract KHÔNG đổi.

> **CHG-03 · v1.3.0 (2026-07-19)** — Theo yêu cầu chủ đầu tư: thêm **THẺ MỞ ĐẦU**
> (`[data-fb-intro]`) đứng trước wizard, nội dung + thẩm mỹ bám poster "Cảm ơn Quý phụ
> huynh" (2 logo, tiêu đề xanh-olive/terracotta, thư cảm ơn rút gọn, ảnh Story Telling
> viền dashed olive, green-box thông điệp, CTA "Gửi cảm nhận cho SOL 💌" + dòng "Chỉ 5
> câu — 30 giây"). Khi intro hiển thị: topbar + wizard ẩn (class `is-intro`); bấm
> `[data-fb-start]` → vào câu 1, progress 1/5. Ảnh polaroid màn cảm ơn đổi sang crop
> "bé khoe bánh" từ poster mới. Không đụng Field Schema/FR; `_t` tính từ lúc tải trang
> nên thời gian đọc thẻ mở đầu càng làm mốc chống-bot tự nhiên hơn.

> Phiên bản: v1.3.0 · Ngày: 2026-07-19
> Chế độ: **T1-Lean (gated)** theo chuẩn gd2-srs v4.4 — project tĩnh 5 file, spec gốc
> (`antigravity-prompt-feedback.md`) đóng vai PRD+kiến trúc đã chốt. Tài liệu này KHÔNG
> lặp lại spec; chỉ bổ sung lớp đặc tả đo được (EARS + Gherkin = oracle cho GĐ5),
> Field Schema Contract, default states, STRIDE-lite và RTM.

**Nguyên tắc cô lập (bất biến):** project ĐỘC LẬP hoàn toàn với landing (repo riêng ·
Sheet riêng · Apps Script riêng · subdomain riêng). Thứ đang ra tiền phải được cô lập.

---

## 1. Functional Requirements (EARS + Gherkin)

### FR-01 — Router resolve workshop
**EARS:** WHEN người dùng mở `index.html` với query `?ws=<key>` AND `<key>` (đã
lowercase + trim) tồn tại trong `WORKSHOP_REGISTRY`, the system SHALL redirect
(`location.replace`) tới file HTML tương ứng, **giữ nguyên mọi query param khác**
(bỏ param `ws`).

```gherkin
Scenario: ws hợp lệ kèm utm
  Given registry có khóa "cookery" → "cookery.html"
  When mở "/?utm_source=qr&ws=cookery&x=1"
  Then trình duyệt được điều hướng tới "cookery.html?utm_source=qr&x=1"

Scenario: ws viết hoa / thừa khoảng trắng
  When mở "/?ws=%20COOKERY%20"
  Then điều hướng tới "cookery.html"
```

### FR-02 — Fallback thân thiện
**EARS:** IF query không có `ws` OR `<key>` không tồn tại trong registry, THEN the
system SHALL hiển thị trang fallback (logo SOL + lời cảm ơn + hướng dẫn liên hệ
Zalo 0938.206.968) — **không trắng trang, không lộ lỗi kỹ thuật, không redirect**.

```gherkin
Scenario: ws lạ
  When mở "/?ws=lung-tung"
  Then trang hiển thị logo SOL và thông điệp "link chưa đúng" kèm nút Zalo
  And không có redirect nào xảy ra
Scenario: chống open-redirect
  When mở "/?ws=../evil" hoặc "/?ws=https://evil.com"
  Then hệ thống coi là key lạ → fallback (registry là whitelist duy nhất)
```

### FR-03 — Form validation (client)
**EARS:** WHEN người dùng bấm Gửi, the system SHALL chặn submit nếu thiếu `rating`
(1–5) hoặc `child_enjoy`; IF `phone` không rỗng THEN SHALL yêu cầu 9–11 chữ số
(sau khi bỏ khoảng trắng, dấu chấm, gạch, ngoặc); các trường khác không bắt buộc.
Thông báo lỗi nhẹ nhàng cạnh trường + cuộn tới lỗi đầu tiên.

```gherkin
Scenario: thiếu mục bắt buộc
  Given chưa chọn sao
  When bấm "Gửi cảm nhận cho SOL"
  Then hiện thông báo nhẹ tại mục 1 và form KHÔNG gửi đi

Scenario: SĐT
  | phone            | kết quả  |
  | "" (bỏ trống)    | hợp lệ   |
  | "0938206968"     | hợp lệ   |
  | "0938.206.968"   | hợp lệ (normalize) |
  | "938206968" (9)  | hợp lệ   |
  | "12345678" (8)   | lỗi      |
  | "abc"            | lỗi      |
```

### FR-04 — Submit an toàn
**EARS:** WHEN payload hợp lệ, the system SHALL POST JSON tới `ENDPOINT` với
`Content-Type: text/plain;charset=utf-8` (simple request — né CORS preflight của
Apps Script), disable nút trong lúc gửi (chống double-submit), kèm honeypot `_hp`
và `_t` (ms trên trang). WHILE gửi thất bại (network), the system SHALL giữ nguyên
dữ liệu đã điền + hiện thông báo thử lại.

```gherkin
Scenario: double-tap
  When bấm Gửi 2 lần liên tiếp
  Then chỉ MỘT request được bắn đi (nút disabled + cờ submitting)
Scenario: gửi thành công
  Then form ẩn đi, hiện màn "🎉 Cảm ơn ba mẹ!" (+ nút group Zalo nếu cấu hình)
```

### FR-05 — Backend ghi Sheet
**EARS:** WHEN `doPost` nhận JSON hợp lệ, the system SHALL sinh `submission_id`
(mã 5 ký tự, bảng mã bỏ 0/O/1/I, không trùng), ghi ĐÚNG 1 dòng vào sheet `feedback` theo thứ tự cột của Field
Schema Contract (§3), `created_at` theo giờ `Asia/Ho_Chi_Minh`, `answers_json`
chứa toàn bộ câu trả lời (kể cả `liked[]`), rồi trả `{ok:true, submission_id}`.
LockService chống ghi chồng khi 2 phụ huynh gửi cùng lúc.

```gherkin
Scenario: ghi đủ cột
  When gửi feedback ws_id=cookery, rating=5, liked=["Cô giáo","Bé dạn hơn"]
  Then sheet feedback có thêm 1 dòng: ws_id="cookery", rating=5
  And cột answers_json parse được JSON chứa mảng liked đủ 2 phần tử
Scenario: SĐT giữ số 0 đầu
  When phone="0938206968"
  Then ô phone trong Sheet hiển thị đúng "0938206968" (cột định dạng text)
```

### FR-06 — Chống spam server-side
**EARS:** IF `_hp` (honeypot) không rỗng, THEN the system SHALL trả `{ok:true}`
nhưng **KHÔNG ghi dòng nào** (silent drop). IF `_t < 2500ms`, THEN vẫn ghi nhưng
`note="fast-submit"` để hậu kiểm.

### FR-07 — Cảnh báo Telegram điểm thấp
**EARS:** WHEN dòng vừa ghi có `rating <= 2`, the system SHALL gửi tin Telegram
theo đúng template spec §4 (⚠️ FEEDBACK THẤP…). IF Telegram lỗi, THEN lỗi bị nuốt
(`muteHttpExceptions` + try/catch) — **việc ghi Sheet không bao giờ bị hỏng vì
Telegram**. Rating ≥ 3 → KHÔNG gửi.

```gherkin
Scenario: rating 2 → có alert; rating 5 → không alert
Scenario: Telegram token sai
  Then dòng feedback VẪN nằm trong Sheet, response vẫn {ok:true}
```

### FR-08 — Health check
**EARS:** WHEN GET tới endpoint, the system SHALL trả `{ok:true}` JSON (không phục
vụ HTML).

### FR-09 — Mở rộng workshop
**EARS:** WHEN thêm workshop mới, the system SHALL chỉ cần (a) 1 file HTML mới với
hằng `WS_ID` riêng + (b) 1 dòng registry — **không sửa trang cũ, không sửa backend**
(câu hỏi khác nhau vẫn vào chung Sheet nhờ `answers_json`).

### FR-10 — Dashboard tối thiểu *(bổ sung chủ động, ngoài spec)*
**EARS:** WHEN chạy `setupFeedbackSheet()`, the system SHALL tạo thêm sheet
`dashboard` với công thức QUERY: điểm TB + số lượng theo workshop · danh sách
feedback ≤2★ · ứng viên testimonial (5★ + allow_testimonial=TRUE).

## 2. NFR

| Mã | Yêu cầu | Đo |
|---|---|---|
| NFR-PERF-01 | Trang workshop 1 file, ảnh base64 tối ưu, không lib ngoài (trừ Google Fonts swap); tổng ≤ ~350KB | size file + Lighthouse |
| NFR-UX-01 | Mobile-first ≤ 640px, chữ ≥17px, control chạm ≥44px, sao là control chính (52px) | duyệt tay |
| NFR-A11Y-01 | Sao = radiogroup, chip = aria-pressed, lỗi aria-live, focus-visible, prefers-reduced-motion | axe tay |
| NFR-PDP-01 | Checkbox testimonial **không tick sẵn**; nêu rõ mục đích dùng SĐT ngay tại chỗ thu; quyền yêu cầu xóa qua Zalo. Căn cứ: **Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP** (hiệu lực 01/01/2026, thay NĐ 13/2023 — đã verify web 19/07/2026) | review UI |
| NFR-PDP-02 | Tối thiểu hóa dữ liệu: chỉ thu tên+SĐT, đều optional; không thu dữ liệu trẻ em định danh | review schema |
| NFR-ISO-01 | Không import/chia sẻ bất kỳ tài nguyên nào với project landing | review repo |

## 3. Field Schema Contract (1 bảng duy nhất — form ↔ JS ↔ Code.gs ↔ Sheet)

| # | Control (cookery.html) | key payload | Cột Sheet | Kiểu | Bắt buộc |
|---|---|---|---|---|---|
| — | server sinh | — | `submission_id` | text | auto |
| — | server sinh | — | `created_at` | text ISO +07:00 | auto |
| — | hằng `WS_ID` | `ws_id` | `ws_id` | text | auto |
| 1 | 5 sao `data-fb="rating"` | `rating` | `rating` | number 1–5 | ✅ |
| 2 | 3 chip `data-fb="child_enjoy"` | `child_enjoy` | `child_enjoy` | text | ✅ |
| 3 | 6 checkbox `data-fb="liked"` | `liked` (array) | *(chỉ trong answers_json)* | array | ❌ |
| ~~4~~ | ~~3 chip intent~~ **CHG-01: đã bỏ khỏi form** | *(không gửi)* | `intent` (cột giữ, luôn `''`) | text | — |
| 5 | textarea `data-fb="comment"` | `comment` | `comment` | text ≤1500 | ❌ |
| 6a | input `data-fb="parent_name"` | `parent_name` | `parent_name` | text | ❌ |
| 6b | input `data-fb="phone"` | `phone` | `phone` | text 9–11 số (cột format `@`) | ❌ |
| 6c | checkbox `data-fb="allow_testimonial"` | `allow_testimonial` | `allow_testimonial` | bool | ❌ (mặc định BỎ trống) |
| — | query string | `utm_source` | `utm_source` | text | auto |
| — | toàn bộ Q&A echo | `answers` | `answers_json` | JSON | auto |
| — | honeypot `_hp` / timer `_t` | `_hp`,`_t` | → `note` | — | auto |

Giá trị chip/checkbox = **nhãn tiếng Việt y như spec** ("Rất thích", "Có, rất muốn",
"Bé dạn hơn"…) — đọc thẳng trong Sheet không cần map.

## 4. §UX — Default states (quyết định nghiệp vụ, khai báo tường minh)

**§UX-01 `index.html` (fallback):** mặc định hiện loader (logo pulse ~0.4s cảm nhận);
router match → replace ngay; không match → class `show-fallback` hiện nội dung.
`<noscript>` → hiện fallback luôn. Không có control nhập liệu.

**§UX-02 `cookery.html`:** rating=**chưa chọn** · child_enjoy=**chưa chọn** ·
liked=**không tick** · comment=**rỗng** (placeholder gợi ý) ·
parent_name/phone=**rỗng** · allow_testimonial=**KHÔNG tick** (NFR-PDP-01) · nút
Gửi=**enabled** (validate khi bấm — không disable trước để phụ huynh không hoang
mang) · vùng lỗi=ẩn · màn cảm ơn=ẩn · nút group Zalo=chỉ hiện khi `ZALO_GROUP_URL`
khác rỗng. Tông: olive `#6C813E` / cream `#FAF4ED` / terracotta `#C74B1F` / amber
sao `#F5A623` / SOL blue `#0747A3`; font Baloo 2 + Nunito (đồng bộ Phương án B
landing Cookery).

## 5. STRIDE-lite

| Threat | Vector | Phòng |
|---|---|---|
| Spoofing/Spam | bot POST endpoint public | honeypot silent-drop (FR-06) + time-check note + volume thấp |
| Tampering | ws_id giả trong payload | vô hại — sheet riêng, chỉ là nhãn phân loại; registry client là whitelist điều hướng |
| Repudiation | — | submission_id + created_at server-side |
| Info Disclosure | lộ Sheet ID / token | secrets chỉ nằm Script Properties server-side; client JS không chứa secret |
| DoS | flood form | Apps Script quota tự giới hạn; rủi ro chấp nhận được (feedback, không phải payment) |
| Elevation | open redirect qua `?ws=` | registry whitelist — không bao giờ dựng URL từ input |

## 6. RTM (FR ↔ file ↔ test)

| FR | File hiện thực | Test |
|---|---|---|
| FR-01, FR-02 | `router.js`, `index.html` | UT-R1…R7 · TC-01, TC-02 |
| FR-03 | `feedback-submit.js`, `cookery.html` | UT-V1…V9 · TC-03, TC-04 |
| FR-04 | `feedback-submit.js` | UT-P1…P5 · TC-05, TC-09 |
| FR-05 | `apps-script/Code.gs` | TC-06, TC-10 |
| FR-06 | `Code.gs` | TC-11 |
| FR-07 | `Code.gs` | TC-07 (≤2★), TC-08 (5★), TC-12 (Telegram hỏng) |
| FR-08 | `Code.gs` | TC-13 |
| FR-09 | registry + template | TC-14 |
| FR-10 | `Code.gs` setup | TC-15 |
| NFR-PDP | `cookery.html` | TC-16 |

*(UT = unit test Node chạy thật trong `tests/unit.test.js`; TC = test case tay/UAT
trong `docs/test-plan-uat.md`.)*
