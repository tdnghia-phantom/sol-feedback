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

    var note = String(data.note || '');
    var t = Number(data._t) || 0;
    if (t > 0 && t < FAST_SUBMIT_MS) {
      note = note ? note + ' | fast-submit' : 'fast-submit';
    }

    var rating = clampRating_(data.rating);
    var submissionId = makeSubmissionId_();
    var createdAt = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss") + '+07:00';

    var row = [
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
    ];

    // --- Ghi Sheet (ưu tiên số 1 — có lock chống ghi chồng) ---
    var lock = LockService.getScriptLock();
    lock.tryLock(5000);
    try {
      getFeedbackSheet_().appendRow(row);
    } finally {
      lock.releaseLock();
    }

    // --- Cảnh báo điểm thấp (SAU khi ghi; lỗi bị nuốt — FR-07) ---
    if (rating !== null && rating <= LOW_RATING_THRESHOLD) {
      try {
        sendLowRatingAlert_(rating, data, createdAt);
      } catch (alertErr) {
        // nuốt lỗi — ghi Sheet đã thành công là đủ
      }
    }

    return jsonOut_({ ok: true, submission_id: submissionId });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  return jsonOut_({ ok: true, service: 'sol-feedback', time: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss') });
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

  // ---- Sheet feedback ----
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('I:I').setNumberFormat('@');       // phone = text → giữ số 0 đầu
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

function sendLowRatingAlert_(rating, data, createdAt) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return; // chưa cấu hình → bỏ qua êm

  var contact = [safeStr_(data.parent_name, 120), safeStr_(data.phone, 20)]
    .filter(function (x) { return x; }).join(' ');

  var msg =
    '⚠️ FEEDBACK THẤP (' + rating + '★) · Workshop: ' + (safeStr_(data.ws_id, 40) || 'unknown') + '\n' +
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
  }, Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss") + '+07:00');
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
  }
  return sh;
}

function makeSubmissionId_() {
  return 'FB' + Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 5).toUpperCase();
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
