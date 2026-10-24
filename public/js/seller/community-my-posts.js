'use strict';

/* ============================================================
   community-my-posts.js — แดชบอร์ด "โพสต์ของฉัน" (/community/my-posts)
   หน้านี้แค่สรุป/ค้นหา/ลบ ส่วนการแก้ไขส่งไปใช้ฟอร์มตัวเดียวในหน้าฟีด (/community?edit=ID)
   จะได้ไม่มีฟอร์มแก้ไขสองชุดที่ต้องตามแก้ให้ตรงกัน
   ============================================================ */

const pageData = (() => {
    try {
        return JSON.parse(document.getElementById('myPostsData')?.textContent || '{}');
    } catch (error) {
        return {};
    }
})();

const state = {
    posts: Array.isArray(pageData.posts) ? pageData.posts : [],
    query: '',
    category: '',
    sort: 'latest'
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('th-TH');
}

function showToast(message) {
    const toastEl = document.getElementById('actionToast');
    const msgEl = document.getElementById('toastMessage');
    if (!toastEl || !msgEl) return;
    msgEl.textContent = message;
    bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2500, autohide: true }).show();
}

function categoryIcon(category) {
    return (pageData.categoryIcons || {})[category] || pageData.defaultCategoryIcon || 'bi-grid';
}

function categoryColor(category) {
    return (pageData.categoryColors || {})[category] || pageData.defaultCategoryColor || 'teal';
}

function renderStats() {
    const totals = state.posts.reduce((acc, post) => ({
        likes: acc.likes + Number(post.likes || 0),
        comments: acc.comments + Number(post.comments || 0)
    }), { likes: 0, comments: 0 });

    document.getElementById('statPosts').textContent = formatNumber(state.posts.length);
    document.getElementById('statLikes').textContent = formatNumber(totals.likes);
    document.getElementById('statComments').textContent = formatNumber(totals.comments);

    // คอมเมนต์นับหนักกว่าถูกใจ เพราะแปลว่ามีคนคุยต่อจริง
    const top = state.posts.reduce((best, post) => {
        const score = Number(post.likes || 0) + Number(post.comments || 0) * 2;
        return !best || score > best.score ? { post, score } : best;
    }, null);
    const topEl = document.getElementById('statTop');
    if (top && top.score > 0) {
        topEl.textContent = top.post.content;
        topEl.href = `/community#post-${top.post.id}`;
    } else {
        topEl.textContent = state.posts.length ? 'ยังไม่มีคนกดถูกใจหรือคอมเมนต์' : '—';
        topEl.removeAttribute('href');
    }
}

function getVisiblePosts() {
    const query = state.query.trim().toLowerCase();
    const sorters = {
        latest: (a, b) => new Date(b.createdAtIso || 0) - new Date(a.createdAtIso || 0),
        likes: (a, b) => Number(b.likes || 0) - Number(a.likes || 0),
        comments: (a, b) => Number(b.comments || 0) - Number(a.comments || 0)
    };
    return state.posts
        .filter((post) => !state.category || post.category === state.category)
        .filter((post) => !query || String(post.content || '').toLowerCase().includes(query))
        .sort(sorters[state.sort] || sorters.latest);
}

