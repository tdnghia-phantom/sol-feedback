/**
 * SOL Feedback — Shared submit layer v2 (mọi trang workshop dùng chung)
 * --------------------------------------------------------------------
 * Trang workshop chỉ cần:
 *   1) đặt hằng   window.WS_ID = 'cookery';
 *   2) (tùy chọn) window.ZALO_GROUP_URL = 'https://zalo.me/g/xxxx';
 *   3) markup có data-fb đúng Field Schema Contract (docs/feedback-srs-lite.md §3)
 *   4) <script src="feedback-submit.js" defer></script> → tự init.
 *
 * HAI CHẾ ĐỘ (tự phát hiện):
 *   · WIZARD : trang có [data-fb-step]  → từng-câu-một, auto-advance, progress.
 *   · CLASSIC: không có step            → form phẳng cuộn dọc (tương thích ngược).
 *
 * CORS: POST Content-Type text/plain;charset=utf-8 (simple request, không
 * preflight) → Apps Script JSON.parse(e.postData.contents). ĐÃ KIỂM CHỨNG
 * ở project landing — không đổi pattern.
 */

var FEEDBACK_CONFIG = {
  // [CẦN VERIFY] Dán URL Web app Apps Script (deploy xong) vào đây:
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbx-aa-L6R0Deyl10dYOhzTSP099OnxZdt814tcTiqfv748sMKna-GQSIBKmXlrY43OQ/exec',
  ADVANCE_MS: 1500, // độ trễ auto-advance sau khi chọn (1.5 giây)
  REDIRECT_WHEN_OFF: 'https://fbk.solenglishland.vn/' // trang feedback bị TẮT → redirect về đây
};

/* =======================  PURE FUNCTIONS (test được)  ======================= */

/** Bỏ khoảng trắng, chấm, gạch, ngoặc — giữ nguyên ký tự khác để validate bắt lỗi. */
function fbNormalizePhone(raw) {
  return String(raw == null ? '' : raw).replace(/[\s.\-()]/g, '');
}

/**
 * Validate theo FR-03.
 * @param {Object} v {rating, child_enjoy, phone, ...}
 * @returns {{ok:boolean, errors:Object}} errors: field → message (tiếng Việt, nhẹ nhàng)
 */
function fbValidate(v) {
  var errors = {};
  var rating = Number(v.rating);
  if (!rating || rating < 1 || rating > 5) {
    errors.rating = 'Ba mẹ chạm vào số sao để đánh giá buổi học nhé 🌟';
  }
  if (!v.child_enjoy) {
    errors.child_enjoy = 'Ba mẹ cho SOL biết bé có thích buổi học không nha 💛';
  }
  var phone = fbNormalizePhone(v.phone);
  if (phone && !/^\d{9,11}$/.test(phone)) {
    errors.phone = 'Số điện thoại chưa đúng — ba mẹ kiểm tra lại giúp SOL (9–11 chữ số) 📞';
  }
  return { ok: Object.keys(errors).length === 0, errors: errors };
}

/**
 * Cổng rời bước của wizard (FR-UX-01, §UX SRS-lite v1.1).
 * @param {string} stepId  'rating' | 'child_enjoy' | 'liked' | 'intent' | 'comment' | 'contact'
 * @param {Object} state   giá trị hiện tại (cùng shape với fbValidate input)
 * @returns {{ok:boolean, field:string, error:string}}
 */
function fbStepGuard(stepId, state) {
  if (stepId === 'rating') {
    var r = Number(state.rating);
    if (!r || r < 1 || r > 5) {
      return { ok: false, field: 'rating', error: 'Ba mẹ chạm vào số sao để đánh giá buổi học nhé 🌟' };
    }
    return { ok: true, field: '', error: '' };
  }
  if (stepId === 'child_enjoy') {
    if (!state.child_enjoy) {
      return { ok: false, field: 'child_enjoy', error: 'Ba mẹ cho SOL biết bé có thích buổi học không nha 💛' };
    }
    return { ok: true, field: '', error: '' };
  }
  if (stepId === 'contact') {
    var v = fbValidate(state);
    if (v.errors.phone) return { ok: false, field: 'phone', error: v.errors.phone };
    return { ok: true, field: '', error: '' };
  }
  // liked / comment / intent: tùy chọn — luôn cho qua
  return { ok: true, field: '', error: '' };
}

