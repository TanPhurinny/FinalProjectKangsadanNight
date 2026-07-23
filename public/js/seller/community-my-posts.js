'use strict';

const state = {
    posts: Array.isArray(window.__MY_POSTS_INITIAL__) ? window.__MY_POSTS_INITIAL__ : [],
    removeImageIds: new Set()
};

function showToast(message) {
    const toastEl = document.getElementById('actionToast');
    const msgEl = document.getElementById('toastMessage');
    if (!toastEl || !msgEl) return;

    msgEl.textContent = message;
    bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2500, autohide: true }).show();
}

function parseJsonSafe(response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return Promise.resolve({ success: false, message: 'รูปแบบข้อมูลตอบกลับไม่ถูกต้อง' });
    }

    return response.json();
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
}

function renderPosts() {
    const tableBody = document.getElementById('myPostsTableBody');
    const cardList = document.getElementById('myPostsCardList');
    const emptyState = document.getElementById('myPostsEmptyState');

    if (!tableBody || !cardList || !emptyState) return;

    tableBody.innerHTML = '';
    cardList.innerHTML = '';

    if (!state.posts.length) {
        emptyState.classList.remove('d-none');
        return;
    }

    emptyState.classList.add('d-none');

    state.posts.forEach((post) => {
        const thumb = post.images?.[0]?.imageUrl || '/img/favicon.png';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><img class="table-thumb" src="${thumb}" alt="thumbnail"></td>
            <td>${escapeHtml(post.category)}</td>
            <td>${escapeHtml(post.createdAt)}</td>
            <td>${Number(post.likes || 0)}</td>
            <td>${Number(post.comments || 0)}</td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-primary js-edit" data-id="${post.id}">แก้ไข</button>
                    <button class="btn btn-sm btn-outline-danger js-delete" data-id="${post.id}">ลบ</button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);

        const card = document.createElement('div');
        card.className = 'mobile-post-card';
        card.innerHTML = `
            <img class="thumb mb-2" src="${thumb}" alt="thumbnail">
            <div class="fw-semibold">${escapeHtml(post.category)}</div>
            <div class="mobile-meta mb-1">${escapeHtml(post.createdAt)}</div>
            <div class="mobile-meta mb-2">Like ${Number(post.likes || 0)} | Comment ${Number(post.comments || 0)}</div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary js-edit" data-id="${post.id}">แก้ไข</button>
                <button class="btn btn-sm btn-outline-danger js-delete" data-id="${post.id}">ลบ</button>
            </div>
        `;
        cardList.appendChild(card);
    });
}

/* ============================================================
   CUSTOM FORM UI HELPERS — เหมือนกับหน้าฟีดคอมมูนิตี้ (comunity.js)
   ใช้กับโมดัลแก้ไขโพสต์ของหน้านี้
   ============================================================ */
function setActiveCategoryCard(gridEl, categoryValue) {
    if (!gridEl) return;

    gridEl.querySelectorAll('.category-card').forEach((card) => {
        const isActive = card.dataset.category === categoryValue;
        card.classList.toggle('category-card--active', isActive);
        card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
}

function initCategoryCardGroup(gridEl, hiddenSelectEl) {
    if (!gridEl || !hiddenSelectEl) return;

    gridEl.querySelectorAll('.category-card').forEach((card) => {
        card.addEventListener('click', () => {
            setActiveCategoryCard(gridEl, card.dataset.category);
            hiddenSelectEl.value = card.dataset.category;
        });
    });
}

function initImageDropzone(dropzoneEl, inputEl, previewEl) {
    if (!dropzoneEl || !inputEl) return;

    dropzoneEl.addEventListener('click', () => inputEl.click());
    dropzoneEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputEl.click();
        }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropzoneEl.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzoneEl.classList.add('image-dropzone--active');
        });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropzoneEl.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzoneEl.classList.remove('image-dropzone--active');
        });
    });

    dropzoneEl.addEventListener('drop', (event) => {
        const droppedFiles = event.dataTransfer && event.dataTransfer.files;
        if (!droppedFiles || !droppedFiles.length) return;

        inputEl.files = droppedFiles;
        renderImagePreview(previewEl, inputEl.files);
    });
}

function resizeAutoGrowTextarea(textareaEl) {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    textareaEl.style.height = `${textareaEl.scrollHeight}px`;
}

function initAutoGrowTextarea(textareaEl) {
    if (!textareaEl) return;
    textareaEl.addEventListener('input', () => resizeAutoGrowTextarea(textareaEl));
}

function renderImagePreview(container, files) {
    if (!container) return;
    container.innerHTML = '';

    Array.from(files || []).slice(0, 10).forEach((file) => {
        const item = document.createElement('div');
        item.className = 'image-preview-item';

        const image = document.createElement('img');
        image.src = URL.createObjectURL(file);
        image.onload = () => URL.revokeObjectURL(image.src);
        item.appendChild(image);

        container.appendChild(item);
    });
}

