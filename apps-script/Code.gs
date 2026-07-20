/**
 * SOL Feedback Backend — Apps Script (PROJECT RIÊNG, tách hoàn toàn khỏi landing)
 * ================================================================================
 * Gắn vào Google Sheet MỚI (container-bound). Quy trình deploy: xem
 * deploy-runbook-feedback.md.
 *
 * Endpoints:
 *   doPost  — nhận JSON feedback (body text/plain) → ghi sheet 'feedback'
 *             → rating ≤ 2 thì cảnh báo Telegram (lỗi Telegram KHÔNG làm hỏng ghi Sheet)
 *   doGet   — health check {ok:true}
 * Setup 1 lần: chạy hàm setupFeedbackSheet() từ editor.
 *
 * Script Properties cần điền (Project Settings → Script properties):
 *   TELEGRAM_BOT_TOKEN  — token bot (có thể dùng lại bot cũ hoặc bot riêng)
 *   TELEGRAM_CHAT_ID    — chat/group id nhận cảnh báo
 */

var SHEET_NAME = 'feedback';
var DASH_NAME = 'dashboard';
var TZ = 'Asia/Ho_Chi_Minh';
var LOW_RATING_THRESHOLD = 2;      // rating <= 2 → cảnh báo
var FAST_SUBMIT_MS = 2500;         // _t < 2500ms → gắn cờ note='fast-submit'

// Thứ tự cột = Field Schema Contract (docs/feedback-srs-lite.md §3) — KHÔNG đổi tùy tiện
// CHG-01 (v1.1): mục intent đã bỏ khỏi form → cột F giữ nguyên vị trí, luôn ghi '' (ổn định schema)
var HEADERS = [
  'submission_id', 'created_at', 'ws_id', 'rating', 'child_enjoy', 'intent',
  'comment', 'parent_name', 'phone', 'allow_testimonial', 'answers_json',
  'utm_source', 'note'
];

/* ============================== ENDPOINTS ============================== */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents); // client gửi text/plain → parse tay

    // --- Chống spam: honeypot → silent drop (trả ok nhưng KHÔNG ghi) ---
    if (data._hp) {
      return jsonOut_({ ok: true });
    }

    // --- Gate bật/tắt trang (Phase 2): trang bị TẮT → KHÔNG ghi, báo closed + redirect ---
    if (!isPageActive_(safeStr_(data.ws_id, 40) || 'unknown')) {
      return jsonOut_({ ok: false, closed: true, redirect: REDIRECT_WHEN_OFF, message: 'Trang cảm nhận này đã tắt.' });
    }

    var note = String(data.note || '');
    var t = Number(data._t) || 0;
    if (t > 0 && t < FAST_SUBMIT_MS) {
      note = note ? note + ' | fast-submit' : 'fast-submit';
    }

    var rating = clampRating_(data.rating);
    var createdAt = isoFromMs_(Date.now()); // ISO giờ VN, không phụ thuộc múi giờ project/Sheet

    // --- Ghi Sheet (lock chống ghi chồng + sinh submission_id 5 ký tự KHÔNG trùng trong cùng lock) ---
    var lock = LockService.getScriptLock();
    lock.tryLock(5000);
    var submissionId;
    try {
      var sheet = getFeedbackSheet_();
      submissionId = uniqueSubmissionId_(sheet);
      sheet.appendRow([
        submissionId,
        createdAt,
        safeStr_(data.ws_id, 40) || 'unknown',
        rating === null ? '' : rating,
        safeStr_(data.child_enjoy, 60),
        safeStr_(data.intent, 60),
        safeStr_(data.comment, 1500),
        safeStr_(data.parent_name, 120),
        safeStr_(data.phone, 20),
        data.allow_testimonial === true,
        JSON.stringify(data.answers || {}),
        safeStr_(data.utm_source, 80),
        note
      ]);
    } finally {
      lock.releaseLock();
    }

    // --- Thông báo Telegram cho MỌI cảm nhận mới (SAU khi ghi; lỗi bị nuốt) ---
    try {
      sendFeedbackAlert_(rating, data, createdAt);
    } catch (alertErr) {
      // nuốt lỗi — ghi Sheet đã thành công là đủ (FR-07)
    }

    return jsonOut_({ ok: true, submission_id: submissionId });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// doGet:
//   · ?action=health → JSON health check (giữ hành vi cũ để test — TC-13)
//   · mặc định        → phục vụ TRANG QUẢN TRỊ admin.html (HtmlService) — Phase 2
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'health') {
    return jsonOut_({ ok: true, service: 'sol-feedback', time: isoFromMs_(Date.now()) });
  }
  // Trạng thái đóng/mở của 1 trang feedback (public) — trang cookery.html gọi lúc tải.
  if (p.action === 'pagestatus') {
    var slugQ = String(p.sw || p.ws || '').trim().toLowerCase();
    return jsonOut_({ ok: true, sw: slugQ, active: isPageActive_(slugQ), redirect: REDIRECT_WHEN_OFF });
  }
  return HtmlService.createHtmlOutputFromFile('admin')
    .setTitle('SOL Feedback · Quản trị')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ============================== SETUP 1 LẦN ============================== */

/**
 * Chạy hàm này 1 lần từ Apps Script editor sau khi dán code:
 *  - Tạo sheet 'feedback' + header + freeze hàng 1
 *  - Cột phone (I) định dạng TEXT để KHÔNG mất số 0 đầu (0938… ≠ 938…)
 *  - Tạo sheet 'dashboard' với công thức thống kê tự động (FR-10)
 */
function setupFeedbackSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Múi giờ CỦA SHEET (khác múi giờ project Apps Script) — đặt luôn cho khớp, tránh lệch khi xem tay.
  try { if (ss.getSpreadsheetTimeZone() !== TZ) ss.setSpreadsheetTimeZone(TZ); } catch (e) {}

  // ---- Sheet feedback ----
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('I:I').setNumberFormat('@');       // phone = text → giữ số 0 đầu
  sh.getRange('B:B').setNumberFormat('@');       // created_at = TEXT → Sheets KHÔNG tự đổi thành Date
  sh.getRange('D:D').setNumberFormat('0');       // rating = number
  sh.setColumnWidth(7, 320);                     // comment rộng dễ đọc
  sh.setColumnWidth(11, 260);                    // answers_json

  // ---- Sheet dashboard ----
  var d = ss.getSheetByName(DASH_NAME);
  if (!d) d = ss.insertSheet(DASH_NAME);
  d.clear();
  d.getRange('A1').setValue('📊 TỔNG QUAN THEO WORKSHOP').setFontWeight('bold');
  d.getRange('A2').setFormula(
    '=IFERROR(QUERY(' + SHEET_NAME + '!A:M, "select C, count(A), avg(D) where C is not null and C <> \'ws_id\' group by C label C \'Workshop\', count(A) \'Số feedback\', avg(D) \'Điểm TB\'", 1), "Chưa có dữ liệu")'
  );
  d.getRange('E1').setValue('📣 HIỆU QUẢ KÊNH (utm_source)').setFontWeight('bold');
  d.getRange('E2').setFormula(
    '=IFERROR(QUERY(' + SHEET_NAME + '!A:M, "select L, count(A), avg(D) where L is not null and L <> \'utm_source\' group by L label L \'Kênh\', count(A) \'Số feedback\', avg(D) \'Điểm TB\'", 1), "—")'
  );
  d.getRange('A8').setValue('⚠️ FEEDBACK THẤP (≤2★) — GỌI XỬ LÝ TRONG NGÀY').setFontWeight('bold').setFontColor('#C74B1F');
  d.getRange('A9').setFormula(
    '=IFERROR(QUERY(' + SHEET_NAME + '!A:M, "select B, C, D, G, H, I where D <= 2 order by B desc", 1), "Không có 🎉")'
  );
  d.getRange('A16').setValue('🌟 ỨNG VIÊN TESTIMONIAL (5★ + cho phép dùng)').setFontWeight('bold').setFontColor('#6C813E');
  d.getRange('A17').setFormula(
    '=IFERROR(QUERY(' + SHEET_NAME + '!A:M, "select B, C, G, H, I where D = 5 and J = true order by B desc", 1), "Chưa có")'
  );
  d.setFrozenRows(1);

  Logger.log('✅ setupFeedbackSheet xong: sheet "%s" + "%s" đã sẵn sàng.', SHEET_NAME, DASH_NAME);
}

/* ============================== TELEGRAM ============================== */

// Gửi Telegram cho MỌI cảm nhận mới (rating ≤ 2 → nhấn mạnh cảnh báo).
function sendFeedbackAlert_(rating, data, createdAt) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return; // chưa cấu hình → bỏ qua êm

  var contact = [safeStr_(data.parent_name, 120), safeStr_(data.phone, 20)]
    .filter(function (x) { return x; }).join(' · ');
  var liked = '';
  try { var a = data.answers || {}; if (a.liked && a.liked.length) liked = a.liked.join(', '); } catch (e) {}
  var low = (rating !== null && rating <= LOW_RATING_THRESHOLD);
  var stars = rating ? new Array(rating + 1).join('★') : '—';
  var head = low ? ('⚠️ FEEDBACK THẤP (' + rating + '★)') : ('💬 CẢM NHẬN MỚI (' + stars + ')');

  var msg =
    head + ' · Workshop: ' + pageLabel_(data.ws_id) + '\n' +
    'Bé thích: ' + (safeStr_(data.child_enjoy, 60) || '—') + '\n' +
    (liked ? ('Ưng ý: ' + liked + '\n') : '') +
    'Góp ý: "' + (safeStr_(data.comment, 500) || '—') + '"\n' +
    'Liên hệ: ' + (contact || '(không để lại)') + '\n' +
    'Lúc: ' + formatVN_(createdAt);

  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: msg, disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
}

function sendLowRatingAlert_(rating, data, createdAt) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return; // chưa cấu hình → bỏ qua êm

  var contact = [safeStr_(data.parent_name, 120), safeStr_(data.phone, 20)]
    .filter(function (x) { return x; }).join(' ');

  var msg =
    '⚠️ FEEDBACK THẤP (' + rating + '★) · Workshop: ' + pageLabel_(data.ws_id) + '\n' +
    'Bé thích: ' + (safeStr_(data.child_enjoy, 60) || '—') + '\n' +
    'Góp ý: "' + (safeStr_(data.comment, 500) || '—') + '"\n' +
    'Liên hệ: ' + (contact || '(không để lại)') + '\n' +
    'Lúc: ' + formatVN_(createdAt);

  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: msg, disable_web_page_preview: true }),
    muteHttpExceptions: true // lỗi Telegram không được ném exception ra ngoài
  });
}