/**
 * Dựng payload theo Field Schema Contract.
 * @param {Object} v  giá trị form
 * @param {Object} ctx {wsId, utmSource, elapsedMs, honeypot}
 */
function fbBuildPayload(v, ctx) {
  var answers = {
    rating: Number(v.rating) || null,
    child_enjoy: v.child_enjoy || '',
    liked: Array.isArray(v.liked) ? v.liked.slice() : [],
    intent: v.intent || '',
    comment: String(v.comment || '').slice(0, 1500),
    parent_name: String(v.parent_name || '').slice(0, 120),
    phone: fbNormalizePhone(v.phone),
    allow_testimonial: v.allow_testimonial === true
  };
  return {
    ws_id: String(ctx.wsId || 'unknown'),
    rating: answers.rating,
    child_enjoy: answers.child_enjoy,
    intent: answers.intent,
    comment: answers.comment,
    parent_name: answers.parent_name,
    phone: answers.phone,
    allow_testimonial: answers.allow_testimonial,
    utm_source: String(ctx.utmSource || ''),
    answers: answers,
    _t: Number(ctx.elapsedMs) || 0,
    _hp: String(ctx.honeypot || '')
  };
}

/** Lấy 1 query param từ search string (không phụ thuộc URLSearchParams — test được). */
function fbGetQueryParam(search, key) {
  var qs = (search || '').replace(/^\?/, '');
  if (!qs) return '';
  var pairs = qs.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var eq = pairs[i].indexOf('=');
    var k = eq === -1 ? pairs[i] : pairs[i].slice(0, eq);
    if (decodeURIComponentSafe(k) === key) {
      var raw = eq === -1 ? '' : pairs[i].slice(eq + 1);
      return decodeURIComponentSafe(raw.replace(/\+/g, ' '));
    }
  }
  return '';
}
function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

/* =======================  DOM WIRING (browser only)  ======================= */

