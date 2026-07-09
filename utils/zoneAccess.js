// Helper to determine which zones a seller may book based on productType
// Keeps logic centralized and easy to change.
const ZONE_MAP = {
  FASHION: ['e', 'c', 'a'],
  FOOD: ['f', 'b', 'a'],
  EVENT_BOOTH: [],
};

function allowedZonesFor(productType) {
  if (!productType) {
    // If seller hasn't set a product type, allow only shared zone A as conservative default
    return ['a'];
  }
  const upper = String(productType).toUpperCase();
  const zones = ZONE_MAP[upper];
  if (!zones) return ['a'];
  // Ensure Zone X is never allowed
  return zones.filter(z => z !== 'x');
}

module.exports = { allowedZonesFor };