/** Chạy tay từ editor để test cấu hình Telegram trước khi go-live. */
function testTelegramAlert() {
  sendLowRatingAlert_(2, {
    ws_id: 'cookery',
    child_enjoy: 'Bình thường',
    comment: '(tin nhắn test từ testTelegramAlert — bỏ qua)',
    parent_name: 'Test',
    phone: '0900000000'
  }, isoFromMs_(Date.now()));
  Logger.log('Đã bắn tin test — kiểm tra Telegram.');
}

/* ============================== HELPERS ============================== */

function getFeedbackSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { // tự phục hồi nếu ai đó lỡ xóa sheet
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('I:I').setNumberFormat('@');
    sh.getRange('B:B').setNumberFormat('@'); // created_at giữ nguyên chuỗi ISO
  }
  return sh;
}

// Mã ngắn 5 ký tự (bảng mã bỏ 0/O/1/I dễ nhầm).
function makeSubmissionId_() {
  var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < 5; i++) s += A.charAt(Math.floor(Math.random() * A.length));
  return s;
}

// Sinh submission_id 5 ký tự KHÔNG trùng với các mã đã có (gọi TRONG lock của doPost để race-safe).
function uniqueSubmissionId_(sheet) {
  var existing = {};
  try {
    var last = sheet.getLastRow();
    if (last >= 2) {
      var col = sheet.getRange(2, 1, last - 1, 1).getValues(); // cột A = submission_id
      for (var i = 0; i < col.length; i++) existing[String(col[i][0])] = true;
    }
  } catch (e) { /* đọc lỗi → bỏ qua, dùng mã ngẫu nhiên */ }
  for (var t = 0; t < 30; t++) {
    var id = makeSubmissionId_();
    if (!existing[id]) return id;
  }
  return makeSubmissionId_(); // cực hiếm (bảng gần đầy) → chấp nhận mã ngẫu nhiên
}

function clampRating_(v) {
  var n = Number(v);
  if (!n || n < 1 || n > 5) return null;
  return Math.round(n);
}

function safeStr_(v, maxLen) {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, maxLen || 200);
}

/** "2026-07-19T20:15:03+07:00" → "19-07-26 20:15" (format tin Telegram theo spec) */
function formatVN_(iso) {
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return String(iso);
  return m[3] + '-' + m[2] + '-' + m[1].slice(2) + ' ' + m[4] + ':' + m[5];
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==================================================================================
 * PHASE 2 — TRANG QUẢN TRỊ (admin.html) + XÁC THỰC THEO ROLE (staff-role)
 * ----------------------------------------------------------------------------------
 * THÊM MỚI, KHÔNG phá Phase 1 (doPost form + sheet feedback + Telegram ≤2★ giữ nguyên).
 * Mô hình xác thực GIỐNG project Landingpage-SOL-COOK:
 *   · Đăng nhập CHỈ bằng passcode → server tra sheet `staff-role` → gán role.
 *     TUYỆT ĐỐI không có ô "chọn role" ở login (chống leo thang quyền).
 *   · Session token (CacheService, TTL ~6h) map token→{name, role}. Client giữ ở
 *     sessionStorage, gửi kèm mọi lời gọi. requireAuth_/requireAdmin_ chặn ở SERVER
 *     (staff gọi hàm admin là THROW — khóa bằng dữ liệu, không chỉ ẩn nút).
 * ================================================================================== */

var STAFF_SHEET = 'staff-role';
// Cột sheet staff-role (đúng thứ tự) — có telegram_user_id theo yêu cầu.
var STAFF_COLUMNS = ['passcode', 'name', 'role', 'active', 'telegram_user_id', 'phone', 'note'];
var TOKEN_TTL_SEC = 21600; // phiên đăng nhập ~6h (max CacheService)

/* ----------------------------- AUTH & PHIÊN ----------------------------- */
function apiLogin(passcode) {
  passcode = clean_(passcode);
  if (!passcode) return { ok: false, message: 'Vui lòng nhập passcode.' };
  var st = findStaff_(passcode);
  if (!st || String(st.active).toUpperCase() !== 'TRUE') {
    Utilities.sleep(400); // hãm brute-force nhẹ
    return { ok: false, message: 'Passcode không đúng hoặc tài khoản đã bị khóa.' };
  }
  var role = String(st.role).toLowerCase() === 'admin' ? 'admin' : 'staff';
  var token = Utilities.getUuid();
  cachePut_(token, { name: String(st.name), role: role });
  return { ok: true, token: token, name: String(st.name), role: role };
}

function apiWhoami(token) {
  var s = sessionFromToken_(token);
  return s ? { ok: true, name: s.name, role: s.role } : { ok: false };
}

function apiLogout(token) {
  if (token) CacheService.getScriptCache().remove('tok_' + token);
  return { ok: true };
}

function cachePut_(token, sess) {
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify(sess), TOKEN_TTL_SEC);
}
function sessionFromToken_(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('tok_' + String(token));
  return raw ? JSON.parse(raw) : null;
}
// Chặn ở TẦNG SERVER — thiếu/sai token là throw, không trả data.
function requireAuth_(token) {
  var s = sessionFromToken_(token);
  if (!s) throw new Error('AUTH_EXPIRED');
  cachePut_(token, s); // gia hạn phiên trượt ~6h kể từ thao tác cuối
  return s;
}
function requireAdmin_(token) {
  var s = requireAuth_(token);
  if (s.role !== 'admin') throw new Error('FORBIDDEN');
  return s;
}

