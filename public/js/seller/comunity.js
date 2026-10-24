'use strict';

/* ============================================================
   comunity.js — ฟีดคอมมูนิตี้ผู้ขาย (/community)
   โพสต์ทั้งหมดอยู่ใน state.posts (ตั้งต้นจาก <script id="communityData"> ที่ EJS ฝังมา)
   แล้ววาดการ์ดด้วย renderPostCard() ที่เดียว — ทุกการกระทำ (ถูกใจ/คอมเมนต์/แก้ไข/ลบ)
   อัปเดต state แล้ววาดการ์ดใบนั้นหรือฟีดใหม่ ไม่ต้องไล่แก้ DOM ทีละจุด
   ============================================================ */

const initialData = (() => {
  try {
    return JSON.parse(document.getElementById('communityData')?.textContent || '{}');
  } catch (error) {
    return {};
  }
})();

const PAGE_SIZE = 8;
const NEW_POST_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const DRAFT_STORAGE_KEY = 'kangsadan:communityDraft';
const SAVED_STORAGE_KEY = 'kangsadan:communitySaved';

const state = {
  canCreatePost: String(document.body?.dataset?.canCreatePost || '0') === '1',
  posts: Array.isArray(initialData.posts) ? initialData.posts : [],
  categories: initialData.categories || [],
  categoryIcons: initialData.categoryIcons || {},
  defaultCategoryIcon: initialData.defaultCategoryIcon || 'bi-grid',
  categoryColors: initialData.categoryColors || {},
  defaultCategoryColor: initialData.defaultCategoryColor || 'teal',
  currentUserAvatar: initialData.currentUserAvatar || '/img/favicon.png',
  channel: 'all',
  searchQuery: '',
  sortMode: 'latest',
  limit: PAGE_SIZE,
  saved: loadSavedIds(),
  files: { create: [], edit: [] },
  removeImageIds: new Set(),
  activePostIdForComments: null,
  modalComments: [],
  lightbox: { images: [], index: 0, returnFocus: null },
  pendingImageTap: null
};

/* ---------- ตัวช่วยทั่วไป ---------- */

// ข้อความจากผู้ใช้ทุกชิ้นที่ต่อเป็น HTML ต้องผ่านตัวนี้ (ชื่อร้าน/เนื้อหา/คอมเมนต์/URL รูป)
// ไม่แปลง ' เป็น &#39; เพราะ "#" ใน entity จะชนกับตัวจับ #แท็ก — attribute ทุกตัวในไฟล์นี้ครอบด้วย "
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// escape ก่อนแล้วค่อยแปลง URL เป็นลิงก์ และ #แท็ก เป็นปุ่มค้นหา
// ตัวจับแท็กต้องตรงกับ HASHTAG_PATTERN ใน communityController.js (แท็กยอดฮิต)
function linkifyText(text) {
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)|(#[^\s#<>.,!?()"'“”]+)/g, (match, url, tag) => {
    if (url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow" class="cm-link">${url}</a>`;
    }
    return `<button type="button" class="cm-hashtag js-search" data-query="${tag}">${tag}</button>`;
  });
}

