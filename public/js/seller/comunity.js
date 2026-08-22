'use strict';

const state = {
  canCreatePost: String(document.body?.dataset?.canCreatePost || '0') === '1',
  categories: (() => {
    try {
      return JSON.parse(document.body?.dataset?.categories || '[]');
    } catch (error) {
      return [];
    }
  })(),
  removeImageIds: new Set(),
  activePostIdForComments: null
};

function showToast(message) {
  const toastEl = document.getElementById('shareToast');
  const msgEl = document.getElementById('toastMessage');
  if (!toastEl || !msgEl) return;

  msgEl.textContent = message;
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, {
    delay: 2500,
    autohide: true
  });
  toast.show();
}

async function parseJsonSafe(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return { success: false, message: 'เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON' };
  }

  return response.json();
}

/* ============================================================
   CUSTOM FORM UI HELPERS
   - การ์ดเลือกหมวดหมู่ (แทน <select> ปกติ)
   - Drag & Drop อัปโหลดรูป (แทน <input type="file"> ปกติ)
   - กล่องพิมพ์เนื้อหาที่ขยายสูงอัตโนมัติ (สไตล์ Facebook)
   ทั้งหมดนี้แค่เปลี่ยน "หน้าตา" แต่ยังเก็บค่าไว้ใน <select>/<input> จริง
   ที่ซ่อนอยู่ (.visually-hidden) เพื่อให้ FormData ตอน submit ทำงานเหมือนเดิมทุกอย่าง
   ============================================================ */

// คลิกการ์ดแล้วอัปเดตค่าใน select ที่ซ่อนไว้ + ไฮไลต์การ์ดที่เลือก
function initCategoryCardGroup(gridEl, hiddenSelectEl) {
  if (!gridEl || !hiddenSelectEl) return;

  gridEl.querySelectorAll('.category-card').forEach((card) => {
    card.addEventListener('click', () => {
      setActiveCategoryCard(gridEl, card.dataset.category);
      hiddenSelectEl.value = card.dataset.category;
    });
  });
}

