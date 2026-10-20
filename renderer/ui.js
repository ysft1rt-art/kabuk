'use strict';

// Kabuk'un kendi arayüz bileşenleri. Chromium'un hazır öğeleri (select, range,
// checkbox, confirm(), title ipuçları, kaydırma çubukları) hiç kullanılmaz;
// hepsinin yerine buradakiler kullanılır ve temanın renkleriyle çizilir.
window.KUI = (() => {
  const CHEVRON = '<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>';
  const CHECK = '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>';

  // ---------- Kaydırma çubuğu ----------
  // scroller kayan kutu, host ise çubuğun çizileceği (position'lı) kapsayıcı
  function scrollbar(scroller, host = scroller.parentElement) {
    scroller.classList.add('kscroll-hide');
    const bar = document.createElement('div');
    bar.className = 'kscroll';
    const thumb = document.createElement('div');
    thumb.className = 'kscroll-thumb';
    bar.appendChild(thumb);
    host.appendChild(bar);
    let fadeTimer;

    function update() {
      const { scrollHeight: sh, clientHeight: ch, scrollTop: st } = scroller;
      bar.hidden = sh <= ch + 1;
      if (bar.hidden) return;
      bar.style.top = scroller.offsetTop + 4 + 'px';
      bar.style.height = ch - 8 + 'px';
      const track = ch - 8;
      const h = Math.max(32, (track * ch) / sh);
      thumb.style.height = h + 'px';
      thumb.style.transform = `translateY(${(st / (sh - ch)) * (track - h)}px)`;
    }
    function flash() {
      bar.classList.add('active');
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => bar.classList.remove('active'), 900);
    }
    scroller.addEventListener('scroll', () => { update(); flash(); }, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    for (const c of scroller.children) ro.observe(c);
    new MutationObserver(() => { for (const c of scroller.children) ro.observe(c); update(); })
      .observe(scroller, { childList: true });

    thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { thumb.setPointerCapture(e.pointerId); } catch {}
      bar.classList.add('dragging');
      const y0 = e.clientY;
      const top0 = scroller.scrollTop;
      const { scrollHeight: sh, clientHeight: ch } = scroller;
      const ratio = (sh - ch) / (ch - 8 - thumb.offsetHeight);
      const move = (ev) => { scroller.scrollTop = top0 + (ev.clientY - y0) * ratio; };
      const up = () => {
        bar.classList.remove('dragging');
        thumb.removeEventListener('pointermove', move);
        thumb.removeEventListener('pointerup', up);
      };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up);
    });
    // Boş yere tıklayınca bir sayfa kaydır
    bar.addEventListener('pointerdown', (e) => {
      if (e.target !== bar) return;
      const r = thumb.getBoundingClientRect();
      scroller.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * scroller.clientHeight * 0.9, behavior: 'smooth' });
    });
    requestAnimationFrame(update);
    return { update };
  }

  // ---------- Açılır liste ----------
  let closeOpenMenu = null;
  function closeMenus() {
    if (!closeOpenMenu) return false;
    closeOpenMenu();
    return true;
  }

  // Küçük renk önizlemesi: zemin rengi üzerinde birkaç renk noktası
  function swatch({ bg, colors }) {
    const s = document.createElement('span');
    s.className = 'kswatch';
    s.style.background = bg;
    for (const c of colors) {
      const dot = document.createElement('i');
      dot.style.background = c;
      s.appendChild(dot);
    }
    return s;
  }

  // options: [{ value, label, font?, group?, swatch?: { bg, colors } }]
  // group değişince listede bir başlık çıkar; harfe basınca o harfle başlayana atlar
  function select(host, { options = [], value, onChange, width, maxHeight = 300 }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kselect';
    if (width) btn.style.width = width + 'px';
    btn.innerHTML = `<span class="kselect-label"></span>${CHEVRON}`;
    const label = btn.firstElementChild;
    host.replaceChildren(btn);
    let opts = options;
    let current = value;

    function paint() {
      const o = opts.find((x) => x.value === current);
      btn.querySelector('.kswatch')?.remove();
      if (o?.swatch) btn.prepend(swatch(o.swatch));
      label.textContent = o ? o.label : '';
      label.style.fontFamily = o?.font ? `"${o.font}", monospace` : '';
    }

    function open() {
      closeMenus();
      closeTip();
      const menu = document.createElement('div');
      menu.className = 'kmenu';
      const list = document.createElement('div');
      list.className = 'kmenu-list';
      menu.appendChild(list);
      let active = Math.max(0, opts.findIndex((x) => x.value === current));
      let group;
      const items = opts.map((o, i) => {
        if (o.group && o.group !== group) {
          group = o.group;
          const h = document.createElement('div');
          h.className = 'kmenu-group';
          h.textContent = group;
          list.appendChild(h);
        }
        const it = document.createElement('div');
        it.className = 'kmenu-item' + (o.value === current ? ' selected' : '');
        it.innerHTML = `<span class="kmenu-text"></span><span class="kmenu-check">${CHECK}</span>`;
        it.firstElementChild.textContent = o.label;
        if (o.font) it.firstElementChild.style.fontFamily = `"${o.font}", monospace`;
        if (o.swatch) it.prepend(swatch(o.swatch));
        it.addEventListener('mousedown', (e) => e.preventDefault());
        it.addEventListener('mousemove', () => setActive(i, false));
        it.addEventListener('click', () => choose(o.value));
        list.appendChild(it);
        return it;
      });
      document.body.appendChild(menu);
      btn.classList.add('open');

      list.style.maxHeight = maxHeight + 'px';
      // Aşağıya mı yukarıya mı açılacağına bir kez karar ver; sonra düğmeyi takip et
      const r0 = btn.getBoundingClientRect();
      menu.style.minWidth = r0.width + 'px';
      const roomBelow = window.innerHeight - r0.bottom - 12;
      const roomAbove = r0.top - 12;
      const downward = Math.min(menu.offsetHeight, maxHeight) <= roomBelow || roomBelow >= roomAbove;
      function place() {
        const r = btn.getBoundingClientRect();
        const room = downward ? window.innerHeight - r.bottom - 12 : r.top - 12;
        list.style.maxHeight = Math.max(120, Math.min(maxHeight, room)) + 'px';
        menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8) + 'px';
        menu.style.top = (downward ? r.bottom + 4 : r.top - 4 - menu.offsetHeight) + 'px';
      }
      // Düğme, içinde bulunduğu kaydırılan alanın dışına çıktı mı?
      function btnVisible() {
        const r = btn.getBoundingClientRect();
        for (let p = btn.parentElement; p && p !== document.body; p = p.parentElement) {
          if (!/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) continue;
          const c = p.getBoundingClientRect();
          if (r.bottom <= c.top || r.top >= c.bottom) return false;
        }
        return true;
      }
      function onScroll(e) {
        if (menu.contains(e.target)) return;   // listenin kendi içinde kaydırma
        if (btnVisible()) place(); else close();
      }
      place();
      scrollbar(list, menu);
      setActive(active, true);

      function setActive(i, scroll) {
        items[active]?.classList.remove('active');
        active = (i + items.length) % items.length;
        items[active]?.classList.add('active');
        if (scroll) items[active]?.scrollIntoView({ block: 'nearest' });
      }
      function choose(v) {
        close();
        btn.focus();
        if (v !== current) { current = v; paint(); onChange?.(v); }
      }
      // Harfe basınca, o harfle başlayan bir sonraki seçeneğe git
      function jumpTo(ch) {
        const c = ch.toLocaleLowerCase('tr');
        for (let n = 1; n <= opts.length; n++) {
          const i = (active + n) % opts.length;
          if (opts[i].label.toLocaleLowerCase('tr').startsWith(c)) { setActive(i, true); return; }
        }
      }
      function onKey(e) {
        if (e.key === 'ArrowDown') setActive(active + 1, true);
        else if (e.key === 'ArrowUp') setActive(active - 1, true);
        else if (e.key === 'Home') setActive(0, true);
        else if (e.key === 'End') setActive(items.length - 1, true);
        else if (e.key === 'Enter' || e.key === ' ') choose(opts[active].value);
        else if (e.key === 'Escape' || e.key === 'Tab') { close(); btn.focus(); }
        else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) jumpTo(e.key);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }
      function onDown(e) { if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); }
      function close() {
        menu.remove();
        btn.classList.remove('open');
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('mousedown', onDown, true);
        window.removeEventListener('blur', close);
        window.removeEventListener('resize', close);
        document.removeEventListener('scroll', onScroll, true);
        closeOpenMenu = null;
      }
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      window.addEventListener('blur', close);
      window.addEventListener('resize', close);
      closeOpenMenu = close;
    }

    btn.addEventListener('click', () => (btn.classList.contains('open') ? closeMenus() : open()));
    btn.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !btn.classList.contains('open')) {
        e.preventDefault();
        open();
      }
    });
    paint();
    return {
      el: btn,
      setOptions(o) { opts = o; paint(); },
      setValue(v) { current = v; paint(); },
    };
  }

  // ---------- Kaydırıcı ----------
  function slider(host, { min, max, step, value, onInput, format = (v) => v }) {
    const el = document.createElement('div');
    el.className = 'kslider';
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.innerHTML = '<div class="kslider-track"><div class="kslider-fill"></div></div><div class="kslider-thumb"></div>';
    const out = document.createElement('span');
    out.className = 'kslider-value';
    host.replaceChildren(el, out);
    const fill = el.querySelector('.kslider-fill');
    const thumb = el.querySelector('.kslider-thumb');
    let current = value;
    const decimals = (String(step).split('.')[1] || '').length;

    function paint() {
      const p = (current - min) / (max - min);
      fill.style.width = p * 100 + '%';
      thumb.style.left = p * 100 + '%';
      out.textContent = format(current);
      el.setAttribute('aria-valuenow', current);
    }
    function set(v) {
      v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
      v = Number(v.toFixed(decimals));
      if (v === current) return;
      current = v;
      paint();
      onInput?.(v);
    }
    function fromX(x) {
      const r = el.getBoundingClientRect();
      set(min + ((x - r.left) / r.width) * (max - min));
    }
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.focus();
      try { el.setPointerCapture(e.pointerId); } catch {}
      el.classList.add('dragging');
      fromX(e.clientX);
      const move = (ev) => fromX(ev.clientX);
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    el.addEventListener('keydown', (e) => {
      const k = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[e.key];
      if (k) set(current + k);
      else if (e.key === 'Home') set(min);
      else if (e.key === 'End') set(max);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    paint();
    return { el, setValue(v) { current = v; paint(); } };
  }

  // ---------- Aç/kapa anahtarı ----------
  // <button class="kswitch"> üzerinde çalışır
  function toggle(btn, onChange) {
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', on);
      onChange(on);
    });
    return { setChecked(on) { btn.setAttribute('aria-checked', !!on); } };
  }

  // ---------- Onay penceresi ----------
  let modalOpen = false;
  function confirm({ title, message, ok = t('Tamam'), cancel = t('Vazgeç'), danger = false }) {
    return new Promise((resolve) => {
      closeMenus();
      closeTip();
      modalOpen = true;
      const prevFocus = document.activeElement;
      const back = document.createElement('div');
      back.className = 'kmodal-back';
      back.innerHTML = `
        <div class="kmodal" role="dialog" aria-modal="true">
          <div class="kmodal-title"></div>
          <div class="kmodal-text"></div>
          <div class="kmodal-actions">
            <button type="button" class="set-btn" data-r="0"></button>
            <button type="button" class="set-btn ${danger ? 'danger solid' : 'primary'}" data-r="1"></button>
          </div>
        </div>`;
      back.querySelector('.kmodal-title').textContent = title;
      back.querySelector('.kmodal-text').textContent = message;
      const [no, yes] = back.querySelectorAll('button');
      no.textContent = cancel;
      yes.textContent = ok;
      document.body.appendChild(back);
      yes.focus();

      function done(r) {
        modalOpen = false;
        document.removeEventListener('keydown', onKey, true);
        back.classList.add('closing');
        setTimeout(() => back.remove(), 120);
        prevFocus?.focus?.();
        resolve(r);
      }
      function onKey(e) {
        if (e.key === 'Escape') done(false);
        else if (e.key === 'Enter') done(document.activeElement !== no);
        else if (e.key === 'Tab') (document.activeElement === yes ? no : yes).focus();
        else return;
        e.preventDefault();
        e.stopPropagation();
      }
      document.addEventListener('keydown', onKey, true);
      no.onclick = () => done(false);
      yes.onclick = () => done(true);
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(false); });
    });
  }

  // ---------- İpucu kutusu ----------
  // title="" yerine data-tip="" kullan
  const tip = document.createElement('div');
  tip.className = 'ktip';
  tip.hidden = true;
  let tipFor = null;
  let tipTimer;
  function closeTip() {
    clearTimeout(tipTimer);
    tip.hidden = true;
  }
  function showTip(el) {
    if (!el.isConnected || !el.dataset.tip) return;
    tip.textContent = tq(el.dataset.tip);   // ipuçları Türkçe yazılır, seçili dile burada çevrilir (i18n.js)
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 6) top = r.top - h - 6;
    tip.style.top = top + 'px';
    tip.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 6)) + 'px';
  }
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tip));
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[data-tip]') || null;
    if (el === tipFor) return;
    tipFor = el;
    closeTip();
    if (el) tipTimer = setTimeout(() => showTip(el), 450);
  });
  document.addEventListener('mousedown', () => { tipFor = null; closeTip(); }, true);
  window.addEventListener('blur', closeTip);

  return { scrollbar, select, slider, toggle, confirm, closeMenus, closeTip, isModalOpen: () => modalOpen };
})();
