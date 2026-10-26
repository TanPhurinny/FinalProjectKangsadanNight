/* หน้าแจ้งเตือน (/notifications) — ข้อมูลจาก <script id="ntData"> (loadSellerBookingStatus ใน routes/sellerRoute.js)
   อ่านแล้ว/ยังไม่อ่านบันทึกลง DB ผ่าน POST /notifications/read|unread (utils/notificationReads.js)
   ลูกเล่น: แถบต้องทำ + นับถอยหลังเส้นตาย, หมวด, ค้นหา (ไฮไลต์คำ), จัดกลุ่มตามวัน, กดแถวเพื่อกางรายละเอียด,
   ปัดซ้าย/ขวาบนมือถือสลับอ่านแล้ว, อ่านทั้งหมดพร้อมเลิกทำ, ดึงแจ้งเตือนใหม่ทุก 60 วินาที, คีย์ลัด, จำตัวกรองไว้ใน URL */
(function () {
  const CATEGORIES = [
    { id: 'all', label: 'ทั้งหมด', icon: 'bi-inbox' },
    { id: 'booking', label: 'การจองและล็อก', icon: 'bi-shop' },
    { id: 'document', label: 'เอกสาร', icon: 'bi-file-earmark-text' },
    { id: 'repair', label: 'แจ้งซ่อม', icon: 'bi-tools' },
    { id: 'shop', label: 'ร้านและชุมชน', icon: 'bi-chat-heart' },
    { id: 'event', label: 'บูธกิจกรรม', icon: 'bi-calendar-event' }
  ];
  const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

  // ไอคอน + โทนสีตาม type ที่ builder ฝั่ง server ตั้งไว้
  const TYPE_META = {
    'pending-review': ['bi-hourglass-split', 'warn'],
    'pending-payment': ['bi-wallet2', 'warn'],
    'success-payment': ['bi-check-circle-fill', 'ok'],
    'success-receipt': ['bi-receipt', 'ok'],
    cancelled: ['bi-x-circle-fill', 'bad'],
    info: ['bi-info-circle', 'info'],
    'repair-in_progress': ['bi-tools', 'warn'],
    'repair-success': ['bi-tools', 'ok'],
    'repair-rejected': ['bi-tools', 'bad'],
    'tax-invoice-issued': ['bi-file-earmark-check', 'ok'],
    'tax-invoice-cancelled': ['bi-file-earmark-x', 'bad'],
    'community-comment': ['bi-chat-dots-fill', 'info'],
    'community-like': ['bi-heart-fill', 'bad'],
    'shop-review': ['bi-star-fill', 'warn']
  };

  const STEP_LABELS = { 1: 'ส่งคำขอจองแล้ว', 2: 'จัดล็อก / ชำระเงิน', 3: 'จองสำเร็จ' };
  const POLL_MS = 60 * 1000;
  const SWIPE_TRIGGER = 80;

  const $ = (id) => document.getElementById(id);
  const els = {
    cats: $('ntCats'), progress: $('ntProgress'), steps: $('ntSteps'),
    search: $('ntSearch'), markAll: $('ntMarkAll'), fresh: $('ntFresh'), freshText: $('ntFreshText'),
    todo: $('ntTodo'), todoList: $('ntTodoList'), list: $('ntList'),
    statUnread: $('ntStatUnread'), statAction: $('ntStatAction'), statAll: $('ntStatAll'),
    toast: $('ntToast'), toastText: $('ntToastText'), toastUndo: $('ntToastUndo'),
    keys: $('ntKeys'), keysBtn: $('ntKeysBtn')
  };

  const params = new URLSearchParams(location.search);
  const state = {
    items: readInitialData(),
    cat: CATEGORIES.some((c) => c.id === params.get('c')) ? params.get('c') : 'all',
    read: ['unread', 'read'].includes(params.get('f')) ? params.get('f') : 'all',
    q: params.get('q') || '',
    openKey: null,
    focusKey: null,
    pending: null,      // ชุดแจ้งเตือนใหม่จากการดึงซ้ำ ที่รอผู้ใช้กดแสดง
    freshKeys: new Set()
  };
  const baseTitle = document.title;

  function readInitialData() {
    try {
      const data = JSON.parse(document.getElementById('ntData').textContent || '{}');
      return Array.isArray(data.notifications) ? data.notifications : [];
    } catch (error) {
      return [];
    }
  }

  // ---------- ข้อความ ----------
  // desc/title บางชิ้น server escape มาแล้ว บางชิ้นเป็นข้อความดิบ — ถอดเป็นข้อความล้วนก่อน แล้ว escape ใหม่ตอนวาด
  const decoder = document.createElement('textarea');
  function plain(value) {
    decoder.innerHTML = String(value ?? '');
    return decoder.value;
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function highlight(text) {
    const safe = esc(text);
    const q = state.q.trim();
    if (!q) return safe;
    const pattern = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(pattern, 'gi'), (m) => `<mark>${m}</mark>`);
  }
  function safeLink(link) {
    const value = String(link || '');
    return value.startsWith('/') && !value.startsWith('//') ? value : null;
  }

  // ---------- เวลา ----------
  const DAY = 24 * 60 * 60 * 1000;
  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function clock(date) {
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  }
  function shortDate(date) {
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  }
  function relative(at) {
    if (!at) return '';
    const date = new Date(at);
    const diff = Date.now() - date.getTime();
    if (diff < 0) return shortDate(date);
    if (diff < 60 * 1000) return 'เมื่อสักครู่';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} นาทีที่แล้ว`;
    const days = Math.round((startOfDay(Date.now()) - startOfDay(date)) / DAY);
    if (days === 0) return `${Math.floor(diff / 3600000)} ชม.ที่แล้ว`;
    if (days === 1) return 'เมื่อวาน';
    if (days < 7) return `${days} วันที่แล้ว`;
    return shortDate(date);
  }
  function groupOf(at) {
    if (!at) return { id: 'none', label: 'ไม่ระบุเวลา', order: 4 };
    const days = Math.round((startOfDay(Date.now()) - startOfDay(at)) / DAY);
    if (days <= 0) return { id: 'today', label: 'วันนี้', order: 0 };
    if (days === 1) return { id: 'yesterday', label: 'เมื่อวาน', order: 1 };
    if (days < 7) return { id: 'week', label: '7 วันที่ผ่านมา', order: 2 };
    return { id: 'older', label: 'ก่อนหน้านั้น', order: 3 };
  }
  function countdown(deadline) {
    if (!deadline) return null;
    const left = new Date(deadline).getTime() - Date.now();
    if (Number.isNaN(left)) return null;
    if (left <= 0) return { text: 'เลยกำหนดแล้ว', cls: 'nt-countdown--over' };
    const mins = Math.floor(left / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const text = d > 0 ? `เหลือ ${d} วัน ${h} ชม.` : h > 0 ? `เหลือ ${h} ชม. ${m} นาที` : `เหลือ ${m} นาที`;
    return { text, cls: left < 3 * 60 * 60 * 1000 ? 'nt-countdown--urgent' : '' };
  }

  // ---------- คัดกรอง ----------
  // ขั้นการจอง (step) ระหว่างทางแสดงในแถบความคืบหน้าแล้ว ไม่ต้องซ้ำในรายการ — ยกเว้นขั้นที่มีงานให้ทำ และขั้นจองสำเร็จ (ข่าวที่ผู้ขายควรเห็น)
  // กติกาเดียวกับเลขกระดิ่งใน navbarSeller.ejs
  const isReal = (item) => !item.upcoming && (!item.step || Boolean(item.action) || item.step === 3);
  function matchesSearch(item) {
    const q = state.q.trim().toLowerCase();
    if (!q) return true;
    return [item.title, item.desc, item.action, item.summary, CATEGORY_LABEL[item.category]]
      .some((v) => plain(v).toLowerCase().includes(q));
  }
  function inView(item) {
    if (!isReal(item)) return false;
    if (state.cat !== 'all' && item.category !== state.cat) return false;
    if (state.read === 'unread' && item.isRead) return false;
    if (state.read === 'read' && !item.isRead) return false;
    return matchesSearch(item);
  }
  function byTimeDesc(a, b) {
    // ไม่มีเวลา (เช่น สลิปถูกปฏิเสธ) ไว้ล่างสุด
    const ta = a.at ? new Date(a.at).getTime() : -Infinity;
    const tb = b.at ? new Date(b.at).getTime() : -Infinity;
    return tb - ta;
  }
  function byDeadline(a, b) {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return da - db;
  }

  // ---------- วาด ----------
  function render() {
    const hadRowFocus = Boolean(document.activeElement && document.activeElement.closest && document.activeElement.closest('.nt-row__body'));
    const real = state.items.filter(isReal);
    const unread = real.filter((i) => !i.isRead);
    els.statUnread.textContent = unread.length;
    els.statAction.textContent = real.filter((i) => i.action).length;
    els.statAll.textContent = real.length;
    document.title = unread.length ? `(${unread.length}) ${baseTitle}` : baseTitle;
    syncBell(unread.length);

    renderCategories(real);
    renderProgress();

    // ต้องทำ: โชว์ทุกงานเสมอ ไม่ขึ้นกับหมวด/ตัวกรองอ่าน (กรองแค่คำค้นหา) — งานยังค้างอยู่แม้จะอ่านแล้ว
    const todo = real.filter((i) => i.action && matchesSearch(i)).sort(byDeadline);
    const visible = state.items.filter(inView);
    const rest = visible.filter((i) => !i.action).sort(byTimeDesc);
    els.markAll.disabled = !visible.some((i) => !i.isRead);

    els.todo.hidden = !todo.length;
    els.todoList.innerHTML = todo.map(todoHtml).join('');
    const filtersOn = state.cat !== 'all' || state.read !== 'all';
    els.list.innerHTML = rest.length ? groupsHtml(rest) : (todo.length && !filtersOn ? '' : emptyHtml());

    document.querySelectorAll('.nt-seg [data-read]').forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.read === state.read));
    });
    if (state.focusKey) {
      applyFocus(state.focusKey, false);
      // innerHTML ใหม่ทำให้โฟกัสหลุด — คืนโฟกัสให้แถวเดิมถ้าเพิ่งใช้คีย์บอร์ดอยู่
      const row = hadRowFocus && els.list.querySelector(`.nt-row[data-key="${CSS.escape(state.focusKey)}"] .nt-row__body`);
      if (row) row.focus({ preventScroll: true });
    }
    state.freshKeys.clear();
    syncUrl();
  }

  function renderCategories(real) {
    els.cats.innerHTML = CATEGORIES.map((cat) => {
      const items = cat.id === 'all' ? real : real.filter((i) => i.category === cat.id);
      if (cat.id !== 'all' && !items.length && state.cat !== cat.id) return '';
      const unread = items.filter((i) => !i.isRead).length;
      const count = unread
        ? `<span class="nt-cat__count nt-cat__count--unread" title="ยังไม่อ่าน">${unread}</span>`
        : `<span class="nt-cat__count">${items.length}</span>`;
      return `<button type="button" class="nt-cat" data-cat="${cat.id}" aria-pressed="${state.cat === cat.id}">
        <i class="bi ${cat.icon}" aria-hidden="true"></i><span>${cat.label}</span>${count}</button>`;
    }).join('');
  }

  function renderProgress() {
    const steps = state.items.filter((i) => i.step).sort((a, b) => a.step - b.step);
    const noBooking = state.items.find((i) => i.type === 'info' && i.upcoming);
    if (!steps.length && !noBooking) {
      els.progress.hidden = true;
      return;
    }
    els.progress.hidden = false;
    const line = document.getElementById('ntProgressLine');
    if (!steps.length) {
      els.steps.innerHTML = `<li class="nt-step"><span class="nt-step__dot"></span><span>ยังไม่มีคำขอจอง<small>${esc(plain(noBooking.desc))}</small></span></li>`;
      line.innerHTML = '<b>ยังไม่มีคำขอจอง</b>';
      return;
    }
    const current = Math.max(...steps.filter((s) => !s.upcoming).map((s) => s.step), 0);
    const currentItem = steps.find((s) => s.step === current);
    line.innerHTML = `<span class="nt-progress__bar" aria-hidden="true">${[1, 2, 3].map((n) => `<i class="${n <= current ? 'on' : ''}"></i>`).join('')}</span>
      <b>${STEP_LABELS[current] || 'ส่งคำขอจองแล้ว'}</b><span>ขั้น ${current}/3${currentItem && currentItem.at ? ` · ${esc(relative(currentItem.at))}` : ''}</span>`;
    els.steps.innerHTML = [1, 2, 3].map((n) => {
      const item = steps.find((s) => s.step === n);
      const done = n < current || (n === current && n === 3);
      const cls = done ? 'nt-step--done' : n === current ? 'nt-step--current' : '';
      const sub = item && !item.upcoming ? relative(item.at) : 'ยังไม่ถึงขั้นนี้';
      return `<li class="nt-step ${cls}"><span class="nt-step__dot">${done ? '<i class="bi bi-check"></i>' : ''}</span>
        <span>${STEP_LABELS[n]}<small>${esc(sub)}</small></span></li>`;
    }).join('');
  }

  function iconHtml(item) {
    const [icon, tone] = TYPE_META[item.type] || ['bi-bell', 'info'];
    return `<span class="nt-ico nt-ico--${tone}" aria-hidden="true"><i class="bi ${icon}"></i></span>`;
  }

  function todoHtml(item) {
    const cd = countdown(item.deadline);
    const link = safeLink(item.link);
    return `<div class="nt-todo-item" data-key="${esc(item.key)}">
      ${iconHtml(item)}
      <div>
        <div class="nt-todo-item__title">${highlight(plain(item.action))}</div>
        <div class="nt-todo-item__sub" title="${esc(plain(item.desc))}">${highlight(plain(item.summary || item.desc))}</div>
      </div>
      <div class="nt-todo-item__right">
        ${cd ? `<span class="nt-countdown ${cd.cls}" data-deadline="${esc(item.deadline)}">${cd.text}</span>` : ''}
        ${link ? `<a class="nt-cta" href="${esc(link)}" data-go="${esc(item.key)}"><i class="bi ${esc(item.linkIcon || 'bi-arrow-right')}"></i>${esc(item.linkLabel || 'ไปที่หน้านี้')}</a>` : ''}
      </div>
    </div>`;
  }

  function groupsHtml(items) {
    const groups = new Map();
    items.forEach((item) => {
      const g = groupOf(item.at);
      if (!groups.has(g.id)) groups.set(g.id, { ...g, items: [] });
      groups.get(g.id).items.push(item);
    });
    return [...groups.values()].sort((a, b) => a.order - b.order).map((g) => `
      <section class="nt-group">
        <div class="nt-group__head"><h2>${g.label}</h2><span>${g.items.length} รายการ</span></div>
        ${g.items.map(rowHtml).join('')}
      </section>`).join('');
  }

  function rowHtml(item) {
    const open = state.openKey === item.key;
    const link = safeLink(item.link);
    const date = item.at ? new Date(item.at) : null;
    // บรรทัดบน = เวลาแบบสัมพัทธ์ บรรทัดล่าง = เวลาจริง (ไม่ซ้ำวันที่ถ้าบรรทัดบนเป็นวันที่อยู่แล้ว)
    const rel = date ? relative(item.at) : '';
    const exact = !date ? '' : (startOfDay(date) === startOfDay(Date.now()) || rel === shortDate(date) || rel === 'เมื่อวาน')
      ? clock(date)
      : `${shortDate(date)} ${clock(date)}`;
    const meta = date ? `<b>${esc(rel)}</b>${esc(exact)}` : '';
    const classes = ['nt-row', item.isRead ? '' : 'is-unread', open ? 'is-open' : '', state.freshKeys.has(item.key) ? 'is-fresh' : ''].join(' ');
    return `<div class="${classes}" data-key="${esc(item.key)}">
      <div class="nt-row__swipe" aria-hidden="true"><span>${item.isRead ? 'ยังไม่อ่าน' : 'อ่านแล้ว'}</span><span>${item.isRead ? 'ยังไม่อ่าน' : 'อ่านแล้ว'}</span></div>
      <div class="nt-row__body" tabindex="0" role="button" aria-expanded="${open}">
        ${iconHtml(item)}
        <div>
          <div class="nt-row__title">${highlight(plain(item.title))}${!item.isRead ? '<span class="visually-hidden"> (ยังไม่อ่าน)</span>' : ''}</div>
          <p class="nt-row__desc">${highlight(plain(item.desc))}</p>
        </div>
        <div class="nt-row__meta">${meta}</div>
        <div class="nt-row__actions">
          ${link ? `<a class="nt-cta" href="${esc(link)}" data-go="${esc(item.key)}"><i class="bi ${esc(item.linkIcon || 'bi-arrow-right')}"></i>${esc(item.linkLabel || 'ไปที่หน้านี้')}</a>` : ''}
          <button type="button" class="nt-linkbtn" data-toggle-read="${esc(item.key)}">
            <i class="bi ${item.isRead ? 'bi-envelope' : 'bi-envelope-open'}"></i>${item.isRead ? 'ทำเป็นยังไม่อ่าน' : 'ทำเป็นอ่านแล้ว'}
          </button>
        </div>
      </div>
    </div>`;
  }

  function emptyHtml() {
    if (state.q.trim()) {
      return `<div class="nt-empty"><i class="bi bi-search"></i><h2>ไม่พบแจ้งเตือนที่ตรงกับ “${esc(state.q.trim())}”</h2>
        <p>ลองคำอื่น หรือล้างคำค้นหา</p><button type="button" class="nt-btn" data-clear-search>ล้างคำค้นหา</button></div>`;
    }
    if (state.read === 'unread') {
      return `<div class="nt-empty"><i class="bi bi-check2-circle"></i><h2>อ่านครบหมดแล้ว</h2>
        <p>ไม่มีแจ้งเตือนที่ยังไม่ได้อ่าน${state.cat !== 'all' ? 'ในหมวดนี้' : ''}</p><button type="button" class="nt-btn" data-show-all>ดูทั้งหมด</button></div>`;
    }
    if (state.read === 'read') {
      return `<div class="nt-empty"><i class="bi bi-envelope-open"></i><h2>ยังไม่มีแจ้งเตือนที่อ่านแล้ว</h2>
        <p>แจ้งเตือนที่กดเปิดดูหรือทำเป็นอ่านแล้วจะย้ายมาอยู่ที่นี่</p><button type="button" class="nt-btn" data-show-all>ดูทั้งหมด</button></div>`;
    }
    return `<div class="nt-empty"><i class="bi bi-bell-slash"></i><h2>ยังไม่มีการแจ้งเตือน</h2>
      <p>เมื่อสถานะการจอง แจ้งซ่อม เอกสาร หรือรีวิวร้านมีความเคลื่อนไหว จะขึ้นที่นี่</p></div>`;
  }

  // เลขบนกระดิ่งใน navbarSeller ให้ตรงกับหน้านี้ทันที
  function syncBell(count) {
    const bell = document.querySelector('.nav-notification');
    if (!bell) return;
    let badge = bell.querySelector('.nav-notification-badge');
    if (!count) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-notification-badge';
      bell.appendChild(badge);
    }
    badge.textContent = String(count);
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.cat !== 'all') p.set('c', state.cat);
    if (state.read !== 'all') p.set('f', state.read);
    if (state.q.trim()) p.set('q', state.q.trim());
    const next = `${location.pathname}${p.toString() ? `?${p}` : ''}`;
    if (next !== `${location.pathname}${location.search}`) history.replaceState(null, '', next);
  }

  // ---------- อ่านแล้ว / ยังไม่อ่าน ----------
  function findItem(key) {
    return state.items.find((i) => i.key === key);
  }

  function persist(keys, read) {
    if (!keys.length) return Promise.resolve(true);
    return fetch(read ? '/notifications/read' : '/notifications/unread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ keys }),
      keepalive: true,
      credentials: 'same-origin'
    }).then((res) => res.ok).catch(() => false);
  }

  function setRead(keys, read, { silent } = {}) {
    const changed = keys.map(findItem).filter((i) => i && i.isRead !== read);
    if (!changed.length) return Promise.resolve([]);
    changed.forEach((i) => { i.isRead = read; i.isNew = !read; });
    render();
    return persist(changed.map((i) => i.key), read).then((ok) => {
      if (ok) return changed.map((i) => i.key);
      changed.forEach((i) => { i.isRead = !read; i.isNew = read; });
      render();
      if (!silent) showToast('บันทึกไม่สำเร็จ กรุณาลองใหม่');
      return [];
    });
  }

  function toggleRead(key) {
    const item = findItem(key);
    if (!item) return;
    const read = !item.isRead;
    setRead([key], read).then((done) => {
      if (done.length) showToast(read ? 'ทำเป็นอ่านแล้ว' : 'ทำเป็นยังไม่อ่าน', () => setRead(done, !read));
    });
  }

  function markAllVisible() {
    const keys = state.items.filter(inView).filter((i) => !i.isRead).map((i) => i.key);
    if (!keys.length) return;
    setRead(keys, true).then((done) => {
      if (done.length) showToast(`ทำเป็นอ่านแล้ว ${done.length} รายการ`, () => setRead(done, false));
    });
  }

  // ---------- toast + เลิกทำ ----------
  let toastTimer = null;
  function showToast(text, undo) {
    els.toastText.textContent = text;
    els.toastUndo.hidden = !undo;
    els.toastUndo.onclick = undo ? () => { hideToast(); undo(); } : null;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 6000 : 3000);
  }
  function hideToast() {
    els.toast.hidden = true;
  }

  // ---------- เปิด/ปิดแถว + โฟกัส ----------
  function toggleOpen(key) {
    state.openKey = state.openKey === key ? null : key;
    state.focusKey = key;
    const item = findItem(key);
    if (state.openKey && item && !item.isRead) {
      setRead([key], true, { silent: true });
    } else {
      render();
    }
  }

  function rowBodies() {
    return [...els.list.querySelectorAll('.nt-row__body')];
  }
  function applyFocus(key, scroll) {
    document.querySelectorAll('.nt-row.is-focus').forEach((r) => r.classList.remove('is-focus'));
    const row = els.list.querySelector(`.nt-row[data-key="${CSS.escape(key)}"]`);
    if (!row) return;
    row.classList.add('is-focus');
    if (scroll) {
      row.querySelector('.nt-row__body').focus({ preventScroll: true });
      row.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }
  function moveFocus(step) {
    const bodies = rowBodies();
    if (!bodies.length) return;
    const keys = bodies.map((b) => b.parentElement.dataset.key);
    const index = keys.indexOf(state.focusKey);
    const next = index < 0 ? (step > 0 ? 0 : keys.length - 1) : Math.min(keys.length - 1, Math.max(0, index + step));
    state.focusKey = keys[next];
    applyFocus(state.focusKey, true);
  }

  // ---------- ปัดบนมือถือ ----------
  let drag = null;
  let suppressClick = false;
  els.list.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const body = event.target.closest('.nt-row__body');
    if (!body || event.target.closest('a, button')) return;
    drag = { body, row: body.parentElement, x: event.clientX, y: event.clientY, dx: 0, active: false };
  });
  els.list.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 10) return;
      drag.active = true;
      drag.row.classList.add('is-dragging');
      drag.body.setPointerCapture?.(event.pointerId);
    }
    drag.dx = Math.max(-140, Math.min(140, dx));
    drag.body.style.transform = `translateX(${drag.dx}px)`;
  });
  function endDrag() {
    if (!drag) return;
    const { body, row, dx, active } = drag;
    drag = null;
    if (!active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 50);
    row.classList.remove('is-dragging');
    body.style.transform = '';
    if (Math.abs(dx) >= SWIPE_TRIGGER) {
      navigator.vibrate?.(10);
      toggleRead(row.dataset.key);
    }
  }
  els.list.addEventListener('pointerup', endDrag);
  els.list.addEventListener('pointercancel', endDrag);

  // ---------- เหตุการณ์ ----------
  els.cats.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cat]');
    if (!btn) return;
    state.cat = btn.dataset.cat;
    state.openKey = null;
    render();
  });

  document.querySelector('.nt-seg').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-read]');
    if (!btn) return;
    state.read = btn.dataset.read;
    render();
  });

  let searchTimer = null;
  els.search.value = state.q;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = els.search.value;
      render();
    }, 120);
  });

  els.markAll.addEventListener('click', markAllVisible);

  document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]');
    if (go) {
      // กดไปหน้าที่เกี่ยวข้อง = อ่านแล้ว (keepalive ให้ส่งทันแม้เปลี่ยนหน้า)
      const item = findItem(go.dataset.go);
      if (item && !item.isRead) {
        item.isRead = true;
        persist([item.key], true);
      }
      return;
    }
    const toggle = event.target.closest('[data-toggle-read]');
    if (toggle) {
      toggleRead(toggle.dataset.toggleRead);
      return;
    }
    if (event.target.closest('[data-clear-search]')) {
      state.q = '';
      els.search.value = '';
      render();
      return;
    }
    if (event.target.closest('[data-show-all]')) {
      state.read = 'all';
      render();
      return;
    }
    const body = event.target.closest('.nt-row__body');
    if (body && !suppressClick) toggleOpen(body.parentElement.dataset.key);
  });

  // คีย์ลัด
  document.addEventListener('keydown', (event) => {
    const typing = Boolean(event.target.matches && event.target.matches('input, textarea, select'));
    if (typing) {
      if (event.key === 'Escape') event.target.blur();
      return;
    }
    if (els.keys.open || event.ctrlKey || event.metaKey || event.altKey) return;

    const focusedBody = event.target.closest?.('.nt-row__body');
    if ((event.key === 'Enter' || event.key === ' ') && focusedBody) {
      event.preventDefault();
      toggleOpen(focusedBody.parentElement.dataset.key);
      return;
    }
    switch (event.key) {
      case 'j': case 'ArrowDown':
        if (event.key === 'ArrowDown' && !focusedBody) return;
        event.preventDefault(); moveFocus(1); break;
      case 'k': case 'ArrowUp':
        if (event.key === 'ArrowUp' && !focusedBody) return;
        event.preventDefault(); moveFocus(-1); break;
      case 'e':
        if (state.focusKey) toggleRead(state.focusKey);
        break;
      case 'o': {
        const item = state.focusKey && findItem(state.focusKey);
        const link = item && safeLink(item.link);
        if (link) {
          if (!item.isRead) persist([item.key], true);
          location.href = link;
        }
        break;
      }
      case 'u':
        state.read = state.read === 'unread' ? 'all' : 'unread';
        render();
        break;
      case '/':
        event.preventDefault();
        els.search.focus();
        break;
      case 'A':
        if (event.shiftKey) markAllVisible();
        break;
      case '?':
        openKeys();
        break;
      default:
    }
  });

  function openKeys() {
    if (typeof els.keys.showModal === 'function') els.keys.showModal();
  }
  els.keysBtn.addEventListener('click', openKeys);
  els.keys.addEventListener('click', (event) => {
    if (event.target === els.keys || event.target.closest('[data-close]')) els.keys.close();
  });

  // ---------- ดึงแจ้งเตือนใหม่ทุก 60 วินาที ----------
  function poll() {
    if (document.hidden) return;
    fetch('/notifications/feed', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.notifications)) return;
        const known = new Set(state.items.map((i) => i.key));
        const fresh = data.notifications.filter((i) => !i.upcoming && !i.isRead && !known.has(i.key));
        if (!fresh.length) return;
        state.pending = data.notifications;
        els.freshText.textContent = `มีแจ้งเตือนใหม่ ${fresh.length} รายการ — แตะเพื่อแสดง`;
        els.fresh.hidden = false;
        document.title = `(${fresh.length} ใหม่) ${baseTitle}`;
      })
      .catch(() => {});
  }
  els.fresh.addEventListener('click', () => {
    if (!state.pending) return;
    const known = new Set(state.items.map((i) => i.key));
    state.items = state.pending;
    state.pending = null;
    state.freshKeys = new Set(state.items.filter((i) => !known.has(i.key)).map((i) => i.key));
    els.fresh.hidden = true;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // นับถอยหลัง + เวลา "x นาทีที่แล้ว" ให้เดินเองโดยไม่ต้องวาดทั้งหน้า
  setInterval(() => {
    document.querySelectorAll('[data-deadline]').forEach((el) => {
      const cd = countdown(el.dataset.deadline);
      if (!cd) return;
      el.textContent = cd.text;
      el.className = `nt-countdown ${cd.cls}`;
    });
  }, 30 * 1000);

  render();

  // บอกว่าปัดแถวได้ — ครั้งแรกครั้งเดียวบนจอสัมผัส (จำไว้ใน localStorage)
  try {
    if (matchMedia('(pointer: coarse)').matches && els.list.querySelector('.nt-row') && !localStorage.getItem('ntSwipeHint')) {
      localStorage.setItem('ntSwipeHint', '1');
      setTimeout(() => showToast('ปัดรายการไปทางซ้ายหรือขวา เพื่อสลับอ่านแล้ว/ยังไม่อ่าน'), 800);
    }
  } catch (error) {
    // localStorage ใช้ไม่ได้ (โหมดส่วนตัว) — ข้ามไป
  }
})();