function findStaff_(passcode) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STAFF_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  var idx = headerIndex_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var r = 0; r < vals.length; r++) {
    if (String(vals[r][idx.passcode]).trim() === String(passcode).trim()) {
      var o = {}; Object.keys(idx).forEach(function (h) { o[h] = vals[r][idx[h]]; });
      o._row = r + 2; return o;
    }
  }
  return null;
}

/* ----------------------- API DỮ LIỆU FEEDBACK (staff + admin) ----------------------- */
// Danh sách cảm nhận (mới nhất trước, cap 500). filter: {rating:'', 'low', '1'..'5'; ws; q}
function apiListFeedback(token, filter) {
  requireAuth_(token);
  filter = filter || {};
  var sh = getFeedbackSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, rows: [] };
  var idx = headerIndex_(sh);
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var q = String(filter.q || '').trim().toLowerCase();
  var wsFilter = clean_(filter.ws);
  var ratingFilter = clean_(filter.rating);
  var out = [];
  for (var r = vals.length - 1; r >= 0; r--) { // mới nhất trước
    var row = vals[r];
    var o = {}; Object.keys(idx).forEach(function (h) { o[h] = row[idx[h]]; });
    var rating = Number(o.rating) || 0;
    if (wsFilter && String(o.ws_id) !== wsFilter) continue;
    if (ratingFilter === 'low') { if (!(rating >= 1 && rating <= 2)) continue; }
    else if (ratingFilter && rating !== Number(ratingFilter)) continue;
    if (q) {
      var hay = [o.parent_name, o.phone, o.comment, o.ws_id, o.utm_source].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }
    var liked = [];
    try { var a = JSON.parse(o.answers_json || '{}'); if (a && Array.isArray(a.liked)) liked = a.liked; } catch (e) {}
    out.push({
      submission_id: String(o.submission_id || ''),
      created_at: toIsoVN_(o.created_at), // chuẩn hoá ISO dù ô là chuỗi hay đã bị ép thành Date
      ws_id: String(o.ws_id || ''),
      rating: rating,
      child_enjoy: String(o.child_enjoy || ''),
      comment: String(o.comment || ''),
      parent_name: String(o.parent_name || ''),
      phone: String(o.phone || ''),
      allow_testimonial: String(o.allow_testimonial).toUpperCase() === 'TRUE',
      utm_source: String(o.utm_source || ''),
      note: String(o.note || ''),
      liked: liked
    });
    if (out.length >= 500) break;
  }
  return { ok: true, rows: out };
}

// Ghi/ cập nhật cột note của 1 dòng (quy trình xử lý ≤2★). staff + admin.
function apiSaveNote(token, submissionId, note) {
  requireAuth_(token);
  submissionId = clean_(submissionId);
  if (!submissionId) return { ok: false, message: 'Thiếu submission_id.' };
  var sh = getFeedbackSheet_();
  var found = findRow_(sh, 'submission_id', submissionId);
  if (!found) return { ok: false, message: 'Không tìm thấy dòng cảm nhận.' };
  updateCells_(sh, found.rowIndex, { note: safeStr_(note, 1500) });
  return { ok: true };
}

/* --------------------------- API DASHBOARD (CHỈ ADMIN) --------------------------- */
function apiDashboard(token) {
  requireAdmin_(token); // staff gọi vào là THROW — khóa bằng dữ liệu
  var sh = getFeedbackSheet_();
  var last = sh.getLastRow();
  var today = isoFromMs_(Date.now()).slice(0, 10);
  var res = {
    ok: true, total: 0, todayCount: 0, avg: 0,
    dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    byWorkshop: {}, bySource: {},
    lowList: [], testimonialList: [], lowCount: 0, testimonialCount: 0
  };
  if (last < 2) return res;
  var idx = headerIndex_(sh);
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var sumRating = 0, ratedCount = 0;
  vals.forEach(function (row) {
    var o = {}; Object.keys(idx).forEach(function (h) { o[h] = row[idx[h]]; });
    res.total++;
    var rating = Number(o.rating) || 0;
    var ws = String(o.ws_id || 'unknown');
    var src = String(o.utm_source || '') || 'direct';
    var created = toIsoVN_(o.created_at); // chuẩn hoá → so sánh 'hôm nay' luôn đúng
    if (created.slice(0, 10) === today) res.todayCount++;
    if (rating >= 1 && rating <= 5) { res.dist[rating]++; sumRating += rating; ratedCount++; }
    if (!res.byWorkshop[ws]) res.byWorkshop[ws] = { count: 0, sum: 0, avg: 0 };
    res.byWorkshop[ws].count++; res.byWorkshop[ws].sum += rating;
    if (!res.bySource[src]) res.bySource[src] = { count: 0, sum: 0, avg: 0 };
    res.bySource[src].count++; res.bySource[src].sum += rating;
    var allow = String(o.allow_testimonial).toUpperCase() === 'TRUE';
    if (rating >= 1 && rating <= 2 && res.lowList.length < 100) {
      res.lowList.push({
        created_at: created, ws_id: ws, rating: rating, comment: String(o.comment || ''),
        parent_name: String(o.parent_name || ''), phone: String(o.phone || ''), note: String(o.note || '')
      });
    }
    if (rating === 5 && allow && res.testimonialList.length < 100) {
      res.testimonialList.push({
        created_at: created, ws_id: ws, comment: String(o.comment || ''),
        parent_name: String(o.parent_name || ''), phone: String(o.phone || '')
      });
    }
  });
  res.avg = ratedCount ? Math.round(sumRating / ratedCount * 100) / 100 : 0;
  res.lowCount = res.lowList.length;
  res.testimonialCount = res.testimonialList.length;
  Object.keys(res.byWorkshop).forEach(function (k) { var w = res.byWorkshop[k]; w.avg = w.count ? Math.round(w.sum / w.count * 100) / 100 : 0; });
  Object.keys(res.bySource).forEach(function (k) { var w = res.bySource[k]; w.avg = w.count ? Math.round(w.sum / w.count * 100) / 100 : 0; });
  return res;
}