function renderList() {
    const list = document.getElementById('myPostsList');
    if (!list) return;

    const posts = getVisiblePosts();
    if (!posts.length) {
        const filtered = state.query || state.category;
        list.innerHTML = `
            <div class="cm-empty">
                <i class="bi ${filtered ? 'bi-search' : 'bi-journal-plus'}"></i>
                <p class="cm-empty__title">${filtered ? 'ไม่พบโพสต์ที่ตรงเงื่อนไข' : 'คุณยังไม่ได้โพสต์'}</p>
                <p class="cm-muted">${filtered ? 'ลองเปลี่ยนคำค้นหรือช่องที่กรอง' : 'เล่าเมนูเด็ดหรือโปรวันนี้ให้เพื่อนผู้ขายฟัง'}</p>
                ${filtered ? '' : '<a href="/community?compose=1" class="cm-btn cm-btn--primary"><i class="bi bi-pencil-square"></i>เขียนโพสต์แรก</a>'}
            </div>`;
        return;
    }

    list.innerHTML = posts.map((post) => {
        const thumb = post.images?.[0]?.imageUrl;
        const imageCount = (post.images || []).length;
        return `
            <article class="mp-row" role="listitem" data-id="${post.id}">
                <a class="mp-row__thumb" href="/community#post-${post.id}" aria-label="ดูโพสต์ในฟีด">
                    ${thumb
                        ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">${imageCount > 1 ? `<span>+${imageCount - 1}</span>` : ''}`
                        : `<i class="bi ${categoryIcon(post.category)}"></i>`}
                </a>
                <div class="mp-row__main">
                    <p class="mp-row__meta">
                        <span class="cm-catmark cat-${categoryColor(post.category)}"><i class="bi ${categoryIcon(post.category)}"></i>${escapeHtml(post.category)}</span>
                        <span>${escapeHtml(post.createdAt)}</span>
                        ${post.isPinned ? '<span class="cm-badge cm-badge--pin"><i class="bi bi-pin-angle-fill"></i>ปักหมุดโดยแอดมิน</span>' : ''}
                    </p>
                    <p class="mp-row__text">${escapeHtml(post.content)}</p>
                </div>
                <dl class="mp-row__stats">
                    <div><dt>ถูกใจ</dt><dd><i class="bi bi-heart"></i>${formatNumber(post.likes)}</dd></div>
                    <div><dt>คอมเมนต์</dt><dd><i class="bi bi-chat"></i>${formatNumber(post.comments)}</dd></div>
                </dl>
                <div class="mp-row__actions">
                    <a class="cm-btn cm-btn--ghost" href="/community#post-${post.id}"><i class="bi bi-eye"></i><span>ดู</span></a>
                    <a class="cm-btn cm-btn--ghost" href="/community?edit=${post.id}"><i class="bi bi-pencil"></i><span>แก้ไข</span></a>
                    <button type="button" class="cm-btn cm-btn--ghost mp-delete js-delete" data-id="${post.id}" aria-label="ลบโพสต์"><i class="bi bi-trash3"></i><span>ลบ</span></button>
                </div>
            </article>`;
    }).join('');
}

function render() {
    renderStats();
    renderList();
}

function handleDelete(postId) {
    window.showConfirmDialog({
        title: 'ลบโพสต์',
        message: 'ยืนยันการลบโพสต์นี้ใช่หรือไม่? คอมเมนต์และยอดถูกใจจะหายไปด้วย กู้คืนไม่ได้',
        tone: 'danger',
        confirmText: 'ลบโพสต์',
        onConfirm: async () => {
            let result = { success: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง' };
            let ok = false;
            try {
                const response = await fetch(`/community/posts/${postId}`, {
                    method: 'DELETE',
                    headers: { Accept: 'application/json' }
                });
                result = await response.json();
                ok = response.ok && result.success;
            } catch (error) {
                // ใช้ข้อความ default ด้านบน
            }

            if (!ok) {
                showToast(result.message || 'ลบโพสต์ไม่สำเร็จ');
                return;
            }

            state.posts = state.posts.filter((post) => Number(post.id) !== Number(postId));
            render();
            showToast('ลบโพสต์แล้ว');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    let searchTimer = null;
    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.query = searchInput.value;
            renderList();
        }, 150);
    });

    document.getElementById('categoryFilter')?.addEventListener('change', (event) => {
        state.category = event.target.value;
        renderList();
    });

    document.getElementById('sortSelect')?.addEventListener('change', (event) => {
        state.sort = event.target.value;
        renderList();
    });

    document.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.js-delete');
        if (deleteButton) handleDelete(Number.parseInt(deleteButton.dataset.id, 10));
    });

    render();
});
