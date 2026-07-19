/**
 * Unit tests — sinh từ Gherkin trong docs/feedback-srs-lite.md (spec-driven).
 * Chạy: node tests/unit.test.js
 */
var router = require('../router.js');
var fb = require('../feedback-submit.js');

var passed = 0, failed = 0, failures = [];
function eq(id, actual, expected) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { passed++; }
  else { failed++; failures.push(id + '\n   expected: ' + b + '\n   actual:   ' + a); }
}

var REG = { cookery: 'cookery.html', science: 'science.html' };

/* ---------- FR-01: Router resolve (UT-R) ---------- */
eq('UT-R1 ws hợp lệ đơn', router.resolveWorkshop('?ws=cookery', REG), 'cookery.html');
eq('UT-R2 giữ utm, bỏ ws', router.resolveWorkshop('?utm_source=qr&ws=cookery&x=1', REG), 'cookery.html?utm_source=qr&x=1');
eq('UT-R3 ws hoa + space', router.resolveWorkshop('?ws=%20COOKERY%20', REG), 'cookery.html');
eq('UT-R4 ws thứ hai trong registry', router.resolveWorkshop('?ws=science', REG), 'science.html');

/* ---------- FR-02: Fallback + chống open-redirect (UT-R tiếp) ---------- */
eq('UT-R5 ws lạ → null', router.resolveWorkshop('?ws=lung-tung', REG), null);
eq('UT-R6 không có ws → null', router.resolveWorkshop('?utm_source=qr', REG), null);
eq('UT-R7 query rỗng → null', router.resolveWorkshop('', REG), null);
eq('UT-R8 ws rỗng → null', router.resolveWorkshop('?ws=', REG), null);
eq('UT-R9 path traversal → null', router.resolveWorkshop('?ws=../evil', REG), null);
eq('UT-R10 URL ngoài → null', router.resolveWorkshop('?ws=https://evil.com', REG), null);
eq('UT-R11 không dính prototype chain', router.resolveWorkshop('?ws=toString', REG), null);

/* ---------- FR-03: Validate (UT-V) — bảng Gherkin SĐT ---------- */
function v(o) { return fb.fbValidate(o); }
eq('UT-V1 thiếu rating → lỗi rating', v({ rating: 0, child_enjoy: 'Rất thích' }).ok, false);
eq('UT-V1b lỗi nằm đúng field', 'rating' in v({ rating: 0, child_enjoy: 'Rất thích' }).errors, true);
eq('UT-V2 thiếu child_enjoy → lỗi', 'child_enjoy' in v({ rating: 5 }).errors, true);
eq('UT-V3 đủ bắt buộc, phone trống → ok', v({ rating: 5, child_enjoy: 'Rất thích', phone: '' }).ok, true);
eq('UT-V4 phone 10 số → ok', v({ rating: 4, child_enjoy: 'Rất thích', phone: '0938206968' }).ok, true);
eq('UT-V5 phone có dấu chấm → ok (normalize)', v({ rating: 4, child_enjoy: 'Rất thích', phone: '0938.206.968' }).ok, true);
eq('UT-V6 phone 9 số → ok', v({ rating: 4, child_enjoy: 'Rất thích', phone: '938206968' }).ok, true);
eq('UT-V7 phone 11 số → ok', v({ rating: 4, child_enjoy: 'Rất thích', phone: '84938206968' }).ok, true);
eq('UT-V8 phone 8 số → lỗi', 'phone' in v({ rating: 4, child_enjoy: 'Rất thích', phone: '12345678' }).errors, true);
eq('UT-V9 phone chữ → lỗi', 'phone' in v({ rating: 4, child_enjoy: 'Rất thích', phone: 'abc' }).errors, true);
eq('UT-V10 rating 6 → lỗi', 'rating' in v({ rating: 6, child_enjoy: 'Rất thích' }).errors, true);
eq('UT-V11 normalize giữ ký tự lạ để bắt lỗi', fb.fbNormalizePhone('09-38 (206).968'), '0938206968');

