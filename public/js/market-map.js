document.addEventListener('DOMContentLoaded', () => {
  const zoneSelect = document.getElementById('zoneSelect');
  const zones = Array.from(document.querySelectorAll('.zone'));
  const modal = document.getElementById('stallModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  const bookBtn = document.getElementById('bookStallBtn');
  const modalZoneText = document.getElementById('modalZoneText');
  const modalSize = document.getElementById('modalSize');
  const modalPrice = document.getElementById('modalPrice');
  const modalTitle = document.getElementById('modalTitle');
  const facilityButtons = document.querySelectorAll('.facility-btn');

  const detailsByZone = {
    a: {
      label: 'โซน A',
      size: 'แผงขายของขนาด 3x3 เมตร',
      price: 'ราคา 209 บาท /วัน',
      description: 'โซน A เหมาะสำหรับร้านแฟชั่นและอาหารที่ต้องการพื้นที่กว้าง'
    },
    b: {
      label: 'โซน B',
      size: 'แผงขายของขนาด 3x3 เมตร',
      price: 'ราคา 259 บาท /วัน',
      description: 'โซน B ตั้งอยู่ใกล้ทางเดินหลัก เหมาะกับร้านอาหาร'
    },
    c: {
      label: 'โซน C',
      size: 'แผงขายของขนาด 3x3 เมตร',
      price: 'ราคา 209 บาท /วัน',
      description: 'โซน C เหมาะสำหรับแฟชั่นและสินค้าขนาดกลาง'
    },
    d: {
      label: 'โซน D',
      size: 'พื้นที่สำหรับฟู้ดทรัค',
      price: 'ราคา 230 บาท /วัน',
      description: 'โซน D เหมาะสำหรับรถเข็นอาหารและฟู้ดทรัค'
    },
    e: {
      label: 'โซน E',
      size: 'แผงขายของขนาด 3x3 เมตร',
      price: 'ราคา 209 บาท /วัน',
      description: 'โซน E เป็นพื้นที่แฟชั่นคีย์ไอเดียสำหรับสินค้ามือสอง'
    },
    f: {
      label: 'โซน F',
      size: 'แผงขายของขนาด 2x2 เมตร',
      price: 'ราคา 219 บาท /วัน',
      description: 'โซน F เหมาะสำหรับร้านอาหารขนาดเล็กและบูธสั้น'
    },
    x: {
      label: 'โซน X',
      size: 'พื้นที่กิจกรรมและงานอีเวนต์',
      price: 'ราคา 500 บาท /วัน',
      description: 'โซน X เหมาะสำหรับจัดแคมเปญหรือกิจกรรมพิเศษ'
    }
  };

  const ALLOWED_ZONES = (window.ALLOWED_ZONES || []).map(String);

  function openModal(zoneKey) {
    const details = detailsByZone[zoneKey];
    if (!details) return;

    modalTitle.textContent = details.label;
    modalZoneText.textContent = details.description;
    modalSize.textContent = details.size;
    modalPrice.textContent = details.price;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  // mark disabled zones visually (still present but locked)
  zones.forEach((z) => {
    const key = String(z.dataset.zone || '').toLowerCase();
    if (ALLOWED_ZONES.length && !ALLOWED_ZONES.includes(key)) {
      z.classList.add('is-disabled');
    }
  });

  zones.forEach((zone) => {
    zone.addEventListener('click', (e) => {
      const zoneKey = String(zone.dataset.zone || '').toLowerCase();
      if (zone.classList.contains('is-disabled')) {
        // gentle notification for disabled zone
        e.preventDefault();
        // small unobtrusive feedback
        window.alert('โซนนี้ไม่สามารถจองได้สำหรับประเภทสินค้าของคุณ');
        return;
      }
      zones.forEach((item) => item.classList.remove('is-active', 'is-faded'));
      zone.classList.add('is-active');
      openModal(zoneKey);
    });

    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        zone.click();
      }
    });
  });

  if (zoneSelect) {
    zoneSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      zones.forEach((zone) => {
        const visible = value === 'all' || zone.dataset.zone === value;
        zone.classList.toggle('is-faded', !visible);
        zone.classList.toggle('is-active', false);
      });

      if (value !== 'all') {
        const target = zones.find((zone) => zone.dataset.zone === value);
        if (target) target.classList.remove('is-faded');
      }
    });
  }

  facilityButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const facility = button.dataset.facility;
      const label = facility === 'restroom' ? 'ห้องน้ำ' : 'ออฟฟิศ';
      modalTitle.textContent = label;
      modalZoneText.textContent = 'สิ่งอำนวยความสะดวกสำหรับผู้เข้าชมและผู้ประกอบการ';
      modalSize.textContent = 'ใกล้ทางเดินหลักและเข้าถึงง่าย';
      modalPrice.textContent = 'บริการใช้ได้ฟรี';
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    });
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  bookBtn.addEventListener('click', () => {
    window.location.href = '/booking-stall';
  });
});
