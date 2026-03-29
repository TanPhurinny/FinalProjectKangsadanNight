document.addEventListener('DOMContentLoaded', function() {
    function updateDateTime() {
        const liveDate = document.getElementById('live-date');
        if (!liveDate) return;

        const now = new Date();
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        liveDate.innerText = `อัปเดตเมื่อ: ${now.toLocaleString('th-TH', options)}`;
    }

    function animateCounters() {
        document.querySelectorAll('.count-up').forEach((el) => {
            const rawTarget = parseFloat(el.dataset.target || '0');
            const isPercent = el.textContent.includes('%') || String(el.dataset.target).includes('.');
            const target = Number.isFinite(rawTarget) ? rawTarget : 0;
            const duration = 700;
            const start = 0;
            const startTime = performance.now();

            function tick(now) {
                const progress = Math.min((now - startTime) / duration, 1);
                const value = start + (target - start) * progress;
                el.textContent = isPercent ? `${value.toFixed(1)}%` : Math.round(value).toString();
                if (progress < 1) requestAnimationFrame(tick);
            }

            requestAnimationFrame(tick);
        });
    }

    function setupZoneTools() {
        const zoneSearchInput = document.getElementById('zoneSearchInput');
        const zoneSortSelect = document.getElementById('zoneSortSelect');
        const zonesGrid = document.getElementById('zonesGrid');
        const zoneCols = Array.from(document.querySelectorAll('.zone-col'));
        const emptyFilteredZone = document.getElementById('emptyFilteredZone');

        if (!zonesGrid || zoneCols.length === 0) return;

        const applyZoneFilterAndSort = () => {
            const term = (zoneSearchInput?.value || '').toLowerCase().trim();
            const sortType = zoneSortSelect?.value || 'name-asc';

            zoneCols.forEach((zoneCol) => {
                const match = zoneCol.dataset.zoneName.includes(term);
                zoneCol.style.display = match ? '' : 'none';
            });

            const visibleZones = zoneCols.filter((zoneCol) => zoneCol.style.display !== 'none');

            visibleZones.sort((a, b) => {
                if (sortType === 'repairs-desc') {
                    return Number(b.dataset.repairs || 0) - Number(a.dataset.repairs || 0);
                }
                if (sortType === 'available-desc') {
                    return Number(b.dataset.available || 0) - Number(a.dataset.available || 0);
                }
                return a.dataset.zoneName.localeCompare(b.dataset.zoneName, 'th');
            });

            visibleZones.forEach((zoneCol) => zonesGrid.appendChild(zoneCol));

            if (emptyFilteredZone) {
                emptyFilteredZone.classList.toggle('d-none', visibleZones.length > 0);
            }
        };

        if (zoneSearchInput) zoneSearchInput.addEventListener('input', applyZoneFilterAndSort);
        if (zoneSortSelect) zoneSortSelect.addEventListener('change', applyZoneFilterAndSort);

        applyZoneFilterAndSort();
    }

    function setupRevealAnimation() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        document.querySelectorAll('.kpi-card, .insight-card, .zone-card, .zone-panel').forEach((card) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(14px)';
            card.style.transition = 'all 0.45s ease';
            observer.observe(card);
        });
    }

    updateDateTime();
    setInterval(updateDateTime, 60000);
    animateCounters();
    setupZoneTools();
    setupRevealAnimation();
});