// ใช้ตอนเปิดฟอร์มแก้ไข เพื่อไฮไลต์การ์ดให้ตรงกับหมวดหมู่เดิมของโพสต์
function setActiveCategoryCard(gridEl, categoryValue) {
  if (!gridEl) return;

  gridEl.querySelectorAll('.category-card').forEach((card) => {
    const isActive = card.dataset.category === categoryValue;
    card.classList.toggle('category-card--active', isActive);
    card.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
}

// คลิก/ลากไฟล์มาวางบน dropzone แล้วส่งไฟล์เข้า input[type=file] ที่ซ่อนไว้
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

// ขยายความสูง textarea ตามเนื้อหาที่พิมพ์ ให้ดูเหมือนกล่องโพสต์ของ Facebook
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

  Array.from(files).slice(0, 10).forEach((file) => {
    const item = document.createElement('div');
    item.className = 'image-preview-item';

    const image = document.createElement('img');
    image.src = URL.createObjectURL(file);
    image.alt = file.name;
    image.onload = () => URL.revokeObjectURL(image.src);

    item.appendChild(image);
    container.appendChild(item);
  });
}

function resetCreateForm() {
  const form = document.getElementById('createPostForm');
  const preview = document.getElementById('createImagePreview');
  if (!form) return;

  form.reset();
  if (preview) preview.innerHTML = '';

  setActiveCategoryCard(document.getElementById('createCategoryGrid'), '');
  resizeAutoGrowTextarea(document.getElementById('createContentInput'));
}

function getPostCard(postId) {
  return document.getElementById(`post-${postId}`);
}

function bindPostDataAttributes(card, post) {
  card.dataset.category = post.category;
  card.dataset.content = JSON.stringify(post.content || '');
  card.dataset.images = JSON.stringify(post.images || []);
}

function buildPostCardHtml(post) {
  const images = Array.isArray(post.images) ? post.images : [];
  const visibleImages = images.slice(0, 4);

  const imageHtml = visibleImages.map((image, index) => {
    const isLastVisible = index === 3 && images.length > 4;
    const extraCount = images.length - 4;
    return `
      <div class="gallery-item">
        <img src="${image.imageUrl}" alt="Post image ${index + 1}" class="gallery-img" loading="lazy" data-post-id="${post.id}" data-image-index="${index}">
        ${isLastVisible ? `<div class="gallery-overlay" data-post-id="${post.id}" data-image-index="${index}"><span>+${extraCount}</span></div>` : ''}
      </div>
    `;
  }).join('');

  const ownerMenuHtml = post.isOwner ? `
    <span class="owner-badge">โพสต์ของคุณ</span>
    <div class="dropdown">
      <button class="post-menu-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false">⋮</button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><button class="dropdown-item js-edit-post" type="button" data-post-id="${post.id}">แก้ไขโพสต์</button></li>
        <li><button class="dropdown-item text-danger js-delete-post" type="button" data-post-id="${post.id}">ลบโพสต์</button></li>
      </ul>
    </div>
  ` : '';

  return `
    <div class="post-header d-flex align-items-start justify-content-between">
      <div class="d-flex align-items-center gap-2 post-meta">
        <img src="${post.profileImage}" alt="${post.storeName}" class="post-avatar" loading="lazy">
        <div>
          <div class="post-store-name">${post.storeName}</div>
          <div class="post-time">${post.createdAt}</div>
        </div>
      </div>

      <div class="post-header-right">
        <div class="stall-badge">${post.stallNo || '-'}</div>
        ${ownerMenuHtml}
      </div>
    </div>

    <div class="post-content">
      <span class="post-category-pill">${post.category}</span>
      <p class="post-text"></p>
    </div>

    ${images.length ? `<div class="post-gallery post-gallery--${Math.min(images.length, 4)}">${imageHtml}</div>` : ''}

    <div class="post-actions d-flex align-items-center justify-content-between">
      <div class="d-flex align-items-center gap-3">
        <button class="action-btn like-btn ${post.isLiked ? 'is-liked' : ''}" type="button" data-post-id="${post.id}" aria-label="Like">
          <i class="bi ${post.isLiked ? 'bi-heart-fill' : 'bi-heart'}"></i>
          <span class="action-count">${post.likes}</span>
        </button>

        <button class="action-btn comment-btn" type="button" data-post-id="${post.id}" aria-label="Comment">
          <i class="bi bi-chat-round-dots"></i>
          <span class="action-count">${post.comments}</span>
        </button>

        <button class="action-btn share-btn" type="button" data-post-id="${post.id}" aria-label="Share">
          <i class="bi bi-share"></i>
          <span class="action-label">แชร์</span>
        </button>
      </div>
    </div>
  `;
}

function upsertPostCard(post, prepend = false) {
  const feedContainer = document.getElementById('feedContainer');
  const emptyState = document.getElementById('emptyFeedState');
  if (!feedContainer) return;

  if (emptyState) {
    emptyState.remove();
  }

  let card = getPostCard(post.id);
  const isNewCard = !card;
  if (!card) {
    card = document.createElement('article');
    card.className = 'post-card';
    card.id = `post-${post.id}`;
    card.dataset.postId = String(post.id);
  }

  bindPostDataAttributes(card, post);
  card.innerHTML = buildPostCardHtml(post);

  const postText = card.querySelector('.post-text');
  if (postText) {
    postText.textContent = post.content || '';
  }

  if (isNewCard) {
    if (prepend) {
      feedContainer.prepend(card);
    } else {
      feedContainer.appendChild(card);
    }
  }

  applyActiveFilter();
}

function getActiveCategory() {
  const activeButton = document.querySelector('.filter-pill.filter-pill--active');
  return activeButton?.dataset.category || 'ทั้งหมด';
}

function applyActiveFilter() {
  const selectedCategory = getActiveCategory();
  document.querySelectorAll('.post-card').forEach((card) => {
    const shouldShow = selectedCategory === 'ทั้งหมด' || card.dataset.category === selectedCategory;
    card.style.display = shouldShow ? '' : 'none';
  });
}

function setFilterButtonActive(button) {
  document.querySelectorAll('.filter-pill').forEach((element) => {
    element.classList.remove('filter-pill--active');
    element.classList.add('filter-pill--inactive');
  });

  button.classList.add('filter-pill--active');
  button.classList.remove('filter-pill--inactive');
}

async function handleCreatePostSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);

  const response = await fetch('/community/posts', {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json'
    }
  });

  const result = await parseJsonSafe(response);
  if (!response.ok || !result.success) {
    showToast(result.message || 'สร้างโพสต์ไม่สำเร็จ');
    return;
  }

  upsertPostCard(result.post, true);
  showToast(result.message || 'โพสต์สำเร็จ');

  const modalEl = document.getElementById('createPostModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.hide();
  resetCreateForm();
}