/* --------------------------- API NHÂN VIÊN (CHỈ ADMIN) --------------------------- */
function apiListStaff(token) {
  requireAdmin_(token);
  var sh = getStaffSheet_();
  if (sh.getLastRow() < 2) return { ok: true, staff: [] };
  var idx = headerIndex_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  return {
    ok: true,
    staff: vals.map(function (r) {
      return {
        passcode: String(r[idx.passcode] || ''), name: String(r[idx.name] || ''),
        role: String(r[idx.role] || ''), active: String(r[idx.active]).toUpperCase() === 'TRUE',
        telegram_user_id: String(r[idx.telegram_user_id] || ''),
        phone: String(r[idx.phone] || ''), note: String(r[idx.note] || '')
      };
    })
  };
}

function apiSaveStaff(token, data) {
  var sess = requireAdmin_(token);
  data = data || {};
  var passcode = clean_(data.passcode), name = clean_(data.name);
  if (!passcode || !name) return { ok: false, message: 'Cần passcode + tên.' };
  var role = String(data.role).toLowerCase() === 'admin' ? 'admin' : 'staff';
  var sh = getStaffSheet_();
  var existed = !!findRow_(sh, 'passcode', passcode);
  upsertRow_(sh, 'passcode', passcode, {
    passcode: passcode, name: name, role: role,
    active: data.active === false ? 'FALSE' : 'TRUE',
    telegram_user_id: clean_(data.telegram_user_id),
    phone: clean_(data.phone), note: clean_(data.note)
  });
  forceStaffTextCols_(sh); // giữ passcode + telegram_user_id dạng text (id lớn không đổi khoa học)
  staffTelegram_((existed ? '✏️ CẬP NHẬT NHÂN VIÊN' : '👤 THÊM NHÂN VIÊN') + '\n' + name + ' · ' + role +
    (data.active === false ? ' · ĐANG KHÓA' : '') + '\n— ' + sess.name);
  return { ok: true };
}

function apiSetStaffActive(token, passcode, active) {
  var sess = requireAdmin_(token);
  var sh = getStaffSheet_();
  var found = findRow_(sh, 'passcode', clean_(passcode));
  if (!found) return { ok: false, message: 'Không tìm thấy passcode.' };
  updateCells_(sh, found.rowIndex, { active: active ? 'TRUE' : 'FALSE' });
  staffTelegram_((active ? '🔓 MỞ KHÓA NHÂN VIÊN' : '🔒 KHÓA NHÂN VIÊN') + '\n' + clean_(found.obj.name) + '\n— ' + sess.name);
  return { ok: true };
}

/* ------------------------------- HELPERS (Phase 2) ------------------------------- */
function getStaffSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(STAFF_SHEET);
  if (!sh) { sh = ss.insertSheet(STAFF_SHEET); sh.appendRow(STAFF_COLUMNS); sh.setFrozenRows(1); }
  if (sh.getLastRow() === 0) sh.appendRow(STAFF_COLUMNS);
  forceStaffTextCols_(sh); // LUÔN ép — sheet có sẵn cũng được bảo vệ
  return sh;
}
function headerIndex_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {}; header.forEach(function (h, i) { idx[String(h).trim()] = i; });
  return idx;
}
function findRow_(sheet, keyCol, keyVal) {
  if (!keyVal) return null;
  var idx = headerIndex_(sheet); var col = idx[keyCol];
  if (col === undefined) return null;
  var last = sheet.getLastRow(); if (last < 2) return null;
  var vals = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  for (var r = 0; r < vals.length; r++) {
    if (String(vals[r][col]).trim() === String(keyVal).trim()) {
      var obj = {}; Object.keys(idx).forEach(function (h) { obj[h] = vals[r][idx[h]]; });
      return { rowIndex: r + 2, obj: obj };
    }
  }
  return null;
}
function updateCells_(sheet, rowIndex, valuesObj) {
  var idx = headerIndex_(sheet);
  Object.keys(valuesObj).forEach(function (k) {
    if (idx[k] !== undefined) sheet.getRange(rowIndex, idx[k] + 1).setValue(valuesObj[k]);
  });
}
function upsertRow_(sheet, keyCol, keyVal, valuesObj) {
  var found = keyVal ? findRow_(sheet, keyCol, keyVal) : null;
  var idx = headerIndex_(sheet);
  if (found) { updateCells_(sheet, found.rowIndex, valuesObj); }
  else {
    var arr = new Array(sheet.getLastColumn()).fill('');
    Object.keys(valuesObj).forEach(function (k) { if (idx[k] !== undefined) arr[idx[k]] = valuesObj[k]; });
    sheet.appendRow(arr);
  }
}
function clean_(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
// Ép cột passcode + telegram_user_id sang định dạng Văn bản (id Telegram lớn không bị đổi sang khoa học).
function forceStaffTextCols_(sh) {
  var idx = headerIndex_(sh);
  ['passcode', 'telegram_user_id'].forEach(function (c) {
    if (idx[c] === undefined) return;
    sh.getRange(2, idx[c] + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
  });
}
// Telegram tiện ích cho biến động nhân viên (best-effort — không phá thao tác nếu lỗi).
function staffTelegram_(text) {
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('TELEGRAM_BOT_TOKEN'), chat = props.getProperty('TELEGRAM_CHAT_ID');
    if (!token || !chat) return;
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', muteHttpExceptions: true,
      payload: { chat_id: chat, text: text, disable_web_page_preview: true }
    });
  } catch (e) { /* nuốt lỗi */ }
}

