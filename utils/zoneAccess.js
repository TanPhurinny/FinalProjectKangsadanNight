// Helper to determine which zones a seller may book based on productType.
// Keeps normalization and zone mapping in one place.
// OTHER = ประเภท "อื่นๆ" ในฟอร์มสมัครร้าน (บริการ เช่น ทำเล็บ/ต่อขนตา, ความงาม, ของใช้, gadget, ของเล่น, งานคราฟต์)
// ไม่ใช่ร้านอาหาร ไม่ใช้เตา/น้ำมัน จึงจองโซนเดียวกับแฟชั่น — เดิมไม่มีในตารางนี้เลยตกไปใช้ค่าเริ่มต้นโซน A อย่างเดียว
const ZONE_MAP = {
  FASHION: ['e', 'c', 'a', 'b'],
  FOOD: ['f', 'b', 'a', 'x', 'd', 't'],
  OTHER: ['e', 'c', 'a', 'b'],
  EVENT_BOOTH: [],
};

const PRODUCT_TYPE_ALIASES = {
  FASHION: 'FASHION',
  'แฟชั่น': 'FASHION',
  FOOD: 'FOOD',
  'อาหาร': 'FOOD',
  OTHER: 'OTHER',
  'อื่นๆ': 'OTHER',
  EVENT_BOOTH: 'EVENT_BOOTH',
  'บูธกิจกรรม': 'EVENT_BOOTH'
};

function normalizeProductType(productType) {
  const rawValue = String(productType || '').trim();
  if (!rawValue) return null;

  return PRODUCT_TYPE_ALIASES[rawValue.toUpperCase()] || PRODUCT_TYPE_ALIASES[rawValue] || null;
}

function allowedZonesFor(productType) {
  const normalizedProductType = normalizeProductType(productType);

  if (!normalizedProductType) {
    // If seller hasn't set a product type, allow only shared zone A as conservative default.
    return ['a'];
  }

  const zones = ZONE_MAP[normalizedProductType];
  if (!zones) return ['a'];

  return zones;
}

module.exports = {
  allowedZonesFor,
  normalizeProductType
};