function populateEditModal(postId) {
  const card = getPostCard(postId);
  if (!card) return;

  const postIdInput = document.getElementById('editPostId');
  const categorySelect = document.getElementById('editPostCategory');
  const contentInput = document.getElementById('editPostContent');
  const existingImages = document.getElementById('editExistingImages');
  const newPreview = document.getElementById('editNewImagePreview');
  const imageInput = document.getElementById('editPostImages');

  const category = card.dataset.category;
  const content = JSON.parse(card.dataset.content || '""');
  const images = JSON.parse(card.dataset.images || '[]');

  postIdInput.value = postId;
  categorySelect.value = category;
  contentInput.value = content;

  setActiveCategoryCard(document.getElementById('editCategoryGrid'), category);
  contentInput.style.height = 'auto';

  state.removeImageIds.clear();
  existingImages.innerHTML = '';
  newPreview.innerHTML = '';
  imageInput.value = '';

  images.forEach((image) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview-item image-preview-item--existing';
    wrapper.dataset.imageId = String(image.id);

    wrapper.innerHTML = `
      <img src="${image.imageUrl}" alt="old image">
      <button type="button" class="remove-image-btn" data-image-id="${image.id}">ลบ</button>
    `;

    existingImages.appendChild(wrapper);
  });

  const modalEl = document.getElementById('editPostModal');
  modalEl.addEventListener('shown.bs.modal', () => resizeAutoGrowTextarea(contentInput), { once: true });
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function handleEditPostSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const postId = Number.parseInt(document.getElementById('editPostId').value, 10);
  if (!Number.isInteger(postId)) return;

  const formData = new FormData(form);
  formData.append('removeImageIds', JSON.stringify(Array.from(state.removeImageIds)));

  const response = await fetch(`/community/posts/${postId}`, {
    method: 'PUT',
    body: formData,
    headers: {
      Accept: 'application/json'
    }
  });

  const result = await parseJsonSafe(response);
  if (!response.ok || !result.success) {
    showToast(result.message || 'แก้ไขโพสต์ไม่สำเร็จ');
    return;
  }

  upsertPostCard(result.post, false);
  showToast(result.message || 'แก้ไขโพสต์สำเร็จ');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editPostModal')).hide();
}