function formatRelativeTime(iso, fallback) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return fallback || '';

  const diffMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffMinutes < 1) return 'เมื่อสักครู่';
  if (diffMinutes < 60) return `${diffMinutes} นาทีที่แล้ว`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ชม. ที่แล้ว`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return fallback || new Date(time).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('th-TH');
}

function categoryIcon(category) {
  return state.categoryIcons[category] || state.defaultCategoryIcon;
}

function categoryColor(category) {
  return state.categoryColors[category] || state.defaultCategoryColor;
}

function findPost(postId) {
  return state.posts.find((post) => Number(post.id) === Number(postId)) || null;
}

function showToast(message) {
  const toastEl = document.getElementById('shareToast');
  const msgEl = document.getElementById('toastMessage');
  if (!toastEl || !msgEl || typeof bootstrap === 'undefined') return;

  msgEl.textContent = message;
  bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2600, autohide: true }).show();
}

// fetch ที่คืน { ok, result } เสมอ — เน็ตหลุด/เซิร์ฟเวอร์ตอบไม่ใช่ JSON ก็ไม่ throw
async function api(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json')
      ? await response.json()
      : { success: false, message: response.status === 401 ? 'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่' : 'เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ' };
    return { ok: response.ok && result.success !== false, result };
  } catch (error) {
    return { ok: false, result: { success: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง' } };
  }
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // โหมดส่วนตัว/ปิด storage — ฟีเจอร์ที่พึ่ง storage (ร่าง/บันทึก) แค่ไม่จำข้ามการเปิดหน้า
  }
}

// "บันทึกโพสต์" เก็บในเครื่องนี้เท่านั้น (ยังไม่มีตารางใน DB)
function loadSavedIds() {
  const ids = readStorage(SAVED_STORAGE_KEY, []);
  return new Set(Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : []);
}

function persistSavedIds() {
  writeStorage(SAVED_STORAGE_KEY, Array.from(state.saved));
}

/* ============================================================
   วาดการ์ดโพสต์
   ============================================================ */

function renderGallery(post) {
  const images = Array.isArray(post.images) ? post.images : [];
  if (!images.length) return '';

  const visible = images.slice(0, 4);
  const items = visible.map((image, index) => {
    const extra = index === 3 && images.length > 4 ? images.length - 4 : 0;
    return `
      <button type="button" class="cm-gallery__item js-gallery" data-post-id="${post.id}" data-image-index="${index}" aria-label="ดูรูปที่ ${index + 1} จาก ${images.length}">
        <img src="${escapeHtml(image.imageUrl)}" alt="" loading="lazy">
        ${extra ? `<span class="cm-gallery__more">+${extra}</span>` : ''}
      </button>`;
  }).join('');

  return `<div class="cm-gallery cm-gallery--${visible.length}">${items}</div>`;
}

function renderPostMenu(post) {
  const isSaved = state.saved.has(Number(post.id));
  const ownerItems = post.isOwner ? `
      <li><hr class="dropdown-divider"></li>
      <li><button class="dropdown-item js-edit-post" type="button" data-post-id="${post.id}"><i class="bi bi-pencil"></i>แก้ไขโพสต์</button></li>
      <li><button class="dropdown-item cm-danger js-delete-post" type="button" data-post-id="${post.id}"><i class="bi bi-trash3"></i>ลบโพสต์</button></li>`
    : post.canModerate ? `
      <li><hr class="dropdown-divider"></li>
      <li><button class="dropdown-item cm-danger js-delete-post" type="button" data-post-id="${post.id}"><i class="bi bi-shield-exclamation"></i>ลบโพสต์ (ผู้ดูแล)</button></li>`
    : '';

  return `
    <div class="dropdown cm-post__menu">
      <button class="cm-iconbtn" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="ตัวเลือกโพสต์"><i class="bi bi-three-dots"></i></button>
      <ul class="dropdown-menu dropdown-menu-end cm-dropdown">
        <li><button class="dropdown-item js-save-post" type="button" data-post-id="${post.id}"><i class="bi ${isSaved ? 'bi-bookmark-x' : 'bi-bookmark'}"></i>${isSaved ? 'เลิกบันทึก' : 'บันทึกโพสต์'}</button></li>
        <li><button class="dropdown-item js-copy-link" type="button" data-post-id="${post.id}"><i class="bi bi-link-45deg"></i>คัดลอกลิงก์</button></li>
        <li><button class="dropdown-item js-copy-text" type="button" data-post-id="${post.id}"><i class="bi bi-clipboard"></i>คัดลอกข้อความ</button></li>
        ${ownerItems}
      </ul>
    </div>`;
}

function renderStallLinks(post) {
  const codes = Array.isArray(post.stallCodes) ? post.stallCodes : [];
  if (!codes.length) return '';
  return codes.map((code) => `
    <a href="/market-map?stall=${encodeURIComponent(code)}" class="cm-stall" title="ดูแผง ${escapeHtml(code)} บนผังตลาด"><i class="bi bi-geo-alt"></i>${escapeHtml(code)}</a>`).join('');
}

function renderCommentPreview(post) {
  const preview = Array.isArray(post.previewComments) ? post.previewComments : [];
  const hiddenCount = Math.max(0, Number(post.comments || 0) - preview.length);

  const items = preview.map((comment) => `
    <li class="cm-cprev">
      <img src="${escapeHtml(comment.profileImage)}" alt="" class="cm-avatar cm-avatar--xs" loading="lazy">
      <p class="cm-cprev__bubble"><strong>${escapeHtml(comment.authorName)}</strong> ${linkifyText(comment.content)}</p>
    </li>`).join('');

  return `
    <div class="cm-post__comments">
      ${hiddenCount ? `<button type="button" class="cm-linkbtn js-open-comments" data-post-id="${post.id}">ดูคอมเมนต์ทั้งหมด ${formatNumber(post.comments)} รายการ</button>` : ''}
      ${items ? `<ul class="cm-cprev-list" role="list">${items}</ul>` : ''}
      <form class="cm-inline-reply js-inline-comment" data-post-id="${post.id}">
        <img src="${escapeHtml(state.currentUserAvatar)}" alt="" class="cm-avatar cm-avatar--xs">
        <input type="text" class="cm-inline-reply__input" name="content" maxlength="1000" placeholder="เขียนคอมเมนต์..." aria-label="เขียนคอมเมนต์ถึงโพสต์นี้" autocomplete="off">
        <button type="submit" class="cm-inline-reply__send" aria-label="ส่งคอมเมนต์"><i class="bi bi-send"></i></button>
      </form>
    </div>`;
}

function renderPostCard(post) {
  const isNew = Date.now() - new Date(post.createdAtIso || 0).getTime() < NEW_POST_WINDOW_MS;
  const isSaved = state.saved.has(Number(post.id));
  const likes = Number(post.likes || 0);
  const comments = Number(post.comments || 0);

  return `
    <article class="cm-post" id="post-${post.id}" data-post-id="${post.id}">
      <header class="cm-post__head">
        <img src="${escapeHtml(post.profileImage)}" alt="" class="cm-avatar" loading="lazy">
        <div class="cm-post__who">
          <p class="cm-post__name">
            <button type="button" class="cm-post__store js-search" data-query="${escapeHtml(post.storeName)}" title="ดูโพสต์ทั้งหมดของร้านนี้">${escapeHtml(post.storeName)}</button>
            ${isNew ? '<span class="cm-badge cm-badge--new">ใหม่</span>' : ''}
            ${post.isOwner ? '<span class="cm-badge">โพสต์ของคุณ</span>' : ''}
          </p>
          <p class="cm-post__meta">
            <span class="cm-catmark cat-${categoryColor(post.category)}"><i class="bi ${categoryIcon(post.category)}"></i>${escapeHtml(post.category)}</span>
            <time datetime="${escapeHtml(post.createdAtIso || '')}" title="${escapeHtml(post.createdAt)}" class="js-reltime">${escapeHtml(formatRelativeTime(post.createdAtIso, post.createdAt))}</time>
            ${renderStallLinks(post)}
          </p>
        </div>
        ${renderPostMenu(post)}
      </header>

      <div class="cm-post__body">
        <p class="cm-post__text is-clamped">${linkifyText(post.content)}</p>
        <button type="button" class="cm-linkbtn cm-readmore" hidden>อ่านต่อ</button>
      </div>

      ${renderGallery(post)}

      ${(likes || comments) ? `
      <div class="cm-post__stats">
        ${likes ? `<span><i class="bi bi-heart-fill"></i>${formatNumber(likes)} คนถูกใจ</span>` : '<span></span>'}
        ${comments ? `<button type="button" class="cm-linkbtn js-open-comments" data-post-id="${post.id}">${formatNumber(comments)} คอมเมนต์</button>` : ''}
      </div>` : ''}

      <div class="cm-post__actions">
        <button type="button" class="cm-action js-like ${post.isLiked ? 'is-on' : ''}" data-post-id="${post.id}" aria-pressed="${post.isLiked ? 'true' : 'false'}">
          <i class="bi ${post.isLiked ? 'bi-heart-fill' : 'bi-heart'}"></i><span>ถูกใจ</span>
        </button>
        <button type="button" class="cm-action js-open-comments" data-post-id="${post.id}">
          <i class="bi bi-chat"></i><span>คอมเมนต์</span>
        </button>
        <button type="button" class="cm-action js-save-post ${isSaved ? 'is-on' : ''}" data-post-id="${post.id}" aria-pressed="${isSaved ? 'true' : 'false'}">
          <i class="bi ${isSaved ? 'bi-bookmark-fill' : 'bi-bookmark'}"></i><span>${isSaved ? 'บันทึกแล้ว' : 'บันทึก'}</span>
        </button>
        <button type="button" class="cm-action js-share" data-post-id="${post.id}">
          <i class="bi bi-share"></i><span>แชร์</span>
        </button>
      </div>

      ${renderCommentPreview(post)}
    </article>`;
}

// วัดหลังวาดว่าข้อความยาวเกินที่พับไว้ไหม ถ้าเกินค่อยโชว์ปุ่มอ่านต่อ
function measureReadMore(scope) {
  requestAnimationFrame(() => {
    scope.querySelectorAll('.cm-post').forEach((card) => {
      const text = card.querySelector('.cm-post__text');
      const button = card.querySelector('.cm-readmore');
      if (!text || !button || text.classList.contains('is-expanded')) return;
      button.hidden = text.scrollHeight <= text.clientHeight + 2;
    });
  });
}

function rerenderPost(postId, { animateLike = false } = {}) {
  const post = findPost(postId);
  const card = document.getElementById(`post-${postId}`);
  if (!post || !card) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderPostCard(post).trim();
  const nextCard = wrapper.firstElementChild;
  card.replaceWith(nextCard);
  measureReadMore(nextCard.parentElement || document);

  if (animateLike) {
    nextCard.querySelector('.js-like')?.classList.add('is-popping');
  }
  return nextCard;
}

/* ============================================================
   กรอง / ค้นหา / เรียง / โหลดเพิ่ม
   ============================================================ */

function matchesChannel(post) {
  switch (state.channel) {
    case 'all': return true;
    case 'saved': return state.saved.has(Number(post.id));
    case 'mine': return Boolean(post.isOwner);
    default: return post.category === state.channel;
  }
}

function matchesSearch(post) {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = `${post.content} ${post.storeName} ${post.category} ${(post.stallCodes || []).join(' ')}`.toLowerCase();
  return query.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

// "มาแรง" = ถูกใจ + คอมเมนต์ (หนักกว่า) หารอายุโพสต์ — โพสต์ใหม่ที่คนเริ่มคุยลอยขึ้นก่อนโพสต์เก่าที่ยอดสะสมเยอะ
function hotScore(post) {
  const engagement = Number(post.likes || 0) + Number(post.comments || 0) * 2;
  const ageHours = Math.max(0, (Date.now() - new Date(post.createdAtIso || 0).getTime()) / 3600000);
  return (engagement + 1) / Math.pow(ageHours + 2, 1.3);
}

function getVisiblePosts() {
  const byTime = (a, b) => new Date(b.createdAtIso || 0) - new Date(a.createdAtIso || 0);
  const comparators = {
    latest: byTime,
    popular: (a, b) => hotScore(b) - hotScore(a) || byTime(a, b),
    discussed: (a, b) => Number(b.comments || 0) - Number(a.comments || 0) || Number(b.likes || 0) - Number(a.likes || 0) || byTime(a, b)
  };
  return state.posts.filter((post) => matchesChannel(post) && matchesSearch(post)).sort(comparators[state.sortMode] || byTime);
}

const EMPTY_MESSAGES = {
  all: ['bi-chat-square-text', 'ยังไม่มีโพสต์ในคอมมูนิตี้', 'เป็นร้านแรกที่ทักทายเพื่อนในตลาดเลย'],
  saved: ['bi-bookmark', 'ยังไม่ได้บันทึกโพสต์ไหน', 'กด "บันทึก" ใต้โพสต์ที่อยากกลับมาอ่าน (จำไว้ในเครื่องนี้)'],
  mine: ['bi-person', 'คุณยังไม่ได้โพสต์', 'เล่าเมนูเด็ดหรือโปรวันนี้ให้เพื่อนผู้ขายฟัง']
};

function renderEmptyState() {
  if (state.searchQuery.trim()) {
    return `
      <div class="cm-empty">
        <i class="bi bi-search"></i>
        <p class="cm-empty__title">ไม่พบโพสต์ที่ตรงกับ “${escapeHtml(state.searchQuery.trim())}”</p>
        <p class="cm-muted">ลองคำอื่น หรือ <button type="button" class="cm-linkbtn js-clear-search">ล้างคำค้น</button></p>
      </div>`;
  }

  const [icon, title, hint] = EMPTY_MESSAGES[state.channel] || ['bi-inbox', 'ยังไม่มีโพสต์ในช่องนี้', 'เปิดประเด็นแรกของช่องนี้ได้เลย'];
  const canStart = state.canCreatePost && state.channel !== 'saved';
  return `
    <div class="cm-empty">
      <i class="bi ${icon}"></i>
      <p class="cm-empty__title">${title}</p>
      <p class="cm-muted">${hint}</p>
      ${canStart ? `<button type="button" class="cm-btn cm-btn--primary js-open-composer" ${state.categories.includes(state.channel) ? `data-category="${escapeHtml(state.channel)}"` : ''}><i class="bi bi-pencil-square"></i>เขียนโพสต์</button>` : ''}
    </div>`;
}

function renderResultBar(visibleCount) {
  const bar = document.getElementById('feedResultBar');
  if (!bar) return;

  const query = state.searchQuery.trim();
  if (!query || !visibleCount) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  bar.hidden = false;
  bar.innerHTML = `
    <span>พบ <strong>${formatNumber(visibleCount)}</strong> โพสต์สำหรับ “${escapeHtml(query)}”</span>
    <button type="button" class="cm-linkbtn js-clear-search"><i class="bi bi-x-lg"></i>ล้างคำค้น</button>`;
}

function renderFeed() {
  const container = document.getElementById('feedContainer');
  if (!container) return;

  const visible = getVisiblePosts();
  const page = visible.slice(0, state.limit);
  container.innerHTML = page.length ? page.map(renderPostCard).join('') : renderEmptyState();
  measureReadMore(container);
  renderResultBar(visible.length);

  const remaining = visible.length - page.length;
  const loadMore = document.getElementById('loadMoreBtn');
  const end = document.getElementById('feedEnd');
  if (loadMore) {
    loadMore.hidden = remaining <= 0;
    loadMore.innerHTML = `<i class="bi bi-arrow-down"></i>ดูโพสต์เพิ่ม (เหลืออีก ${formatNumber(remaining)})`;
  }
  if (end) end.hidden = remaining > 0 || page.length < PAGE_SIZE;

  updateChannelCounts();
}

function updateChannelCounts() {
  const counts = { all: state.posts.length, saved: 0, mine: 0 };
  state.categories.forEach((category) => { counts[category] = 0; });
  state.posts.forEach((post) => {
    if (post.category in counts) counts[post.category] += 1;
    if (state.saved.has(Number(post.id))) counts.saved += 1;
    if (post.isOwner) counts.mine += 1;
  });

  document.querySelectorAll('[data-count-for]').forEach((el) => {
    el.textContent = formatNumber(counts[el.dataset.countFor] || 0);
  });
}

function setChannel(channel) {
  state.channel = channel;
  state.limit = PAGE_SIZE;
  document.querySelectorAll('.cm-channel').forEach((button) => {
    const active = button.dataset.channel === channel;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    // มือถือเป็นแท็บเลื่อนแนวนอน — เลื่อนแท็บที่เลือกให้อยู่ในจอ
    if (active) button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  renderFeed();
}

function setSearchQuery(value, { scroll = false } = {}) {
  state.searchQuery = String(value || '');
  state.limit = PAGE_SIZE;
  const input = document.getElementById('feedSearchInput');
  const clearBtn = document.getElementById('feedSearchClear');
  if (input && input.value !== state.searchQuery) input.value = state.searchQuery;
  if (clearBtn) clearBtn.hidden = !state.searchQuery;
  renderFeed();

  if (scroll) scrollToFeedTop();
}

function setSort(mode) {
  state.sortMode = ['latest', 'popular', 'discussed'].includes(mode) ? mode : 'latest';
  state.limit = PAGE_SIZE;
  document.querySelectorAll('.cm-sort__btn').forEach((button) => {
    const active = button.dataset.sort === state.sortMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  renderFeed();
}

function scrollToFeedTop() {
  const toolbar = document.getElementById('filterSection');
  if (!toolbar) return;
  const navHeight = document.querySelector('.management-nav, nav.navbar')?.offsetHeight || 0;
  const top = toolbar.getBoundingClientRect().top + window.scrollY - navHeight - 12;
  if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
}

function loadMore() {
  state.limit += PAGE_SIZE;
  renderFeed();
}

// เปิดลิงก์ /community#post-ID ที่แชร์มา: ล้างตัวกรองให้โพสต์นั้นโผล่ แล้วเลื่อนไปไฮไลต์
function highlightLinkedPost() {
  const match = window.location.hash.match(/^#post-(\d+)$/);
  if (!match) return;

  const postId = Number(match[1]);
  if (!findPost(postId)) {
    showToast('ไม่พบโพสต์นี้ อาจถูกลบไปแล้ว');
    return;
  }

  revealPost(postId);
}

function revealPost(postId) {
  state.channel = 'all';
  state.searchQuery = '';
  document.querySelectorAll('.cm-channel').forEach((button) => {
    const active = button.dataset.channel === 'all';
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const input = document.getElementById('feedSearchInput');
  if (input) input.value = '';
  document.getElementById('feedSearchClear')?.setAttribute('hidden', '');

  const index = getVisiblePosts().findIndex((post) => Number(post.id) === Number(postId));
  state.limit = Math.max(state.limit, index + 1);
  renderFeed();

  const card = document.getElementById(`post-${postId}`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-highlighted');
  setTimeout(() => card.classList.remove('is-highlighted'), 2600);
}

/* ============================================================
   ถูกใจ / บันทึก / แชร์ / คัดลอก
   ============================================================ */

async function toggleLike(postId, { onlyLike = false } = {}) {
  const post = findPost(postId);
  if (!post || (onlyLike && post.isLiked)) return;

  // อัปเดตทันทีให้รู้สึกเร็ว ถ้าเซิร์ฟเวอร์ปฏิเสธค่อยย้อนกลับ
  const previous = { isLiked: post.isLiked, likes: post.likes };
  post.isLiked = !post.isLiked;
  post.likes = Math.max(0, Number(post.likes || 0) + (post.isLiked ? 1 : -1));
  rerenderPost(postId, { animateLike: post.isLiked });

  const { ok, result } = await api(`/community/posts/${postId}/like`, { method: 'POST' });
  if (!ok) {
    Object.assign(post, previous);
    rerenderPost(postId);
    showToast(result.message || 'บันทึกการกดถูกใจไม่สำเร็จ');
    return;
  }

  post.isLiked = Boolean(result.isLiked);
  post.likes = Number(result.likes || 0);
  rerenderPost(postId);
}

function toggleSave(postId) {
  const id = Number(postId);
  const nowSaved = !state.saved.has(id);
  if (nowSaved) state.saved.add(id);
  else state.saved.delete(id);
  persistSavedIds();

  if (state.channel === 'saved') renderFeed();
  else {
    rerenderPost(id);
    updateChannelCounts();
  }
  showToast(nowSaved ? 'บันทึกโพสต์แล้ว ดูได้ที่ช่อง "ที่บันทึกไว้"' : 'เลิกบันทึกโพสต์แล้ว');
}

function postUrl(postId) {
  return `${window.location.origin}/community#post-${postId}`;
}

