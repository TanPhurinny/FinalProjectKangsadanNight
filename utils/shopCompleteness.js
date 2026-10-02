// ความครบของโปรไฟล์ร้าน (ยิ่งครบ ลูกค้ายิ่งค้นเจอ/รู้ว่าร้านขายอะไรในผังตลาด)
// ใช้ร่วมกันระหว่างหน้าร้านค้าของฉัน (/shop-profile) และหน้าแรกผู้ขาย (/seller)
// shop = ShopDetail ที่ include menuImages + productImages แล้ว — นับจากข้อมูลที่บันทึกแล้วเท่านั้น
function buildProfileChecks(shop) {
    const s = shop || {};
    const tags = String(s.shopTags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const checks = [
        { id: 'field-tags', label: 'ป้ายเมนูเด่นอย่างน้อย 3 ป้าย', done: tags.length >= 3, why: 'ลูกค้าพิมพ์ชื่อเมนูแล้วเจอร้าน' },
        { id: 'field-menu', label: 'รูปเมนูร้าน', done: (s.menuImages || []).length > 0, why: 'ลูกค้ากด "ดูเมนูร้าน" ในผังได้' },
        { id: 'field-photos', label: 'รูปสินค้า', done: (s.productImages || []).length > 0, why: 'รูปย่อร้านบนผัง/คอมมูนิตี้' },
        { id: 'field-summary', label: 'แนะนำร้าน', done: !!s.shopSummary, why: 'โชว์ในการ์ดร้าน' },
        { id: 'field-detail', label: 'รายละเอียดสินค้า', done: !!s.productDetail, why: 'บอกว่าขายอะไร' },
        { id: 'field-cover', label: 'รูปหน้าปก', done: !!s.shopCoverImage, why: 'หน้าร้านดูน่าเข้า' }
    ];
    return { checks, done: checks.filter((c) => c.done).length, total: checks.length, tags };
}

module.exports = { buildProfileChecks };