/* ---------- FR-04: Payload (UT-P) ---------- */
var payload = fb.fbBuildPayload(
  {
    rating: 5, child_enjoy: 'Rất thích', liked: ['Cô giáo', 'Bé dạn dĩ, tự tin hơn'],
    comment: 'Bé rất vui', parent_name: 'Chị Lan',
    phone: '0938.206.968', allow_testimonial: true
  },
  { wsId: 'cookery', utmSource: 'qr_class', elapsedMs: 45210, honeypot: '' }
);
eq('UT-P1 ws_id đúng', payload.ws_id, 'cookery');
eq('UT-P2 rating là number', payload.rating, 5);
eq('UT-P3 phone đã normalize', payload.phone, '0938206968');
eq('UT-P4 answers echo đủ liked[]', payload.answers.liked, ['Cô giáo', 'Bé dạn dĩ, tự tin hơn']);
eq('UT-P5 utm + _t + _hp có mặt', [payload.utm_source, payload._t, payload._hp], ['qr_class', 45210, '']);
eq('UT-P6 allow_testimonial bool', payload.allow_testimonial, true);
eq('UT-P6b CHG-01: intent vắng mặt → payload.intent rỗng', payload.intent, '');
eq('UT-P7 comment cắt 1500', fb.fbBuildPayload({ rating: 5, child_enjoy: 'x', comment: new Array(2002).join('a') }, { wsId: 'w' }).comment.length, 1500);
eq('UT-P8 honeypot passthrough', fb.fbBuildPayload({ rating: 5, child_enjoy: 'x' }, { wsId: 'w', honeypot: 'bot' })._hp, 'bot');
eq('UT-P9 liked mặc định mảng rỗng', fb.fbBuildPayload({ rating: 5, child_enjoy: 'x' }, { wsId: 'w' }).answers.liked, []);

/* ---------- utm parser ---------- */
eq('UT-Q1 lấy utm_source', fb.fbGetQueryParam('?utm_source=qr_class&x=1', 'utm_source'), 'qr_class');
eq('UT-Q2 không có → rỗng', fb.fbGetQueryParam('?x=1', 'utm_source'), '');
eq('UT-Q3 encoded', fb.fbGetQueryParam('?utm_source=zalo%20oa', 'utm_source'), 'zalo oa');

/* ---------- FR-UX-01: Wizard step guard (UT-S) — CHG-02 ---------- */
eq('UT-S1 rating chưa chọn → chặn', fb.fbStepGuard('rating', { rating: 0 }).ok, false);
eq('UT-S1b báo đúng field', fb.fbStepGuard('rating', { rating: 0 }).field, 'rating');
eq('UT-S2 rating 4 → qua', fb.fbStepGuard('rating', { rating: 4 }).ok, true);
eq('UT-S3 child_enjoy rỗng → chặn', fb.fbStepGuard('child_enjoy', { child_enjoy: '' }).ok, false);
eq('UT-S4 child_enjoy có → qua', fb.fbStepGuard('child_enjoy', { child_enjoy: 'Rất thích' }).ok, true);
eq('UT-S5 liked luôn qua (tùy chọn)', fb.fbStepGuard('liked', { liked: [] }).ok, true);
eq('UT-S6 comment luôn qua (tùy chọn)', fb.fbStepGuard('comment', {}).ok, true);
eq('UT-S7 contact: phone sai → chặn tại phone', fb.fbStepGuard('contact', { rating: 5, child_enjoy: 'x', phone: 'abc' }), { ok: false, field: 'phone', error: 'Số điện thoại chưa đúng — ba mẹ kiểm tra lại giúp SOL (9–11 chữ số) 📞' });
eq('UT-S8 contact: phone trống → qua', fb.fbStepGuard('contact', { rating: 5, child_enjoy: 'x', phone: '' }).ok, true);
eq('UT-S9 contact: phone có dấu chấm → qua', fb.fbStepGuard('contact', { rating: 5, child_enjoy: 'x', phone: '0938.206.968' }).ok, true);

/* ---------- Kết quả ---------- */
console.log('\n========================================');
console.log('  UNIT TEST: ' + passed + ' passed · ' + failed + ' failed');
console.log('========================================');
if (failed) {
  failures.forEach(function (f) { console.log('❌ ' + f); });
  process.exit(1);
} else {
  console.log('✅ Tất cả pass — oracle: Gherkin FR-01…FR-04 (feedback-srs-lite.md)');
}
