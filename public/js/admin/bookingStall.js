const PAGE_DATA = window.PAGE_DATA || {};
const REQUEST_DATA = PAGE_DATA.bookingRequest || {};
const ZONES_LAYOUT = PAGE_DATA.layoutByZone || {};
const BOOKED_STALLS = new Set(PAGE_DATA.bookedStalls || []);

  let currentSelectedStall = String(REQUEST_DATA.assignedStallCode || '').trim().toUpperCase() || null;
  let currentZone = (REQUEST_DATA.zone || Object.keys(ZONES_LAYOUT)[0] || 'A').toUpperCase();

  const tooltip = document.getElementById('adminTooltip');
  const confirmOverlay = document.getElementById('confirmOverlay');
  const zoneBtns = document.querySelectorAll('.btn-zone');

  function setApplicantData() {
    document.getElementById('app-name').textContent = REQUEST_DATA.sellerName || '-';
    document.getElementById('app-shop').textContent = REQUEST_DATA.shop || '-';
    document.getElementById('app-phone').textContent = REQUEST_DATA.phone || '-';
    document.getElementById('app-zone').textContent = REQUEST_DATA.zoneText || '-';
    document.getElementById('app-date').textContent = REQUEST_DATA.dateText || '-';
    document.getElementById('app-note').textContent = REQUEST_DATA.note || '-';
  }

  function renderZoneButtons() {
    const availableZones = Object.keys(ZONES_LAYOUT);
    zoneBtns.forEach((btn) => {
      const zone = (btn.dataset.zone || '').toUpperCase();
      btn.style.display = availableZones.includes(zone) ? 'inline-flex' : 'none';
    });
  }

  function setActiveZoneBtn(zoneCode) {
    zoneBtns.forEach((b) => {
      b.classList.toggle('active', (b.dataset.zone || '').toUpperCase() === zoneCode);
    });
  }

  function formatStallCode(prefix, number) {
    return `${prefix}${String(number).padStart(3, '0')}`;
  }

  function renderGrid(zoneKey) {
    const gridContainer = document.getElementById('adminGrid');
    gridContainer.innerHTML = '';

    const layout = ZONES_LAYOUT[zoneKey] || [];
    if (!layout.length) {
      gridContainer.innerHTML = '<div style="padding:24px; color:#666;">ไม่มีข้อมูลแผงสำหรับโซนนี้</div>';
      return;
    }

    layout.forEach((colData) => {
      const prefix = colData[0];
      const rowCount = Number(colData[1] || 0);
      const startNumber = Number(colData[2] || 1);

      const blockDiv = document.createElement('div');
      blockDiv.className = 'col-block';
      const colDiv = document.createElement('div');
      colDiv.className = 'stall-column';

      for (let offset = 0; offset < rowCount; offset += 1) {
        const stallNumber = startNumber + offset;
        const stallName = formatStallCode(zoneKey, stallNumber);

        const cell = document.createElement('div');
        cell.className = 'stall-cell';
        cell.textContent = stallName;

        const isBooked = BOOKED_STALLS.has(stallName);
        if (isBooked) {
          cell.classList.add('booked');
          cell.addEventListener('mouseenter', (e) => showTooltip(e, stallName));
          cell.addEventListener('mouseleave', hideTooltip);
          cell.addEventListener('mousemove', moveTooltip);
        } else {
          cell.addEventListener('click', () => {
            document.querySelectorAll('.stall-cell').forEach((c) => c.classList.remove('selected'));
            cell.classList.add('selected');
            currentSelectedStall = stallName;
          });
        }

        if (stallName === currentSelectedStall) {
          cell.classList.add('selected');
        }

        colDiv.appendChild(cell);
      }

      blockDiv.appendChild(colDiv);
      gridContainer.appendChild(blockDiv);
    });
  }

  function showTooltip(e, stallName) {
    document.getElementById('tt-stall-id').textContent = stallName;
    document.getElementById('tt-shop').textContent = 'มีผู้จองแล้ว';
    document.getElementById('tt-lock').textContent = stallName;
    document.getElementById('tt-date').textContent = '-';
    document.getElementById('tt-name').textContent = '-';
    document.getElementById('tt-phone').textContent = '-';
    document.getElementById('tt-note').textContent = 'ล็อกนี้ไม่ว่าง';

    tooltip.style.display = 'block';
    moveTooltip(e);
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  function moveTooltip(e) {
    let x = e.clientX + 15;
    let y = e.clientY + 15;

    if (x + tooltip.offsetWidth > window.innerWidth) {
      x = e.clientX - tooltip.offsetWidth - 10;
    }
    if (y + tooltip.offsetHeight > window.innerHeight) {
      y = e.clientY - tooltip.offsetHeight - 10;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  function confirmStall() {
    if (!currentSelectedStall) {
      if (window.Swal && typeof window.Swal.fire === 'function') {
        Swal.fire({
          icon: 'warning',
          title: 'ยังไม่ได้เลือกแผงค้า',
          text: 'กรุณาคลิกเลือกแผงค้า 1 ล็อกบนแผนที่เพื่อจัดแผงให้ลูกค้า',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#3BB8D4'
        });
      } else {
        alert('กรุณาคลิกเลือกแผงค้า 1 ล็อกบนแผนที่เพื่อจัดแผงให้ลูกค้า');
      }
      return;
    }
    openConfirmSummary();
  }

  function openConfirmSummary() {
    document.getElementById('c-stall').textContent = currentSelectedStall;
    document.getElementById('c-shop').textContent = document.getElementById('app-shop').textContent || '-';
    document.getElementById('c-name').textContent = document.getElementById('app-name').textContent || '-';
    document.getElementById('c-phone').textContent = document.getElementById('app-phone').textContent || '-';
    document.getElementById('c-zone').textContent = document.getElementById('app-zone').textContent || '-';
    document.getElementById('c-date').textContent = document.getElementById('app-date').textContent || '-';
    confirmOverlay.classList.add('active');
  }

  function closeConfirmSummary() {
    confirmOverlay.classList.remove('active');
  }

  function closeConfirmOnOverlay(event) {
    if (event.target === confirmOverlay) {
      closeConfirmSummary();
    }
  }

  function postForm(action, fields) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;

    Object.keys(fields).forEach((key) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(fields[key] || '');
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }

  function submitConfirmStall() {
    postForm('/admin/booking-stall/confirm', {
      requestId: REQUEST_DATA.id || '',
      selectedStall: currentSelectedStall || ''
    });
  }

  function rejectStall() {
    const ok = window.confirm('คุณแน่ใจหรือไม่ที่จะปฏิเสธคำขอนี้?');
    if (!ok) return;

    postForm('/admin/booking-stall/reject', {
      requestId: REQUEST_DATA.id || ''
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setApplicantData();
    renderZoneButtons();
    setActiveZoneBtn(currentZone);
    renderGrid(currentZone);

    zoneBtns.forEach((btn) => {
      btn.addEventListener('click', function () {
        const selectedZone = String(this.dataset.zone || '').toUpperCase();
        if (!ZONES_LAYOUT[selectedZone]) {
          return;
        }
        currentZone = selectedZone;
        setActiveZoneBtn(selectedZone);
        renderGrid(selectedZone);
      });
    });
  });

  window.confirmStall = confirmStall;
  window.closeConfirmSummary = closeConfirmSummary;
  window.closeConfirmOnOverlay = closeConfirmOnOverlay;
  window.submitConfirmStall = submitConfirmStall;
  window.rejectStall = rejectStall;

