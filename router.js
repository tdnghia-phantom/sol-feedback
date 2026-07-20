/**
 * SOL Feedback — Router (điểm vào feedback.sol.vn)
 * -------------------------------------------------
 * Đọc ?sw= → tra WORKSHOP_REGISTRY (whitelist) → redirect sang trang workshop,
 * GIỮ NGUYÊN các query param khác (bỏ ws). Không match → index.html tự hiện
 * fallback thân thiện (thêm class 'show-fallback' lên <html>).
 *
 * THÊM WORKSHOP MỚI = thêm đúng 1 dòng vào WORKSHOP_REGISTRY bên dưới
 * (+ tạo file HTML tương ứng). KHÔNG đụng gì khác.
 *
 * An toàn: registry là whitelist duy nhất — không bao giờ dựng URL từ input
 * người dùng → miễn nhiễm open-redirect (?sw=https://evil.com → fallback).
 */

var WORKSHOP_REGISTRY = {
  ckry: 'cookery.html',
  test: 'test.html'          // trang test bật/tắt (chữ "test" giữa màn hình)
  // sci: 'science.html',    // ← ví dụ: mở comment khi có workshop Science
};

/**
 * Resolve ws từ query string.
 * @param {string} search - location.search, ví dụ "?sw=ckry&utm_source=qr"
 * @param {Object} registry - map ws_key → file html
 * @returns {string|null} "cookery.html?utm_source=qr" hoặc null nếu không match
 */
function resolveWorkshop(search, registry) {
  if (!search || typeof search !== 'string') return null;
  var qs = search.charAt(0) === '?' ? search.slice(1) : search;
  if (!qs) return null;

  var pairs = qs.split('&');
  var wsKey = null;
  var others = [];

  for (var i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue;
    var eq = pairs[i].indexOf('=');
    var rawK = eq === -1 ? pairs[i] : pairs[i].slice(0, eq);
    var rawV = eq === -1 ? '' : pairs[i].slice(eq + 1);
    var k;
    try { k = decodeURIComponent(rawK); } catch (e) { k = rawK; }
    if (k === 'sw') {
      var v;
      try { v = decodeURIComponent(rawV.replace(/\+/g, ' ')); } catch (e2) { v = rawV; }
      wsKey = v.trim().toLowerCase();
    } else {
      others.push(pairs[i]); // giữ nguyên encoding gốc, nguyên thứ tự
    }
  }

  if (!wsKey) return null;
  if (!Object.prototype.hasOwnProperty.call(registry, wsKey)) return null;

  var target = registry[wsKey];
  return others.length ? target + '?' + others.join('&') : target;
}

/**
 * Lấy giá trị ?sw= (đã lowercase+trim) — dùng để hỏi trạng thái bật/tắt trang.
 */
function getSwValue(search) {
  if (!search || typeof search !== 'string') return '';
  var qs = search.charAt(0) === '?' ? search.slice(1) : search;
  var pairs = qs.split('&');
  var sw = ''; // last-sw-wins — ĐỒNG NHẤT với resolveWorkshop (tránh lệch khi ?sw= trùng lặp)
  for (var i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue;
    var eq = pairs[i].indexOf('=');
    var k = eq === -1 ? pairs[i] : pairs[i].slice(0, eq);
    try { k = decodeURIComponent(k); } catch (e) {}
    if (k === 'sw') {
      var v = eq === -1 ? '' : pairs[i].slice(eq + 1);
      try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e2) {}
      sw = v.trim().toLowerCase();
    }
  }
  return sw;
}
/* Router chỉ chuyển hướng SỚM khi trang đã tắt (đỡ tải trang nặng). Trang workshop VẪN tự
   kiểm tra lại — KHÔNG truyền cờ "đã kiểm tra" qua URL, vì cờ đó nằm trên thanh địa chỉ
   nên F5/bookmark/gửi link sẽ vào được trang đã tắt. */

/* ---- Chạy trong browser ---- */
if (typeof window !== 'undefined' && typeof location !== 'undefined') {
  (function () {
    var target = resolveWorkshop(location.search, WORKSHOP_REGISTRY);
    if (!target) {
      // Không match → hiện fallback (index.html xử lý qua CSS class)
      document.documentElement.classList.add('show-fallback');
      return;
    }
    // Hỏi trạng thái bật/tắt NGAY tại router — TẮT thì redirect thẳng, KHÔNG tải trang workshop.
    var cfg = (typeof FEEDBACK_CONFIG !== 'undefined') ? FEEDBACK_CONFIG : {};
    var endpoint = cfg.ENDPOINT || '';
    var redirectOff = cfg.REDIRECT_WHEN_OFF || 'https://fbk.solenglishland.vn/';
    var sw = getSwValue(location.search);
    if (!endpoint || endpoint.indexOf('{{') !== -1 || !sw) { location.replace(target); return; } // fail-open
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; location.replace(target); } }, 2500);
    var sep = endpoint.indexOf('?') === -1 ? '?' : '&';
    fetch(endpoint + sep + 'action=pagestatus&sw=' + encodeURIComponent(sw))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (done) return; done = true; clearTimeout(timer);
        if (d && d.ok && d.active === false) { location.replace(d.redirect || redirectOff); } // TẮT → về trang chính
        else { location.replace(target); }                                          // BẬT → vào trang workshop
      })
      .catch(function () { if (done) return; done = true; clearTimeout(timer); location.replace(target); });
  })();
}

/* ---- Export cho unit test (Node) ---- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveWorkshop: resolveWorkshop, WORKSHOP_REGISTRY: WORKSHOP_REGISTRY };
}
