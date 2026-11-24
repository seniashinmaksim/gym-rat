/*
 * Dev-only mobile layout audit. Paste into the browser console (or run via the in-app browser's
 * JavaScript tool) on any page of the running app. It never runs in production and is not bundled.
 *
 * Flags:
 *  - page-level horizontal scroll (document wider than the viewport)
 *  - any visible element sticking out of its nearest "box" ancestor (card, bordered/rounded panel,
 *    or the main content column) by more than 0.5 px, unless that ancestor is a horizontal scroller
 *  - non-scrolling containers whose content is wider than they are (clipped content)
 *  - text cut off: ellipsis, hidden overflow or a line clamp that hides part of an element's own text
 *
 * Returns { viewport, pageOverflow, findings: [{ el, box, dx, why }] }.
 */
(() => {
  const W = window.innerWidth;
  const findings = [];
  const label = (el) => {
    if (!el) return '';
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 4).join('.') : '';
    const txt = (el.innerText || el.getAttribute?.('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isScroller = (el) => {
    const s = getComputedStyle(el);
    return /(auto|scroll)/.test(s.overflowX);
  };
  const isClipper = (el) => getComputedStyle(el).overflowX === 'hidden';
  const isFixed = (el) => getComputedStyle(el).position === 'fixed';
  const isBox = (el) => {
    if (el === document.body) return true;
    if (isFixed(el)) return true; // overlays/sheets are measured against themselves, not the card they are rendered in
    if (el.tagName === 'MAIN') return true;
    const s = getComputedStyle(el);
    const bordered = parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderRightWidth) > 0;
    const bg = s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    return (bordered || bg) && parseFloat(s.borderTopLeftRadius) > 0;
  };
  const pageOverflow = document.documentElement.scrollWidth - W;
  if (pageOverflow > 0.5) findings.push({ el: 'document', box: 'viewport', dx: pageOverflow, why: 'page scrolls horizontally' });

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = el.getBoundingClientRect();
    // Viewport overflow (fixed/sticky bars included)
    if (r.right > W + 0.5 || r.left < -0.5) {
      let p = el.parentElement, inScroller = false;
      while (p && p !== document.body) { if (isScroller(p) || isClipper(p)) { inScroller = true; break; } p = p.parentElement; }
      if (!inScroller) findings.push({ el: label(el), box: 'viewport', dx: Math.round(Math.max(r.right - W, -r.left) * 10) / 10, why: 'outside the viewport' });
    }
    // Nearest box ancestor (a fixed overlay is only checked against the viewport above)
    if (isFixed(el)) continue;
    let box = el.parentElement, scrolled = false;
    while (box && !isBox(box)) { if (isScroller(box) || isClipper(box)) scrolled = true; box = box.parentElement; }
    if (!box || scrolled || isScroller(box)) continue;
    const b = box.getBoundingClientRect();
    const dx = Math.max(r.right - b.right, b.left - r.left);
    if (dx > 0.5) findings.push({ el: label(el), box: label(box), dx: Math.round(dx * 10) / 10, why: 'wider than its card' });
    // Clipped content inside a non-scrolling element
    const s = getComputedStyle(el);
    // (only when the hidden part would also cross the card edge; negative margins inside the padding are fine)
    if (el.scrollWidth > el.clientWidth + 1 && r.left + el.scrollWidth > b.right + 0.5 && !/(auto|scroll|hidden)/.test(s.overflowX) && el.clientWidth > 0 && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      findings.push({ el: label(el), box: label(box), dx: el.scrollWidth - el.clientWidth, why: 'content wider than the element' });
    }
  }
  // Text cut off (Part 6, owner's rule: never "…"): an element that hides part of its own text — ellipsis,
  // overflow hidden or a line clamp — while its text is longer than the box. Inputs and scrollers are not text boxes.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'svg'].includes(el.tagName) || el.closest('svg')) continue;
    const s = getComputedStyle(el);
    const hidesX = s.textOverflow === 'ellipsis' || s.overflowX === 'hidden' || s.overflowX === 'clip';
    const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
    const hidesY = clamp || s.overflowY === 'hidden' || s.overflowY === 'clip';
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || (el.children.length === 0 && (el.textContent || '').trim());
    if (!ownText && !clamp && s.textOverflow !== 'ellipsis') continue;
    const cutX = hidesX && el.scrollWidth > el.clientWidth + 1;
    const cutY = hidesY && el.scrollHeight > el.clientHeight + 2;
    if (cutX || cutY) findings.push({ el: label(el), box: '', dx: cutX ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight, why: 'text cut off' });
  }
  // De-duplicate: keep the outermost offender of each chain.
  const seen = new Set();
  const out = findings.filter((f) => { const k = f.el + '|' + f.why; if (seen.has(k)) return false; seen.add(k); return true; });
  return { viewport: W, pageOverflow: Math.max(0, pageOverflow), count: out.length, findings: out.slice(0, 40) };
})();