/* ------------------------------- SETUP (chạy tay 1 lần) ------------------------------- */
// Tạo sheet staff-role + header + 1 dòng admin mẫu (nhớ ĐỔI passcode ngay).
function setupStaffRoleSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(STAFF_SHEET) || ss.insertSheet(STAFF_SHEET);
  sh.getRange(1, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(1, 1, 1, STAFF_COLUMNS.length).setValues([STAFF_COLUMNS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  forceStaffTextCols_(sh);
  if (sh.getLastRow() < 2) {
    var demo = 'ADMIN-' + makeSubmissionId_();
    // [passcode, name, role, active, telegram_user_id, phone, note]
    sh.appendRow([demo, 'Admin SOL', 'admin', 'TRUE', '', '', 'Đổi passcode này ngay sau khi đăng nhập']);
    Logger.log('✅ staff-role sẵn sàng. Passcode admin mẫu: %s — ĐỔI NGAY.', demo);
    try { SpreadsheetApp.getUi().alert('Đã tạo sheet "' + STAFF_SHEET + '".\nPasscode admin mẫu:\n\n' + demo + '\n\n→ Đăng nhập admin.html rồi ĐỔI passcode này ngay.'); } catch (e) {}
  } else {
    Logger.log('staff-role đã có — chỉ làm mới header, giữ nguyên dữ liệu.');
  }
}

/* ==================================================================================
 * PHASE 2b — QUẢN LÝ BẬT/TẮT CÁC TRANG FEEDBACK (sheet `feedback-page-list`)
 * ----------------------------------------------------------------------------------
 * Admin bật/tắt từng trang. Trang feedback hỏi `?action=pagestatus` lúc tải; TẮT →
 * frontend REDIRECT về REDIRECT_WHEN_OFF. doPost cũng chặn ghi nếu trang tắt (phòng
 * thủ 2 lớp). Trang CHƯA khai báo trong sheet → mặc định BẬT (fail-open).
 * Bật/tắt và tạo mới đều bắn Telegram cho admin.
 * ================================================================================== */

var PAGE_SHEET = 'feedback-page-list';
// slug·label·active·note + LỊCH tự động: open_at (giờ tự BẬT) · close_at (giờ tự TẮT)
var PAGE_COLUMNS = ['slug', 'label', 'active', 'note', 'open_at', 'close_at'];
var REDIRECT_WHEN_OFF = 'https://fbk.solenglishland.vn/';

function getPageListSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PAGE_SHEET);
  if (!sh) { sh = ss.insertSheet(PAGE_SHEET); sh.appendRow(PAGE_COLUMNS); sh.setFrozenRows(1); }
  if (sh.getLastRow() === 0) sh.appendRow(PAGE_COLUMNS);
  forcePageTextCols_(sh); // LUÔN ép (sheet tạo sẵn/tay trước đây cũng được ép), rẻ và idempotent
  return sh;
}
// open_at/close_at để định dạng Văn bản → giữ nguyên chuỗi ISO, không bị Sheet đổi thành Date.
// Lấy cột theo HEADER THẬT (không dùng index cứng) để không format nhầm cột.
function forcePageTextCols_(sh) {
  var idx = headerIndex_(sh);
  ['open_at', 'close_at'].forEach(function (c) {
    if (idx[c] === undefined) return;
    sh.getRange(2, idx[c] + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
  });
}

// Tên workshop để hiện trong tin Telegram — LẤY TỪ danh sách feedback-page-list (cột label),
// KHÔNG dùng slug (đuôi link). Không tìm thấy → fallback về slug.
function pageLabel_(slug) {
  slug = String(slug || '').trim().toLowerCase();
  if (!slug) return 'unknown';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PAGE_SHEET);
  if (!sh) return slug;
  var found = findRow_(sh, 'slug', slug);
  return found ? (String(found.obj.label || slug)) : slug;
}

function isPageActive_(slug) {
  slug = String(slug || '').trim().toLowerCase();
  if (!slug) return true;
  // Đọc trực tiếp (KHÔNG tự tạo sheet) — tránh side-effect/race trên đường ghi công khai.
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PAGE_SHEET);
  if (!sh) return true; // chưa có sheet → mặc định BẬT (fail-open)
  var found = findRow_(sh, 'slug', slug);
  if (!found) return true; // chưa khai báo → mặc định BẬT
  return String(found.obj.active).toUpperCase() === 'TRUE';
}

function apiListPages(token) {
  requireAuth_(token);
  var sh = getPageListSheet_();
  if (sh.getLastRow() < 2) return { ok: true, pages: [] };
  var idx = headerIndex_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  return {
    ok: true,
    pages: vals.map(function (r) {
      return {
        slug: String(r[idx.slug] || ''), label: String(r[idx.label] || ''),
        active: String(r[idx.active]).toUpperCase() === 'TRUE', note: String(r[idx.note] || ''),
        open_at: toDatetimeLocal_(r[idx.open_at]), close_at: toDatetimeLocal_(r[idx.close_at])
      };
    })
  };
}