function populateEditModal(postId) {
    const post = state.posts.find((item) => Number(item.id) === Number(postId));
    if (!post) return;

    document.getElementById('editPostId').value = String(post.id);
    document.getElementById('editPostCategory').value = post.category;
    document.getElementById('editPostContent').value = post.content || '';

    setActiveCategoryCard(document.getElementById('editCategoryGrid'), post.category);
    document.getElementById('editPostContent').style.height = 'auto';

    const existingImages = document.getElementById('editExistingImages');
    const newImagePreview = document.getElementById('editNewImagePreview');
    const newImageInput = document.getElementById('editPostImages');

    state.removeImageIds.clear();
    existingImages.innerHTML = '';
    newImagePreview.innerHTML = '';
    newImageInput.value = '';

    (post.images || []).forEach((image) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-item';
        wrapper.dataset.imageId = String(image.id);
        wrapper.innerHTML = `
            <img src="${image.imageUrl}" alt="old image">
            <button class="remove-image-btn" type="button" data-image-id="${image.id}">ลบ</button>
        `;
        existingImages.appendChild(wrapper);
    });

    const modalEl = document.getElementById('editPostModal');
    modalEl.addEventListener('shown.bs.modal', () => resizeAutoGrowTextarea(document.getElementById('editPostContent')), { once: true });
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function fetchMyPosts() {
    const category = document.getElementById('categoryFilter').value;
    const query = document.getElementById('searchInput').value.trim();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (query) params.set('q', query);

    const response = await fetch(`/community/my-posts/data?${params.toString()}`, {
        headers: { Accept: 'application/json' }
    });

    const result = await parseJsonSafe(response);
    if (!response.ok || !result.success) {
        showToast(result.message || 'ไม่สามารถโหลดรายการโพสต์ได้');
        return;
    }

    state.posts = result.posts || [];
    renderPosts();
}

async function handleDelete(postId) {
    if (!window.confirm('ยืนยันการลบโพสต์นี้ใช่หรือไม่?')) return;

    const response = await fetch(`/community/posts/${postId}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' }
    });

    const result = await parseJsonSafe(response);
    if (!response.ok || !result.success) {
        showToast(result.message || 'ลบโพสต์ไม่สำเร็จ');
        return;
    }

    state.posts = state.posts.filter((post) => Number(post.id) !== Number(postId));
    renderPosts();
    showToast('ลบโพสต์สำเร็จ');
}

async function handleEditSubmit(event) {
    event.preventDefault();

    const postId = Number.parseInt(document.getElementById('editPostId').value, 10);
    if (!Number.isInteger(postId)) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append('removeImageIds', JSON.stringify(Array.from(state.removeImageIds)));

    const response = await fetch(`/community/posts/${postId}`, {
        method: 'PUT',
        body: formData,
        headers: { Accept: 'application/json' }
    });

    const result = await parseJsonSafe(response);
    if (!response.ok || !result.success) {
        showToast(result.message || 'บันทึกการแก้ไขไม่สำเร็จ');
        return;
    }

    const updatedPost = result.post;
    state.posts = state.posts.map((post) => Number(post.id) === Number(updatedPost.id) ? updatedPost : post);
    renderPosts();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editPostModal')).hide();
    showToast('แก้ไขโพสต์สำเร็จ');
}

function bindEvents() {
    const filterForm = document.getElementById('myPostsFilterForm');
    filterForm.addEventListener('submit', (event) => {
        event.preventDefault();
        fetchMyPosts();
    });

    document.addEventListener('click', (event) => {
        const editButton = event.target.closest('.js-edit');
        if (editButton) {
            const postId = Number.parseInt(editButton.dataset.id, 10);
            if (Number.isInteger(postId)) {
                populateEditModal(postId);
            }
            return;
        }

        const deleteButton = event.target.closest('.js-delete');
        if (deleteButton) {
            const postId = Number.parseInt(deleteButton.dataset.id, 10);
            if (Number.isInteger(postId)) {
                handleDelete(postId);
            }
        }
    });

    const editPostImagesInput = document.getElementById('editPostImages');
    editPostImagesInput.addEventListener('change', (event) => {
        renderImagePreview(document.getElementById('editNewImagePreview'), event.target.files);
    });

    initCategoryCardGroup(document.getElementById('editCategoryGrid'), document.getElementById('editPostCategory'));
    initImageDropzone(document.getElementById('editDropzone'), editPostImagesInput, document.getElementById('editNewImagePreview'));
    initAutoGrowTextarea(document.getElementById('editPostContent'));

    document.getElementById('editExistingImages').addEventListener('click', (event) => {
        const removeButton = event.target.closest('.remove-image-btn');
        if (!removeButton) return;

        const imageId = Number.parseInt(removeButton.dataset.imageId, 10);
        if (!Number.isInteger(imageId)) return;

        state.removeImageIds.add(imageId);
        const wrapper = removeButton.closest('.image-preview-item');
        if (wrapper) wrapper.remove();
    });

    document.getElementById('editPostForm').addEventListener('submit', handleEditSubmit);
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    renderPosts();
});