if (typeof document !== 'undefined') {
  (function () {
    var startedAt = Date.now();
    var submitting = false;
    var advanceTimer = null;
    var introTimer = null; // thẻ mở đầu tự chuyển sang câu 1 sau 20s

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    /* ---------- Thu thập giá trị (DOM = source of truth, dùng chung 2 chế độ) ---------- */
    function collect() {
      var ratingWrap = $('[data-fb-group="rating"]');
      var enjoyWrap = $('[data-fb-group="child_enjoy"]');
      var intentWrap = $('[data-fb-group="intent"]');
      return {
        rating: ratingWrap ? Number(ratingWrap.getAttribute('data-value')) || 0 : 0,
        child_enjoy: enjoyWrap ? (enjoyWrap.getAttribute('data-value') || '') : '',
        liked: $all('[data-fb-group="liked"] [data-check].is-selected').map(function (c) { return c.getAttribute('data-check'); }),
        intent: intentWrap ? (intentWrap.getAttribute('data-value') || '') : '',
        comment: ($('[data-fb="comment"]') || {}).value || '',
        parent_name: ($('[data-fb="parent_name"]') || {}).value || '',
        phone: ($('[data-fb="phone"]') || {}).value || '',
        allow_testimonial: !!($('[data-fb="allow_testimonial"]') || {}).checked
      };
    }

    function showError(field, msg) {
      var el = $('[data-fb-error="' + field + '"]');
      if (el) { el.textContent = msg; el.classList.add('is-visible'); }
    }
    function clearError(field) {
      var el = $('[data-fb-error="' + field + '"]');
      if (el) { el.textContent = ''; el.classList.remove('is-visible'); }
    }
    function clearAllErrors() {
      $all('[data-fb-error]').forEach(function (el) { el.textContent = ''; el.classList.remove('is-visible'); });
    }

    /* ---------- Controls: sao / chip đơn / chip đa ---------- */
    function initStars(onPick) {
      var wrap = $('[data-fb-group="rating"]');
      if (!wrap) return;
      var stars = $all('[data-star]', wrap);
      var caption = $('[data-fb-rating-caption]');
      var captions = { 1: 'SOL xin lỗi vì trải nghiệm chưa tốt 🙏', 2: 'SOL sẽ cố gắng hơn nhiều 🙏', 3: 'Cảm ơn ba mẹ, SOL sẽ cải thiện thêm 💪', 4: 'Tuyệt vời, cảm ơn ba mẹ! 💚', 5: 'Yeahhh! Cả lớp SOL cảm ơn ba mẹ! 🥰' };
      function render(val) {
        stars.forEach(function (s) {
          var n = Number(s.getAttribute('data-star'));
          s.classList.toggle('is-on', n <= val);
          s.classList.toggle('is-pop', n === val);
          s.setAttribute('aria-checked', n === val ? 'true' : 'false');
        });
        if (caption) { caption.textContent = captions[val] || ''; }
      }
      stars.forEach(function (s) {
        s.addEventListener('click', function () {
          wrap.setAttribute('data-value', s.getAttribute('data-star'));
          render(Number(s.getAttribute('data-star')));
          clearError('rating');
          if (onPick) onPick('rating');
        });
      });
    }

    function initChips(groupName, onPick) {
      var wrap = $('[data-fb-group="' + groupName + '"]');
      if (!wrap) return;
      $all('[data-chip]', wrap).forEach(function (chip) {
        chip.addEventListener('click', function () {
          $all('[data-chip]', wrap).forEach(function (c) {
            c.classList.remove('is-selected');
            c.setAttribute('aria-pressed', 'false');
          });
          chip.classList.add('is-selected');
          chip.setAttribute('aria-pressed', 'true');
          wrap.setAttribute('data-value', chip.getAttribute('data-chip'));
          clearError(groupName);
          if (onPick) onPick(groupName);
        });
      });
    }

    function initMultiChips(onToggle) {
      $all('[data-fb-group="liked"] [data-check]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var on = chip.classList.toggle('is-selected');
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
          if (onToggle) onToggle();
        });
      });
    }

    /* ---------- Gửi (dùng chung 2 chế độ) ---------- */
    function setSubmitting(on) {
      submitting = on;
      var btn = $('[data-fb-submit]');
      if (!btn) return;
      btn.disabled = on;
      btn.textContent = on ? 'Đang gửi… ⏳' : (btn.getAttribute('data-label') || 'Bấm để Gửi cảm nhận cho SOL 💌');
    }

    function showThanks() {
      if (introTimer) { clearTimeout(introTimer); introTimer = null; }
      // Gửi xong → hiện MÀN CẢM ƠN (confetti + polaroid + nút nhóm Zalo)
      var form = $('[data-fb-form]');
      var thanks = $('[data-fb-thanks]');
      var topbar = $('[data-fb-topbar]');
      if (form) form.hidden = true;
      if (topbar) topbar.classList.add('is-done');
      var fill = $('[data-fb-progress]');
      if (fill) fill.style.width = '100%';
      if (thanks) {
        thanks.hidden = false;
        var zaloBtn = $('[data-fb-zalo-group]');
        var url = (typeof window !== 'undefined' && window.ZALO_GROUP_URL) || '';
        if (zaloBtn) {
          if (url) { zaloBtn.href = url; zaloBtn.hidden = false; } else { zaloBtn.hidden = true; }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function doSubmit(onInvalidJump) {
      if (submitting) return;
      clearAllErrors();
      var values = collect();
      var check = fbValidate(values);
      if (!check.ok) {
        // Lưới an toàn: wizard đã gác từng bước, nhưng nếu lọt → nhảy về bước lỗi
        var fields = Object.keys(check.errors);
        fields.forEach(function (f) { showError(f, check.errors[f]); });
        if (onInvalidJump) onInvalidJump(fields[0]);
        return;
      }
      var endpoint = FEEDBACK_CONFIG.ENDPOINT;
      if (!endpoint || endpoint.indexOf('{{') !== -1) {
        showError('submit', 'Trang chưa được cấu hình máy chủ (ENDPOINT). Ba mẹ vui lòng nhắn Zalo 0938.206.968 giúp SOL nhé 🙏');
        return;
      }
      var payload = fbBuildPayload(values, {
        wsId: (typeof window !== 'undefined' && window.WS_ID) || 'unknown',
        utmSource: fbGetQueryParam(typeof location !== 'undefined' ? location.search : '', 'utm_source'),
        elapsedMs: Date.now() - startedAt,
        honeypot: ($('[data-fb-hp]') || {}).value || ''
      });
      setSubmitting(true);
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ok) { showThanks(); }
          else if (data && data.closed) {
            setSubmitting(false);
            showError('submit', data.message || 'Trang cảm nhận này đã đóng. Ba Mẹ vui lòng liên hệ SOL qua Zalo 0938.206.968 nhé 🙏');
          }
          else {
            setSubmitting(false);
            showError('submit', 'Có trục trặc nhỏ khi gửi. Ba mẹ bấm Gửi lại giúp SOL nhé 🙏');
          }
        })
        .catch(function () {
          setSubmitting(false);
          showError('submit', 'Mạng đang chập chờn — dữ liệu ba mẹ điền vẫn còn nguyên, bấm Gửi lại giúp SOL nhé 📶');
        });
    }

    /* =========================  WIZARD CONTROLLER  ========================= */
    function initWizard(steps) {
      var current = 0;
      var TOTAL = steps.length;
      var fill = $('[data-fb-progress]');
      var countEl = $('[data-fb-stepcount]');
      var backBtn = $('[data-fb-back]');

      function stepId(i) { return steps[i].getAttribute('data-fb-step'); }

      function updateNextButton(i) {
        var step = steps[i];
        var next = $('[data-fb-next]', step);
        if (!next) return;
        var auto = step.hasAttribute('data-fb-auto');
        var guard = fbStepGuard(stepId(i), collect());
        if (auto) {
          // Bước auto-advance: chỉ hiện "Tiếp tục" khi quay lại bước ĐÃ trả lời
          next.hidden = !guard.ok;
        } else {
          // Bước tùy chọn: đổi nhãn Bỏ qua ↔ Tiếp tục theo trạng thái trả lời
          var answered = false;
          var id = stepId(i);
          var v = collect();
          if (id === 'liked') answered = v.liked.length > 0;
          else if (id === 'comment') answered = String(v.comment).trim().length > 0;
          else if (id === 'intent') answered = !!v.intent;
          else answered = true;
          var skipLabel = next.getAttribute('data-label-skip');
          var nextLabel = next.getAttribute('data-label-next') || 'Tiếp tục';
          if (skipLabel) next.textContent = answered ? nextLabel : skipLabel;
        }
      }

      function goTo(i, dir) {
        if (i < 0 || i >= TOTAL) return;
        if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
        steps[current].classList.remove('is-active', 'from-right', 'from-left');
        steps[current].setAttribute('aria-hidden', 'true');
        current = i;
        var step = steps[current];
        step.classList.add('is-active', dir === 'back' ? 'from-left' : 'from-right');
        step.setAttribute('aria-hidden', 'false');
        if (fill) fill.style.width = Math.round(((current + 1) / TOTAL) * 100) + '%';
        if (countEl) countEl.textContent = (current + 1) + '/' + TOTAL;
        if (backBtn) backBtn.hidden = current === 0;
        updateNextButton(current);
        window.scrollTo({ top: 0, behavior: 'auto' });
        var h = $('.q', step);
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }

      function tryNext() {
        var guard = fbStepGuard(stepId(current), collect());
        if (!guard.ok) {
          showError(guard.field, guard.error);
          return;
        }
        if (current < TOTAL - 1) goTo(current + 1, 'next');
      }

      function autoAdvance() {
        if (current >= TOTAL - 1) return;
        if (advanceTimer) clearTimeout(advanceTimer);
        advanceTimer = setTimeout(function () {
          advanceTimer = null;
          tryNext();
        }, FEEDBACK_CONFIG.ADVANCE_MS);
      }

      // Controls → wizard hooks
      initStars(function () { if (steps[current].hasAttribute('data-fb-auto')) autoAdvance(); });
      initChips('child_enjoy', function () { if (steps[current].hasAttribute('data-fb-auto')) autoAdvance(); });
      initChips('intent', function () { if (steps[current].hasAttribute('data-fb-auto')) autoAdvance(); });
      initMultiChips(function () { updateNextButton(current); });
      var cm = $('[data-fb="comment"]');
      if (cm) cm.addEventListener('input', function () { updateNextButton(current); });

      // Nút điều hướng
      steps.forEach(function (step) {
        var next = $('[data-fb-next]', step);
        if (next) next.addEventListener('click', tryNext);
      });
      if (backBtn) backBtn.addEventListener('click', function () { goTo(current - 1, 'back'); });

      var submitBtn = $('[data-fb-submit]');
      if (submitBtn) submitBtn.addEventListener('click', function () {
        doSubmit(function (badField) {
          // nhảy về bước chứa field lỗi
          for (var i = 0; i < TOTAL; i++) {
            var owns = stepId(i) === badField || (badField === 'phone' && stepId(i) === 'contact');
            if (owns) { goTo(i, 'back'); showError(badField, fbValidate(collect()).errors[badField] || ''); break; }
          }
        });
      });

      // Khởi động
      steps.forEach(function (s, i) {
        if (i !== 0) { s.classList.remove('is-active'); s.setAttribute('aria-hidden', 'true'); }
      });
      goTo(0, 'next');
    }

    /* =========================  CLASSIC (tương thích ngược)  ========================= */
    function initClassic() {
      initStars(null);
      initChips('child_enjoy', null);
      initChips('intent', null);
      initMultiChips(null);
      var btn = $('[data-fb-submit]');
      if (btn) btn.addEventListener('click', function () {
        doSubmit(function (badField) {
          var el = $('[data-fb-error="' + badField + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    }

    // Vào wizard từ thẻ mở đầu (dùng chung cho: bấm CTA + tự động sau 20s)
    function startWizard() {
      var app = $('[data-fb-app]') || document.body;
      if (introTimer) { clearTimeout(introTimer); introTimer = null; }
      if (!app.classList.contains('is-intro')) return;                 // đã vào wizard rồi
      if (app.classList.contains('is-submitted') || app.classList.contains('is-closed')) return;
      app.classList.remove('is-intro');
      window.scrollTo({ top: 0, behavior: 'auto' });
      var h = $('.step.is-active .q');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }

    // Gỡ overlay che trang → hiện nội dung feedback.
    function revealPage() {
      var gate = $('[data-fb-gate]');
      if (gate) gate.style.display = 'none';
    }
    // Bật/tắt trang feedback: hỏi backend TRƯỚC khi lộ nội dung. TẮT → redirect NGAY (giữ overlay);
    // BẬT / lỗi / chưa cấu hình → gỡ overlay hiện trang. Fail-open + timeout 2.5s để không kẹt user hợp lệ.
    function checkPageStatus() {
      // Router (index.html) đã kiểm tra trạng thái rồi (fbok=1) → hiện trang luôn, khỏi hỏi lại
      if (typeof location !== 'undefined' && /(?:^|[?&])fbok=1(?:&|$)/.test(location.search)) { revealPage(); return; }
      var endpoint = FEEDBACK_CONFIG.ENDPOINT;
      var wsId = (typeof window !== 'undefined' && window.WS_ID) || '';
      if (!endpoint || endpoint.indexOf('{{') !== -1 || !wsId) { revealPage(); return; }
      var revealTimer = setTimeout(revealPage, 2500); // mạng chậm → vẫn hiện trang
      var sep = endpoint.indexOf('?') === -1 ? '?' : '&';
      fetch(endpoint + sep + 'action=pagestatus&sw=' + encodeURIComponent(wsId))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          clearTimeout(revealTimer);
          if (d && d.ok && d.active === false) {
            // TẮT → điều hướng ngay, KHÔNG gỡ overlay (không lộ nội dung feedback)
            var to = (d.redirect || FEEDBACK_CONFIG.REDIRECT_WHEN_OFF);
            if (typeof location !== 'undefined' && to) location.replace(to); else revealPage();
          } else { revealPage(); }
        })
        .catch(function () { clearTimeout(revealTimer); revealPage(); /* fail-open */ });
    }

    function init() {
      checkPageStatus(); // hỏi trạng thái NGAY (overlay đang che) → redirect sớm nếu trang tắt
      // Thẻ mở đầu (tùy chọn): [data-fb-intro] + nút [data-fb-start] → vào wizard; hoặc tự chuyển sau 10s
      var intro = $('[data-fb-intro]');
      if (intro) {
        var startBtn = $('[data-fb-start]', intro);
        if (startBtn) startBtn.addEventListener('click', startWizard);
        introTimer = setTimeout(startWizard, 8000); // 8 giây tự chuyển sang câu 1
      }
      var steps = $all('[data-fb-step]');
      if (steps.length > 0) initWizard(steps);
      else initClassic();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
  })();
}

/* ---- Export cho unit test (Node) ---- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fbNormalizePhone: fbNormalizePhone,
    fbValidate: fbValidate,
    fbStepGuard: fbStepGuard,
    fbBuildPayload: fbBuildPayload,
    fbGetQueryParam: fbGetQueryParam
  };
}
