/**
 * SOL Feedback — Router (điểm vào feedback.sol.vn)
 * -------------------------------------------------
 * Đọc ?ws= → tra WORKSHOP_REGISTRY (whitelist) → redirect sang trang workshop,
 * GIỮ NGUYÊN các query param khác (bỏ ws). Không match → index.html tự hiện
 * fallback thân thiện (thêm class 'show-fallback' lên <html>).
 *
 * THÊM WORKSHOP MỚI = thêm đúng 1 dòng vào WORKSHOP_REGISTRY bên dưới
 * (+ tạo file HTML tương ứng). KHÔNG đụng gì khác.
 *
 * An toàn: registry là whitelist duy nhất — không bao giờ dựng URL từ input
 * người dùng → miễn nhiễm open-redirect (?ws=https://evil.com → fallback).
 */

var WORKSHOP_REGISTRY = {
  cookery: 'cookery.html'
  // science: 'science.html',   // ← ví dụ: mở comment khi có workshop Science
};

/**
 * Resolve ws từ query string.
 * @param {string} search - location.search, ví dụ "?ws=cookery&utm_source=qr"
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
    if (k === 'ws') {
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

/* ---- Chạy trong browser ---- */
if (typeof window !== 'undefined' && typeof location !== 'undefined') {
  (function () {
    var target = resolveWorkshop(location.search, WORKSHOP_REGISTRY);
    if (target) {
      location.replace(target);
    } else {
      // Không match → hiện fallback (index.html xử lý qua CSS class)
      document.documentElement.classList.add('show-fallback');
    }
  })();
}

/* ---- Export cho unit test (Node) ---- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveWorkshop: resolveWorkshop, WORKSHOP_REGISTRY: WORKSHOP_REGISTRY };
}