async function copyToClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (error) {
    showToast('คัดลอกอัตโนมัติไม่ได้ในเบราว์เซอร์นี้');
  }
}

async function sharePost(postId) {
  const post = findPost(postId);
  const url = postUrl(postId);

  // มือถือ: เปิดเมนูแชร์ของเครื่อง (LINE/Messenger ฯลฯ) ถ้าผู้ใช้กดยกเลิกก็จบ
  if (navigator.share) {
    try {
      await navigator.share({ title: `โพสต์จาก ${post?.storeName || 'ร้านค้า'} - คอมมูนิตี้กังสดาลไนท์`, url });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  await copyToClipboard(url, 'คัดลอกลิงก์โพสต์แล้ว');
}

/* ============================================================
   คอมเมนต์
   ============================================================ */

// หลังเพิ่ม/ลบคอมเมนต์ ให้ตัวอย่างใต้โพสต์เป็น 2 อันล่าสุดจากรายการเต็มที่มีอยู่
function syncPreviewFromModal(postId, commentCount) {
  const post = findPost(postId);
  if (!post) return;
  post.comments = Number(commentCount ?? state.modalComments.length);
  post.previewComments = state.modalComments.slice(-2);
  rerenderPost(postId);
}

function renderCommentsModalList() {
  const container = document.getElementById('commentsList');
  if (!container) return;

  if (!state.modalComments.length) {
    container.innerHTML = '<div class="cm-thread__empty"><i class="bi bi-chat"></i>ยังไม่มีคอมเมนต์ เริ่มคุยเป็นคนแรกได้เลย</div>';
    return;
  }

  container.innerHTML = `<ul class="cm-thread__list" role="list">${state.modalComments.map((comment) => `
    <li class="cm-comment" data-comment-id="${comment.id}">
      <img class="cm-avatar cm-avatar--sm" src="${escapeHtml(comment.profileImage)}" alt="">
      <div class="cm-comment__main">
        <div class="cm-comment__bubble">
          <p class="cm-comment__author">${escapeHtml(comment.authorName)}</p>
          <p class="cm-comment__text">${linkifyText(comment.content)}</p>
        </div>
        <div class="cm-comment__meta">
          <time datetime="${escapeHtml(comment.createdAtIso || '')}" title="${escapeHtml(comment.createdAt)}">${escapeHtml(formatRelativeTime(comment.createdAtIso, comment.createdAt))}</time>
          <button type="button" class="cm-linkbtn js-reply" data-author="${escapeHtml(comment.authorName)}">ตอบกลับ</button>
          ${comment.canDelete ? `<button type="button" class="cm-linkbtn cm-danger js-delete-comment" data-comment-id="${comment.id}">ลบ</button>` : ''}
        </div>
      </div>
    </li>`).join('')}</ul>`;
}

function renderCommentsPostSummary(post) {
  const summary = document.getElementById('commentsPostSummary');
  if (!summary) return;
  summary.innerHTML = post ? `
    <img src="${escapeHtml(post.profileImage)}" alt="" class="cm-avatar cm-avatar--sm">
    <div>
      <p class="cm-thread-post__name">${escapeHtml(post.storeName)} <span class="cm-muted">· ${escapeHtml(post.category)}</span></p>
      <p class="cm-thread-post__text">${escapeHtml(post.content)}</p>
    </div>` : '';
}

async function openComments(postId) {
  const { ok, result } = await api(`/community/posts/${postId}/comments`);
  if (!ok) {
    showToast(result.message || 'โหลดคอมเมนต์ไม่สำเร็จ');
    return;
  }

  state.activePostIdForComments = Number(postId);
  state.modalComments = result.comments || [];
  document.getElementById('commentPostId').value = String(postId);
  renderCommentsPostSummary(findPost(postId));
  renderCommentsModalList();
  resetCommentComposer();

  const modalEl = document.getElementById('commentsModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modalEl.addEventListener('shown.bs.modal', () => {
    const list = document.getElementById('commentsList');
    list?.lastElementChild?.lastElementChild?.scrollIntoView({ block: 'end' });
    document.getElementById('commentContent')?.focus();
  }, { once: true });
  modal.show();
}

function updateCommentSendState() {
  const input = document.getElementById('commentContent');
  const send = document.querySelector('.cm-reply__send');
  if (input && send) send.disabled = !input.value.trim();
}

function resetCommentComposer() {
  const input = document.getElementById('commentContent');
  if (!input) return;
  input.value = '';
  autoGrow(input);
  updateCommentSendState();
}

async function postComment(postId, content) {
  return api(`/community/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}

async function handleModalCommentSubmit(event) {
  event.preventDefault();
  const postId = Number.parseInt(document.getElementById('commentPostId').value, 10);
  const input = document.getElementById('commentContent');
  const content = String(input.value || '').trim();
  if (!Number.isInteger(postId) || !content) return;

  const send = document.querySelector('.cm-reply__send');
  send.disabled = true;
  const { ok, result } = await postComment(postId, content);
  if (!ok) {
    updateCommentSendState();
    showToast(result.message || 'เพิ่มคอมเมนต์ไม่สำเร็จ');
    return;
  }

  state.modalComments.push(result.comment);
  renderCommentsModalList();
  resetCommentComposer();
  syncPreviewFromModal(postId, result.commentCount);
  document.getElementById('commentsList')?.querySelector('.cm-comment:last-child')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

async function handleInlineCommentSubmit(form) {
  const postId = Number.parseInt(form.dataset.postId, 10);
  const input = form.querySelector('input[name="content"]');
  const content = String(input?.value || '').trim();
  if (!Number.isInteger(postId) || !content) return;

  input.disabled = true;
  const { ok, result } = await postComment(postId, content);
  input.disabled = false;
  if (!ok) {
    showToast(result.message || 'เพิ่มคอมเมนต์ไม่สำเร็จ');
    input.focus();
    return;
  }

  const post = findPost(postId);
  if (post) {
    post.comments = Number(result.commentCount || Number(post.comments || 0) + 1);
    post.previewComments = [...(post.previewComments || []), result.comment].slice(-2);
  }
  const card = rerenderPost(postId);
  card?.querySelector('.cm-inline-reply__input')?.focus();
}

function handleDeleteComment(commentId) {
  window.showConfirmDialog({
    title: 'ลบคอมเมนต์',
    message: 'ยืนยันการลบคอมเมนต์นี้ใช่หรือไม่? ลบแล้วกู้คืนไม่ได้',
    tone: 'danger',
    confirmText: 'ลบคอมเมนต์',
    onConfirm: async () => {
      const { ok, result } = await api(`/community/comments/${commentId}`, { method: 'DELETE' });
      if (!ok) {
        showToast(result.message || 'ลบคอมเมนต์ไม่สำเร็จ');
        return;
      }

      state.modalComments = state.modalComments.filter((comment) => Number(comment.id) !== Number(commentId));
      renderCommentsModalList();
      if (Number.isInteger(result.postId)) syncPreviewFromModal(result.postId, result.commentCount);
      showToast('ลบคอมเมนต์แล้ว');
    }
  });
}

function insertReplyMention(authorName) {
  const input = document.getElementById('commentContent');
  if (!input) return;
  const mention = `@${authorName} `;
  if (!input.value.startsWith(mention)) input.value = mention + input.value.replace(/^@\S+\s/, '');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  autoGrow(input);
  updateCommentSendState();
}

/* ============================================================
   เขียน / แก้ไขโพสต์
   ============================================================ */

function autoGrow(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateCharCounter(textarea) {
  if (!textarea) return;
  const counter = document.querySelector(`.cm-counter[data-for="${textarea.id}"]`);
  if (!counter) return;
  const max = Number.parseInt(textarea.getAttribute('maxlength'), 10) || 5000;
  counter.textContent = `${formatNumber(textarea.value.length)}/${formatNumber(max)}`;
  counter.classList.toggle('is-near-limit', textarea.value.length > max * 0.9);
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.setRangeText(text, start, end, 'end');
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

const FORM_IDS = {
  create: { form: 'createPostForm', modal: 'createPostModal', grid: 'createCategoryGrid', select: 'createCategorySelect', content: 'createContentInput', input: 'createPostImages', preview: 'createImagePreview', drop: 'createDropzone' },
  edit: { form: 'editPostForm', modal: 'editPostModal', grid: 'editCategoryGrid', select: 'editPostCategory', content: 'editPostContent', input: 'editPostImages', preview: 'editNewImagePreview', drop: 'editDropzone' }
};

function el(mode, key) {
  return document.getElementById(FORM_IDS[mode][key]);
}

function setCategory(mode, category) {
  const select = el(mode, 'select');
  if (select) select.value = category || '';
  el(mode, 'grid')?.querySelectorAll('.cm-cat').forEach((card) => {
    const active = card.dataset.category === category;
    card.classList.toggle('is-active', active);
    card.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function setFormError(mode, message) {
  const error = el(mode, 'form')?.querySelector('.cm-form-error');
  if (!error) return;
  error.textContent = message || '';
  error.hidden = !message;
}

function existingImageCount() {
  const post = findPost(document.getElementById('editPostId')?.value);
  return (post?.images || []).filter((image) => !state.removeImageIds.has(Number(image.id))).length;
}

// เพิ่มไฟล์เข้าคิว (เลือกหลายรอบได้ ไม่ทับของเดิม) แล้วซิงก์กลับเข้า input[type=file] ที่ฟอร์มส่งจริง
function addFiles(mode, fileList) {
  const incoming = Array.from(fileList || []);
  const rejected = [];
  const limit = MAX_IMAGES - (mode === 'edit' ? existingImageCount() : 0);

  incoming.forEach((file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) rejected.push(`${file.name}: ไม่ใช่ไฟล์รูป JPG/PNG/GIF/WEBP`);
    else if (file.size > MAX_IMAGE_BYTES) rejected.push(`${file.name}: ใหญ่เกิน 5MB`);
    else if (state.files[mode].length >= limit) rejected.push(`${file.name}: เกิน ${MAX_IMAGES} รูปต่อโพสต์`);
    else state.files[mode].push(file);
  });

  syncFileInput(mode);
  renderNewThumbs(mode);
  setFormError(mode, rejected.length ? `ข้ามไฟล์ ${rejected.length} ไฟล์ — ${rejected[0]}` : '');
}

function syncFileInput(mode) {
  const input = el(mode, 'input');
  if (!input) return;
  const transfer = new DataTransfer();
  state.files[mode].forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
}

function renderNewThumbs(mode) {
  const container = el(mode, 'preview');
  if (!container) return;
  container.querySelectorAll('img').forEach((img) => URL.revokeObjectURL(img.src));
  container.innerHTML = state.files[mode].map((file, index) => `
    <div class="cm-thumb">
      <img src="${URL.createObjectURL(file)}" alt="${escapeHtml(file.name)}">
      <button type="button" class="cm-thumb__x js-remove-file" data-mode="${mode}" data-index="${index}" aria-label="เอารูปนี้ออก"><i class="bi bi-x-lg"></i></button>
    </div>`).join('');
}

function renderExistingThumbs(post) {
  const container = document.getElementById('editExistingImages');
  if (!container) return;
  container.innerHTML = (post.images || []).map((image) => {
    const removed = state.removeImageIds.has(Number(image.id));
    return `
      <div class="cm-thumb ${removed ? 'is-removed' : ''}">
        <img src="${escapeHtml(image.imageUrl)}" alt="">
        <button type="button" class="cm-thumb__x js-toggle-existing" data-image-id="${image.id}" aria-label="${removed ? 'เก็บรูปนี้ไว้' : 'ลบรูปนี้'}">
          <i class="bi ${removed ? 'bi-arrow-counterclockwise' : 'bi-x-lg'}"></i>
        </button>
        ${removed ? '<span class="cm-thumb__note">จะถูกลบ</span>' : ''}
      </div>`;
  }).join('');
}

function resetForm(mode) {
  el(mode, 'form')?.reset();
  state.files[mode] = [];
  syncFileInput(mode);
  renderNewThumbs(mode);
  setCategory(mode, '');
  setFormError(mode, '');
  const content = el(mode, 'content');
  autoGrow(content);
  updateCharCounter(content);
  if (mode === 'create') {
    const note = document.getElementById('createDraftNote');
    if (note) note.hidden = true;
  }
}

function validateForm(mode) {
  if (!el(mode, 'select')?.value) return 'เลือกช่องที่จะโพสต์ก่อน';
  if (!String(el(mode, 'content')?.value || '').trim()) return 'พิมพ์เนื้อหาโพสต์ก่อน';
  return '';
}

function setSubmitting(mode, submitting) {
  const button = el(mode, 'form')?.querySelector('.cm-submit');
  if (!button) return;
  if (submitting) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> กำลังบันทึก...';
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label || button.textContent;
  }
}

/* ---- ร่างโพสต์ (เก็บในเครื่อง) ---- */

function saveDraft() {
  const content = el('create', 'content')?.value || '';
  writeStorage(DRAFT_STORAGE_KEY, content.trim() ? { content, category: el('create', 'select')?.value || '' } : null);
}

function restoreDraft(preferredCategory) {
  const draft = readStorage(DRAFT_STORAGE_KEY, null);
  const content = el('create', 'content');
  if (preferredCategory) setCategory('create', preferredCategory);
  if (!draft || !draft.content || !content || content.value.trim()) return;

  content.value = draft.content;
  if (!preferredCategory && state.categories.includes(draft.category)) setCategory('create', draft.category);
  updateCharCounter(content);
  const note = document.getElementById('createDraftNote');
  if (note) note.hidden = false;
}

function openComposer(trigger) {
  if (!state.canCreatePost) return;
  const modalEl = el('create', 'modal');
  if (!modalEl) return;

  restoreDraft(trigger?.dataset.category && state.categories.includes(trigger.dataset.category) ? trigger.dataset.category : '');
  // ต้องเรียกเลือกไฟล์ใน handler ของการคลิกโดยตรง ไม่งั้นเบราว์เซอร์บล็อก
  if (trigger?.dataset.withImages) el('create', 'input')?.click();
  modalEl.addEventListener('shown.bs.modal', () => {
    const content = el('create', 'content');
    autoGrow(content);
    if (!trigger?.dataset.withImages) content?.focus();
  }, { once: true });
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function handleCreateSubmit(event) {
  event.preventDefault();
  const error = validateForm('create');
  setFormError('create', error);
  if (error) return;

  setSubmitting('create', true);
  const { ok, result } = await api('/community/posts', { method: 'POST', body: new FormData(event.currentTarget) });
  setSubmitting('create', false);
  if (!ok) {
    setFormError('create', result.message || 'สร้างโพสต์ไม่สำเร็จ');
    return;
  }

  writeStorage(DRAFT_STORAGE_KEY, null);
  state.posts.unshift(result.post);
  bootstrap.Modal.getOrCreateInstance(el('create', 'modal')).hide();
  if (state.sortMode !== 'latest') setSort('latest');
  revealPost(result.post.id);
  showToast('โพสต์แล้ว เพื่อน ๆ ในตลาดเห็นโพสต์ของคุณแล้ว');
}

function openEditModal(postId) {
  const post = findPost(postId);
  if (!post) return;

  resetForm('edit');
  state.removeImageIds.clear();
  document.getElementById('editPostId').value = String(post.id);
  setCategory('edit', post.category);
  const content = el('edit', 'content');
  content.value = post.content || '';
  updateCharCounter(content);
  renderExistingThumbs(post);

  const modalEl = el('edit', 'modal');
  modalEl.addEventListener('shown.bs.modal', () => autoGrow(content), { once: true });
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const postId = Number.parseInt(document.getElementById('editPostId').value, 10);
  if (!Number.isInteger(postId)) return;

  const error = validateForm('edit');
  setFormError('edit', error);
  if (error) return;

  const formData = new FormData(event.currentTarget);
  formData.append('removeImageIds', JSON.stringify(Array.from(state.removeImageIds)));

  setSubmitting('edit', true);
  const { ok, result } = await api(`/community/posts/${postId}`, { method: 'PUT', body: formData });
  setSubmitting('edit', false);
  if (!ok) {
    setFormError('edit', result.message || 'แก้ไขโพสต์ไม่สำเร็จ');
    return;
  }

  const index = state.posts.findIndex((post) => Number(post.id) === postId);
  if (index >= 0) state.posts[index] = result.post;
  bootstrap.Modal.getOrCreateInstance(el('edit', 'modal')).hide();
  renderFeed();
  showToast('บันทึกการแก้ไขแล้ว');
}

function handleDeletePost(postId) {
  window.showConfirmDialog({
    title: 'ลบโพสต์',
    message: 'ยืนยันการลบโพสต์นี้ใช่หรือไม่? คอมเมนต์และยอดถูกใจจะหายไปด้วย กู้คืนไม่ได้',
    tone: 'danger',
    confirmText: 'ลบโพสต์',
    onConfirm: async () => {
      const { ok, result } = await api(`/community/posts/${postId}`, { method: 'DELETE' });
      if (!ok) {
        showToast(result.message || 'ลบโพสต์ไม่สำเร็จ');
        return;
      }

      state.posts = state.posts.filter((post) => Number(post.id) !== Number(postId));
      if (state.saved.delete(Number(postId))) persistSavedIds();
      renderFeed();
      showToast('ลบโพสต์แล้ว');
    }
  });
}

/* ============================================================
   ดูรูปเต็มจอ + แตะสองครั้งเพื่อถูกใจ
   ============================================================ */

function openLightbox(postId, index, returnFocus) {
  const images = (findPost(postId)?.images || []).map((image) => image.imageUrl);
  if (!images.length) return;

  state.lightbox = { images, index: Math.min(index, images.length - 1), returnFocus };
  document.getElementById('imageLightbox').hidden = false;
  document.body.classList.add('cm-lock');
  renderLightbox();
  document.getElementById('lightboxClose')?.focus();
}

function renderLightbox() {
  const { images, index } = state.lightbox;
  const img = document.getElementById('lightboxImg');
  const multiple = images.length > 1;
  img.src = images[index];
  img.alt = `รูปที่ ${index + 1} จาก ${images.length}`;
  document.getElementById('lightboxCounter').textContent = multiple ? `${index + 1} / ${images.length}` : '';
  document.getElementById('lightboxPrev').hidden = !multiple;
  document.getElementById('lightboxNext').hidden = !multiple;
}

function stepLightbox(direction) {
  const { images } = state.lightbox;
  if (images.length < 2) return;
  state.lightbox.index = (state.lightbox.index + direction + images.length) % images.length;
  renderLightbox();
}

function closeLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.classList.remove('cm-lock');
  document.getElementById('lightboxImg').removeAttribute('src');
  state.lightbox.returnFocus?.focus?.();
}

// แตะครั้งเดียว = ดูรูปเต็มจอ, แตะสองครั้งติดกัน = ถูกใจ (ไม่ยกเลิกถ้ากดถูกใจไว้แล้ว)
function handleGalleryTap(target) {
  const postId = Number.parseInt(target.dataset.postId, 10);
  const index = Number.parseInt(target.dataset.imageIndex, 10) || 0;
  if (!Number.isInteger(postId)) return;

  const pending = state.pendingImageTap;
  if (pending && pending.postId === postId) {
    clearTimeout(pending.timer);
    state.pendingImageTap = null;
    const heart = document.createElement('i');
    heart.className = 'bi bi-heart-fill cm-heart-burst';
    target.appendChild(heart);
    heart.addEventListener('animationend', () => heart.remove(), { once: true });
    setTimeout(() => toggleLike(postId, { onlyLike: true }), 450);
    return;
  }

  if (pending) clearTimeout(pending.timer);
  state.pendingImageTap = {
    postId,
    timer: setTimeout(() => {
      state.pendingImageTap = null;
      openLightbox(postId, index, target);
    }, 260)
  };
}

/* ============================================================
   ผูก event
   ============================================================ */

function bindFeedClicks() {
  document.addEventListener('click', (event) => {
    const t = event.target;
    const postIdOf = (node) => Number.parseInt(node.dataset.postId, 10);
    let node;

    if ((node = t.closest('.js-gallery'))) return handleGalleryTap(node);
    if ((node = t.closest('.js-open-composer'))) return openComposer(node);
    if ((node = t.closest('.js-search[data-query]'))) return setSearchQuery(node.dataset.query, { scroll: true });
    if (t.closest('.js-clear-search')) return setSearchQuery('');
    if ((node = t.closest('.js-like'))) return toggleLike(postIdOf(node));
    if ((node = t.closest('.js-open-comments'))) return openComments(postIdOf(node));
    if ((node = t.closest('.js-save-post'))) return toggleSave(postIdOf(node));
    if ((node = t.closest('.js-share'))) return sharePost(postIdOf(node));
    if ((node = t.closest('.js-copy-link'))) return copyToClipboard(postUrl(postIdOf(node)), 'คัดลอกลิงก์โพสต์แล้ว');
    if ((node = t.closest('.js-copy-text'))) return copyToClipboard(findPost(postIdOf(node))?.content || '', 'คัดลอกข้อความแล้ว');
    if ((node = t.closest('.js-edit-post'))) return openEditModal(postIdOf(node));
    if ((node = t.closest('.js-delete-post'))) return handleDeletePost(postIdOf(node));
    if ((node = t.closest('.js-delete-comment'))) return handleDeleteComment(Number.parseInt(node.dataset.commentId, 10));
    if ((node = t.closest('.js-reply'))) return insertReplyMention(node.dataset.author);

    if ((node = t.closest('.cm-readmore'))) {
      const text = node.parentElement?.querySelector('.cm-post__text');
      const expanded = text?.classList.toggle('is-expanded');
      node.textContent = expanded ? 'ย่อลง' : 'อ่านต่อ';
      return undefined;
    }

    if ((node = t.closest('.js-remove-file'))) {
      const mode = node.dataset.mode;
      state.files[mode].splice(Number.parseInt(node.dataset.index, 10), 1);
      syncFileInput(mode);
      renderNewThumbs(mode);
      return setFormError(mode, '');
    }

    if ((node = t.closest('.js-toggle-existing'))) {
      const imageId = Number.parseInt(node.dataset.imageId, 10);
      if (state.removeImageIds.has(imageId)) state.removeImageIds.delete(imageId);
      else state.removeImageIds.add(imageId);
      return renderExistingThumbs(findPost(document.getElementById('editPostId').value));
    }

    return undefined;
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('.js-inline-comment');
    if (!form) return;
    event.preventDefault();
    handleInlineCommentSubmit(form);
  });
}

function bindToolbar() {
  document.querySelectorAll('.cm-channel').forEach((button) => {
    button.addEventListener('click', () => setChannel(button.dataset.channel));
  });

  document.querySelectorAll('.cm-sort__btn').forEach((button) => {
    button.addEventListener('click', () => setSort(button.dataset.sort));
  });

  const searchInput = document.getElementById('feedSearchInput');
  let searchTimer = null;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setSearchQuery(searchInput.value), 150);
  });
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSearchQuery('');
  });
  document.getElementById('feedSearchClear')?.addEventListener('click', () => {
    setSearchQuery('');
    searchInput?.focus();
  });

  // กด "/" ที่ไหนก็ได้ (ที่ไม่ใช่ช่องพิมพ์) เพื่อไปช่องค้นหา
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.target.closest('input, textarea, [contenteditable]')) return;
    if (document.querySelector('.modal.show')) return;
    event.preventDefault();
    searchInput?.focus();
  });

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  loadMoreBtn?.addEventListener('click', loadMore);
  // เลื่อนถึงท้ายฟีดแล้วโหลดหน้าถัดไปเอง (ปุ่มยังกดเองได้ถ้าเบราว์เซอร์ไม่รองรับ)
  if ('IntersectionObserver' in window && loadMoreBtn) {
    new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !loadMoreBtn.hidden) loadMore();
    }, { rootMargin: '200px' }).observe(loadMoreBtn);
  }
}

function bindForms() {
  ['create', 'edit'].forEach((mode) => {
    const form = el(mode, 'form');
    if (!form) return;

    form.addEventListener('submit', mode === 'create' ? handleCreateSubmit : handleEditSubmit);

    el(mode, 'grid')?.querySelectorAll('.cm-cat').forEach((card) => {
      card.addEventListener('click', () => {
        setCategory(mode, card.dataset.category);
        setFormError(mode, '');
        if (mode === 'create') saveDraft();
      });
    });

    const content = el(mode, 'content');
    content?.addEventListener('input', () => {
      autoGrow(content);
      updateCharCounter(content);
      if (mode === 'create') saveDraft();
    });
    // Ctrl/Cmd + Enter = ส่งโพสต์
    content?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    const input = el(mode, 'input');
    input?.addEventListener('change', () => {
      // input.files ถูกเบราว์เซอร์แทนด้วยไฟล์ที่เพิ่งเลือก — ดึงออกมาก่อน แล้ว addFiles จะซิงก์คิวทั้งหมดกลับเข้าไป
      const picked = Array.from(input.files || []);
      syncFileInput(mode);
      addFiles(mode, picked);
    });

    const drop = el(mode, 'drop');
    if (drop && input) {
      drop.addEventListener('click', () => input.click());
      drop.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.click();
        }
      });
      ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => {
        event.preventDefault();
        drop.classList.add('is-dragging');
      }));
      ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => {
        event.preventDefault();
        drop.classList.remove('is-dragging');
      }));
      drop.addEventListener('drop', (event) => addFiles(mode, event.dataTransfer?.files));
    }

    // วางรูปจากคลิปบอร์ด (Ctrl+V) ลงในกล่องเขียนได้เลย
    content?.addEventListener('paste', (event) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
      if (files.length) addFiles(mode, files);
    });

    el(mode, 'modal')?.addEventListener('hidden.bs.modal', () => resetForm(mode));
  });

  document.getElementById('discardDraftBtn')?.addEventListener('click', () => {
    writeStorage(DRAFT_STORAGE_KEY, null);
    const content = el('create', 'content');
    content.value = '';
    autoGrow(content);
    updateCharCounter(content);
    document.getElementById('createDraftNote').hidden = true;
    content.focus();
  });

  document.querySelectorAll('.cm-emoji').forEach((row) => {
    row.addEventListener('click', (event) => {
      const button = event.target.closest('.cm-emoji__btn');
      const target = document.getElementById(row.dataset.target);
      if (button && target) insertAtCursor(target, button.dataset.emoji);
    });
  });

  const commentForm = document.getElementById('commentForm');
  const commentInput = document.getElementById('commentContent');
  commentForm?.addEventListener('submit', handleModalCommentSubmit);
  commentInput?.addEventListener('input', () => {
    autoGrow(commentInput);
    updateCommentSendState();
  });
  commentInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      commentForm?.requestSubmit();
    }
  });
}

function bindLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  if (!lightbox) return;

  document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev')?.addEventListener('click', () => stepLightbox(-1));
  document.getElementById('lightboxNext')?.addEventListener('click', () => stepLightbox(1));
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    else if (event.key === 'ArrowLeft') stepLightbox(-1);
    else if (event.key === 'ArrowRight') stepLightbox(1);
    else if (event.key === 'Tab') {
      // กัน focus หลุดออกไปหลังภาพ
      const focusables = Array.from(lightbox.querySelectorAll('button:not([hidden])'));
      const index = focusables.indexOf(document.activeElement);
      event.preventDefault();
      focusables[(index + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length]?.focus();
    }
  });

  let touchStartX = null;
  lightbox.addEventListener('touchstart', (event) => {
    touchStartX = event.touches[0]?.clientX ?? null;
  }, { passive: true });
  lightbox.addEventListener('touchend', (event) => {
    if (touchStartX === null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    touchStartX = null;
    if (Math.abs(deltaX) > 50) stepLightbox(deltaX < 0 ? 1 : -1);
  });
}

// แผงภาพรวม: เดสก์ท็อปกางไว้เสมอ มือถือพับเหลือแถบเดียว
function bindInsightsPanel() {
  const panel = document.getElementById('insightsPanel');
  if (!panel) return;
  const desktop = window.matchMedia('(min-width: 992px)');
  const sync = () => { panel.open = desktop.matches; };
  sync();
  desktop.addEventListener('change', sync);
}

// ลิงก์จากหน้าอื่นเปิดฟอร์มในหน้านี้ได้: ?compose=1 (เขียนโพสต์), ?edit=ID (แก้ไขโพสต์ของตัวเอง — มาจากหน้าโพสต์ของฉัน)
function handleEntryParams() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('compose') && !params.has('edit')) return;

  const editId = Number.parseInt(params.get('edit'), 10);
  params.delete('compose');
  params.delete('edit');
  const query = params.toString();
  history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);

  if (Number.isInteger(editId)) {
    const post = findPost(editId);
    if (post?.isOwner) openEditModal(editId);
    else showToast('ไม่พบโพสต์นี้ หรือคุณไม่ใช่เจ้าของโพสต์');
    return;
  }
  openComposer(null);
}

document.addEventListener('DOMContentLoaded', () => {
  bindFeedClicks();
  bindToolbar();
  bindForms();
  bindLightbox();
  bindInsightsPanel();
  renderFeed();
  highlightLinkedPost();
  handleEntryParams();
  window.addEventListener('hashchange', highlightLinkedPost);

  // อัปเดต "x นาทีที่แล้ว" ทุกนาทีโดยไม่ต้องรีเฟรชหน้า
  setInterval(() => {
    document.querySelectorAll('.js-reltime[datetime]').forEach((time) => {
      time.textContent = formatRelativeTime(time.getAttribute('datetime'), time.getAttribute('title'));
    });
  }, 60 * 1000);
});