function apiSavePage(token, data) {
  var sess = requireAdmin_(token);
  data = data || {};
  var slug = clean_(data.slug).toLowerCase();
  if (!slug) return { ok: false, message: 'Cần mã trang (slug — giá trị ?sw=).' };
  var sh = getPageListSheet_();
  var found = findRow_(sh, 'slug', slug);
  var existed = !!found;
  // LƯU DẠNG ISO CHUẨN (yyyy-MM-ddTHH:mm:ss+07:00) — giống created_at. Input picker là giờ VN local.
  var openIso = toIsoVN_(data.open_at);
  var closeIso = toIsoVN_(data.close_at);
  // Nhập giờ mà không parse được → báo lỗi thay vì âm thầm bỏ qua
  if (clean_(data.open_at) && !openIso) return { ok: false, message: 'Giờ bắt đầu không hợp lệ.' };
  if (clean_(data.close_at) && !closeIso) return { ok: false, message: 'Giờ kết thúc không hợp lệ.' };
  if (openIso && closeIso && new Date(closeIso).getTime() <= new Date(openIso).getTime()) {
    return { ok: false, message: 'Giờ kết thúc phải sau giờ bắt đầu.' };
  }
  // Cột active: CÓ lịch → tính theo lịch + giờ hiện tại. KHÔNG lịch → GIỮ NGUYÊN trạng thái cũ
  // (client không gửi `active` khi chỉ sửa tên/mô tả — không được tự bật lại trang đang tắt).
  var prevActive = found ? (String(found.obj.active).toUpperCase() === 'TRUE') : true;
  var active;
  if (openIso || closeIso) active = computeActiveFromSchedule_(openIso, closeIso) ? 'TRUE' : 'FALSE';
  else active = (data.active === undefined ? prevActive : (data.active !== false)) ? 'TRUE' : 'FALSE';
  forcePageTextCols_(sh); // PHẢI ép TEXT TRƯỚC khi ghi — nếu không Sheets tự đổi chuỗi ISO thành Date
  upsertRow_(sh, 'slug', slug, {
    slug: slug, label: clean_(data.label) || slug, active: active, note: clean_(data.note),
    open_at: openIso, close_at: closeIso
  });
  if (!existed) {
    staffTelegram_('🆕 TẠO TRANG FEEDBACK: ' + (clean_(data.label) || slug) + ' (?sw=' + slug + ')\n— ' + sess.name);
  }
  return { ok: true, active: active === 'TRUE' };
}

// Trạng thái BẬT/TẮT đúng theo lịch tại thời điểm hiện tại (dùng khi lưu để validate cột active).
function computeActiveFromSchedule_(openStr, closeStr) {
  var now = Date.now();
  var openMs = parseWhen_(openStr);
  var closeMs = parseWhen_(closeStr);
  if (openMs && now < openMs) return false;    // chưa tới giờ mở
  if (closeMs && now >= closeMs) return false; // đã qua giờ đóng
  return true;                                 // trong khung (hoặc không có mốc chặn)
}

function apiSetPageActive(token, slug, active) {
  var sess = requireAdmin_(token);
  var sh = getPageListSheet_();
  var found = findRow_(sh, 'slug', clean_(slug).toLowerCase());
  if (!found) return { ok: false, message: 'Không tìm thấy trang.' };
  updateCells_(sh, found.rowIndex, { active: active ? 'TRUE' : 'FALSE' });
  staffTelegram_((active ? '🟢 BẬT' : '🔴 TẮT') + ' trang feedback: ' + (clean_(found.obj.label) || slug) +
    ' (?sw=' + clean_(slug).toLowerCase() + ')' + (active ? '' : ' → redirect ' + REDIRECT_WHEN_OFF) + '\n— ' + sess.name);
  return { ok: true };
}

/* ==================================================================================
 * THỜI GIAN — TUYỆT ĐỐI KHÔNG PHỤ THUỘC MÚI GIỜ
 * ----------------------------------------------------------------------------------
 * VN cố định UTC+07:00, KHÔNG có DST. Nên mọi chuyển đổi ở đây làm bằng SỐ HỌC/CHUỖI
 * thuần, KHÔNG dùng Utilities.parseDate/formatDate → miễn nhiễm với cả:
 *   · Múi giờ của project Apps Script (appsscript.json / Project Settings), VÀ
 *   · Múi giờ của chính Google Sheet (File → Settings → Timezone) — 2 cài đặt KHÁC nhau.
 * ================================================================================== */
var VN_OFFSET = '+07:00';
var VN_MS = 7 * 3600 * 1000;