function handleDeletePost(postId) {
  window.showConfirmDialog({
    title: 'ลบโพสต์',
    message: 'ยืนยันการลบโพสต์นี้ใช่หรือไม่? ลบแล้วกู้คืนไม่ได้',
    tone: 'danger',
    confirmText: 'ลบโพสต์',
    onConfirm: async () => {
      const response = await fetch(`/community/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json'
        }
      });

      const result = await parseJsonSafe(response);
      if (!response.ok || !result.success) {
        showToast(result.message || 'ลบโพสต์ไม่สำเร็จ');
        return;
      }

      const card = getPostCard(postId);
      if (card) {
        card.remove();
      }
      showToast('ลบโพสต์สำเร็จ');
    }
  });
}

async function handleLike(postId, button) {
  const response = await fetch(`/community/posts/${postId}/like`, {
    method: 'POST',
    headers: {
      Accept: 'application/json'
    }
  });

  const result = await parseJsonSafe(response);
  if (!response.ok || !result.success) {
    showToast(result.message || 'บันทึกการกดถูกใจไม่สำเร็จ');
    return;
  }

  const icon = button.querySelector('i');
  const countEl = button.querySelector('.action-count');
  button.classList.toggle('is-liked', result.isLiked);
  icon.classList.toggle('bi-heart-fill', result.isLiked);
  icon.classList.toggle('bi-heart', !result.isLiked);
  countEl.textContent = String(result.likes);
}

async function sharePost(postId) {
  const url = `${window.location.origin}/community#post-${postId}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(url);
    showToast('คัดลอกลิงก์แล้ว');
    return;
  }

  showToast('เบราว์เซอร์ไม่รองรับการคัดลอกอัตโนมัติ');
}

function updateCommentCount(postId, count) {
  const card = getPostCard(postId);
  if (!card) return;

  const countEl = card.querySelector('.comment-btn .action-count');
  if (countEl) {
    countEl.textContent = String(count);
  }
}

function renderComments(comments) {
  const container = document.getElementById('commentsList');
  if (!container) return;

  if (!comments.length) {
    container.innerHTML = '<div class="comment-empty">ยังไม่มีคอมเมนต์</div>';
    return;
  }

  container.innerHTML = comments.map((comment) => `
    <div class="comment-item">
      <img class="comment-avatar" src="${comment.profileImage}" alt="avatar">
      <div class="comment-content-wrap">
        <div class="comment-author">${comment.authorName}</div>
        <div class="comment-text">${comment.content}</div>
        <div class="comment-time">${comment.createdAt}</div>
      </div>
    </div>
  `).join('');
}

function updateCommentSendState() {
  const contentInput = document.getElementById('commentContent');
  const sendButton = document.querySelector('.comment-composer__send');
  if (!contentInput || !sendButton) return;

  sendButton.disabled = !contentInput.value.trim();
}

function resetCommentComposer() {
  const contentInput = document.getElementById('commentContent');
  if (!contentInput) return;

  contentInput.value = '';
  contentInput.style.height = 'auto';
  updateCommentSendState();
}

async function openComments(postId) {
  const response = await fetch(`/community/posts/${postId}/comments`, {
    headers: {
      Accept: 'application/json'
    }
  });

  const result = await parseJsonSafe(response);
  if (!response.ok || !result.success) {
    showToast(result.message || 'โหลดคอมเมนต์ไม่สำเร็จ');
    return;
  }

  state.activePostIdForComments = postId;
  document.getElementById('commentPostId').value = String(postId);
  renderComments(result.comments || []);
  resetCommentComposer();

  const modalEl = document.getElementById('commentsModal');
  const contentInput = document.getElementById('commentContent');
  modalEl.addEventListener('shown.bs.modal', () => resizeAutoGrowTextarea(contentInput), { once: true });
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function handleCommentSubmit(event) {
  event.preventDefault();

  const postId = Number.parseInt(document.getElementById('commentPostId').value, 10);
  const contentInput = document.getElementById('commentContent');
  const content = String(contentInput.value || '').trim();

  if (!Number.isInteger(postId) || !content) {
    return;
  }

  const response = await fetch(`/community/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ content })
  });

  const result = await parseJsonSafe(response);
  if (!response.ok || !result.success) {
    showToast(result.message || 'เพิ่มคอมเมนต์ไม่สำเร็จ');
    return;
  }

  resetCommentComposer();
  updateCommentCount(postId, result.commentCount || 0);
  await openComments(postId);
}

function bindEvents() {
  document.querySelectorAll('.filter-pill').forEach((button) => {
    button.addEventListener('click', () => {
      setFilterButtonActive(button);
      applyActiveFilter();
    });
  });

  const createForm = document.getElementById('createPostForm');
  const createInput = document.getElementById('createPostImages');
  if (createForm && createInput) {
    createForm.addEventListener('submit', handleCreatePostSubmit);
    createInput.addEventListener('change', () => renderImagePreview(document.getElementById('createImagePreview'), createInput.files));
  }

  initCategoryCardGroup(document.getElementById('createCategoryGrid'), document.getElementById('createCategorySelect'));
  initImageDropzone(document.getElementById('createDropzone'), createInput, document.getElementById('createImagePreview'));
  initAutoGrowTextarea(document.getElementById('createContentInput'));

  initCategoryCardGroup(document.getElementById('editCategoryGrid'), document.getElementById('editPostCategory'));
  initImageDropzone(document.getElementById('editDropzone'), document.getElementById('editPostImages'), document.getElementById('editNewImagePreview'));
  initAutoGrowTextarea(document.getElementById('editPostContent'));

  const cancelCreateBtn = document.getElementById('cancelCreatePostBtn');
  if (cancelCreateBtn) {
    cancelCreateBtn.addEventListener('click', resetCreateForm);
  }

  const createModalEl = document.getElementById('createPostModal');
  if (createModalEl) {
    createModalEl.addEventListener('hidden.bs.modal', resetCreateForm);
  }

  const editForm = document.getElementById('editPostForm');
  const editInput = document.getElementById('editPostImages');
  if (editForm) {
    editForm.addEventListener('submit', handleEditPostSubmit);
  }

  if (editInput) {
    editInput.addEventListener('change', () => renderImagePreview(document.getElementById('editNewImagePreview'), editInput.files));
  }

  const existingImagesContainer = document.getElementById('editExistingImages');
  if (existingImagesContainer) {
    existingImagesContainer.addEventListener('click', (event) => {
      const removeButton = event.target.closest('.remove-image-btn');
      if (!removeButton) return;

      const imageId = Number.parseInt(removeButton.dataset.imageId, 10);
      if (!Number.isInteger(imageId)) return;

      state.removeImageIds.add(imageId);
      const imageWrapper = removeButton.closest('.image-preview-item');
      if (imageWrapper) {
        imageWrapper.remove();
      }
    });
  }

  const commentForm = document.getElementById('commentForm');
  if (commentForm) {
    commentForm.addEventListener('submit', handleCommentSubmit);
  }

  const commentContentInput = document.getElementById('commentContent');
  if (commentContentInput) {
    initAutoGrowTextarea(commentContentInput);
    commentContentInput.addEventListener('input', updateCommentSendState);
    commentContentInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commentForm?.requestSubmit();
      }
    });
  }

  document.addEventListener('click', async (event) => {
    const likeButton = event.target.closest('.like-btn[data-post-id]');
    if (likeButton) {
      const postId = Number.parseInt(likeButton.dataset.postId, 10);
      if (Number.isInteger(postId)) {
        await handleLike(postId, likeButton);
      }
      return;
    }

    const commentButton = event.target.closest('.comment-btn[data-post-id]');
    if (commentButton) {
      const postId = Number.parseInt(commentButton.dataset.postId, 10);
      if (Number.isInteger(postId)) {
        await openComments(postId);
      }
      return;
    }

    const shareButton = event.target.closest('.share-btn[data-post-id]');
    if (shareButton) {
      const postId = Number.parseInt(shareButton.dataset.postId, 10);
      if (Number.isInteger(postId)) {
        await sharePost(postId);
      }
      return;
    }

    const editButton = event.target.closest('.js-edit-post[data-post-id]');
    if (editButton) {
      const postId = Number.parseInt(editButton.dataset.postId, 10);
      if (Number.isInteger(postId)) {
        populateEditModal(postId);
      }
      return;
    }

    const deleteButton = event.target.closest('.js-delete-post[data-post-id]');
    if (deleteButton) {
      const postId = Number.parseInt(deleteButton.dataset.postId, 10);
      if (Number.isInteger(postId)) {
        handleDeletePost(postId);
      }
      return;
    }
  });
}

function initStickyFilter() {
  const filterSection = document.getElementById('filterSection');
  if (!filterSection) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      filterSection.classList.toggle('filter-section--scrolled', !entry.isIntersecting);
    },
    { threshold: 1, rootMargin: '-1px 0px 0px 0px' }
  );

  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'height:1px;margin-top:-1px;visibility:hidden';
  filterSection.parentNode.insertBefore(sentinel, filterSection);
  observer.observe(sentinel);
}

document.addEventListener('DOMContentLoaded', () => {
  const carouselEl = document.getElementById('heroBannerCarousel');
  if (carouselEl && typeof bootstrap !== 'undefined') {
    new bootstrap.Carousel(carouselEl, {
      interval: 4000,
      ride: 'carousel'
    });
  }

  bindEvents();
  applyActiveFilter();
  initStickyFilter();
});
