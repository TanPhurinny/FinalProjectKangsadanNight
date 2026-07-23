function openAnnouncementDetail(el) {
    const d = el.dataset;

    const img = document.getElementById('detailImage');
    if (d.image) {
        img.src = decodeURIComponent(d.image);
        img.style.display = 'block';
    } else {
        img.src = '';
        img.style.display = 'none';
    }

    document.getElementById('detailCategory').textContent = decodeURIComponent(d.category || '');
    document.getElementById('detailDate').textContent = decodeURIComponent(d.date || '');
    document.getElementById('detailTitle').textContent = decodeURIComponent(d.title || '');
    document.getElementById('detailContent').textContent = decodeURIComponent(d.content || '');

    document.getElementById('detailOverlay').classList.add('active');
}

function closeDetailModal(e) {
    if (e) e.stopPropagation();
    document.getElementById('detailOverlay').classList.remove('active');
}

function openLightbox(src) {
    if (!src) return;
    document.getElementById('lightboxImage').src = src;
    document.getElementById('lightboxOverlay').classList.add('active');
}

function closeLightbox(e) {
    if (e) e.stopPropagation();
    document.getElementById('lightboxOverlay').classList.remove('active');
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeLightbox();
        closeDetailModal();
    }
});