// ms tuyệt đối → ISO giờ VN 'yyyy-MM-ddTHH:mm:ss+07:00' (số học thuần).
function isoFromMs_(ms) {
  var d = new Date(Number(ms) + VN_MS); // dời sang "wall clock" VN rồi đọc bằng getUTC*
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
    'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + VN_OFFSET;
}
// Múi giờ của chính Google Sheet (KHÁC múi giờ project). getValues() dựng Date theo múi giờ này.
function sheetTz_() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || TZ; } catch (e) { return TZ; }
}
// Bất kỳ giá trị giờ nào → ISO chuẩn giờ VN. Trống/sai → ''.
function toIsoVN_(v) {
  if (v instanceof Date) {
    // Ô đã lỡ bị Sheets ép thành Date: instant được dựng theo MÚI GIỜ CỦA SHEET,
    // nên phải đọc lại "wall clock" bằng ĐÚNG múi giờ đó rồi mới coi là giờ VN.
    return toIsoVN_(Utilities.formatDate(v, sheetTz_(), 'yyyy-MM-dd HH:mm:ss'));
  }
  if (typeof v === 'number' && v > 20000 && v < 90000) {           // serial ngày của Sheets
    return toIsoVN_(new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000)).toISOString().replace('Z', '') .replace('T', ' '));
  }
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/([+-]\d{2}:?\d{2}|Z)$/.test(s)) {                          // đã có offset → giữ đúng mốc tuyệt đối
    var ms = new Date(s).getTime();
    return isNaN(ms) ? '' : isoFromMs_(ms);
  }
  // 'yyyy-MM-dd HH:mm[:ss]' hoặc dùng 'T' = GIỜ VN → GHÉP CHUỖI, không parse
  var m = s.replace('T', ' ').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? (m[1] + 'T' + m[2] + ':' + m[3] + ':' + (m[4] || '00') + VN_OFFSET) : '';
}
// Giá trị ô giờ (ISO đã lưu) → 'yyyy-MM-dd HH:mm' giờ VN cho picker đọc lại (cắt chuỗi thuần).
function toDatetimeLocal_(v) {
  var iso = toIsoVN_(v);
  return iso ? (iso.slice(0, 10) + ' ' + iso.slice(11, 16)) : '';
}
// Chuỗi/Date/serial giờ → ms tuyệt đối. Mọi thứ đi qua toIsoVN_ (ISO có offset) → parse tuyệt đối.
function parseWhen_(v) {
  var iso = toIsoVN_(v);
  if (!iso) return 0;
  var t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}
// ms → 'HH:mm dd-MM-yyyy' giờ VN (cho tin Telegram) — cắt từ ISO, không formatDate.
function fmtWhen_(ms) {
  var iso = isoFromMs_(ms);
  return iso.slice(11, 16) + ' ' + iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4);
}

// CHẠY BỞI TRIGGER: đưa cột active về ĐÚNG trạng thái theo lịch (level-based → idempotent, TỰ CHỮA
// nếu lỡ một lần chạy). Chỉ ghi + báo Telegram khi trạng thái THỰC SỰ đổi. Trang không có lịch → bỏ qua.
function autoTogglePages() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PAGE_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  var idx = headerIndex_(sh);
  if (idx.slug === undefined || idx.active === undefined) return;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var r = 0; r < vals.length; r++) {
    var slug = String(vals[r][idx.slug] || '').trim();
    if (!slug) continue;
    var openIso = idx.open_at === undefined ? '' : toIsoVN_(vals[r][idx.open_at]);
    var closeIso = idx.close_at === undefined ? '' : toIsoVN_(vals[r][idx.close_at]);
    if (!openIso && !closeIso) continue;               // không đặt lịch → để admin bật/tắt tay
    var label = String(vals[r][idx.label] || slug);
    var active = String(vals[r][idx.active]).toUpperCase() === 'TRUE';
    var desired = computeActiveFromSchedule_(openIso, closeIso);
    if (desired === active) continue;                  // đã đúng → không đụng, không spam Telegram
    sh.getRange(r + 2, idx.active + 1).setValue(desired ? 'TRUE' : 'FALSE');
    staffTelegram_(desired
      ? '🟢 TỰ ĐỘNG MỞ trang feedback: ' + label + ' (?sw=' + slug + ')\nTheo lịch mở: ' + fmtWhen_(parseWhen_(openIso))
      : '🔴 TỰ ĐỘNG TẮT trang feedback: ' + label + ' (?sw=' + slug + ') → redirect ' + REDIRECT_WHEN_OFF +
        '\nTheo lịch tắt: ' + fmtWhen_(parseWhen_(closeIso)));
  }
}

// Chạy tay 1 lần: cài trigger autoTogglePages mỗi 1 tiếng (không tạo trùng).
function installAutoToggleTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoTogglePages') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoTogglePages').timeBased().everyHours(1).create();
  Logger.log('✅ Đã cài trigger autoTogglePages mỗi 1 tiếng.');
  try { SpreadsheetApp.getUi().alert('Đã cài lịch tự bật/tắt (kiểm tra mỗi 1 tiếng).'); } catch (e) {}
}

// Chạy tay 1 lần: tạo sheet feedback-page-list + nạp sẵn ckry (SOL Cookery) + test.
function setupFeedbackPageList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PAGE_SHEET) || ss.insertSheet(PAGE_SHEET);
  sh.getRange(1, 1, 1, sh.getMaxColumns()).clearContent();
  sh.getRange(1, 1, 1, PAGE_COLUMNS.length).setValues([PAGE_COLUMNS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  forcePageTextCols_(sh);
  if (sh.getLastRow() < 2) {
    sh.appendRow(['ckry', 'SOL Cookery', 'TRUE', 'Workshop nấu ăn cho bé — SOL Cookery', '', '']);
    sh.appendRow(['test', 'Trang TEST', 'TRUE', 'Trang test bật/tắt (chữ "test" giữa màn hình)', '', '']);
    Logger.log('✅ feedback-page-list sẵn sàng (nạp ckry + test = BẬT).');
    try { SpreadsheetApp.getUi().alert('Đã tạo sheet "' + PAGE_SHEET + '" + nạp ckry (SOL Cookery) và test (đang BẬT).'); } catch (e) {}
  } else {
    Logger.log('feedback-page-list đã có — chỉ làm mới header, giữ nguyên dữ liệu.');
  }
}
