// ลิสต์ "ประเภทสินค้าเฉพาะ" (subtype) ให้ผู้ขายเลือกตอนสมัครร้าน (shop-application)
// เอาไว้ใช้ตอนแอดมิน "จัดล็อก" (มอบสตอลล์) เพื่อเช็คไม่ให้ร้านที่ขายของซ้ำกันได้ล็อกติดกัน
// ดู utils/stallSpacing.js สำหรับ logic เช็คระยะห่าง
//
// ไม่มีรายการ "อื่นๆ" ปนอยู่ในลิสต์นี้ตั้งใจ — ฟอร์มสมัครร้านมีช่อง "อื่นๆ (ระบุ)" แยกต่างหาก
// เก็บเป็น productSubtypeOther (free text) ไม่เอาเข้ากฎเว้นระยะ เพราะพิมพ์เองเทียบ string
// กันไม่แม่น (เช่น "หมูสะเต๊ะ" vs "หมูสะเต๊ ะ" จะเทียบไม่ตรงกัน กติกาพัง)

// จัดกลุ่มเป็น optgroup ใช้แสดงในฟอร์มสมัครร้าน (checkbox หลายตัว ต่อ productType)
const PRODUCT_SUBTYPE_GROUPS = {
    FOOD: [
        {
            group: 'ของทอด',
            items: ['ลูกชิ้นทอด', 'ไก่ทอด', 'ไก่ป๊อบ', 'เกี๊ยวทอด', 'กล้วยทอด', 'มันทอด', 'เต้าหู้ทอด', 'ปาท่องโก๋', 'หมูกรอบ', 'เอ็นข้อไก่ทอด', 'โครงไก่ทอด', 'กุ้งทอดเกลือ', 'ไข่นกกระทา', 'ชีสบอล/ชีสทอด', 'แหนมทอด', 'ทอดมัน', 'เฟรนช์ฟรายส์']
        },
        {
            group: 'ปิ้งย่าง',
            items: ['หมูปิ้ง', 'ไก่ย่าง/ปีกไก่ย่าง', 'ปลาหมึกย่าง', 'ลูกชิ้นปิ้ง', 'เนื้อย่าง', 'ข้าวเหนียวกล้วยปิ้ง', 'ปิ้งย่างหม่าล่า', 'ไส้กรอกอีสาน', 'คอหมูย่าง', 'ไข่ปิ้ง', 'ข้าวจี่', 'ปลาเผาเกลือ']
        },
        {
            group: 'ยำ/ลาบ/อีสาน',
            items: ['ส้มตำ', 'ยำแซ่บ', 'ลาบ/น้ำตก', 'ตีนไก่ตุ๋นยาจีน', 'เล้งแซ่บ', 'ต้มแซ่บ', 'จิ้มจุ่ม/ชาบู']
        },
        {
            group: 'เส้น/ก๋วยเตี๋ยว',
            items: ['ก๋วยเตี๋ยว', 'บะหมี่เกี๊ยว', 'เกาเหลา', 'ก๋วยจั๊บ', 'ขนมจีนน้ำยา/น้ำเงี้ยว', 'สปาเกตตี้ขี้เมา', 'ผัดไทย', 'ราดหน้า/ผัดซีอิ๊ว', 'ยำมาม่า']
        },
        {
            group: 'ข้าว/จานเดียว',
            items: ['ข้าวมันไก่', 'ข้าวขาหมู/พะโล้', 'ข้าวหน้าเป็ด', 'ข้าวผัด/ผัดกะเพรา', 'ข้าวแกง', 'ข้าวคลุกกะปิ', 'ข้าวไข่เจียว', 'โจ๊ก', 'ข้าวไข่ข้น', 'ข้าวหมูแดง/หมูกรอบ', 'ข้าวต้ม', 'ข้าวหน้าญี่ปุ่น/แกงกะหรี่']
        },
        {
            group: 'ซีฟู้ด',
            items: ['หอยทอด', 'ปลาหมึกทอด/ย่าง/ดองซีอิ๊ว', 'กุ้งอบวุ้นเส้น', 'ปูผัดผงกะหรี่', 'กุ้งเผา']
        },
        {
            group: 'เครื่องดื่ม',
            items: ['ชานม/ชาไทย', 'กาแฟ', 'น้ำผลไม้ปั่น', 'น้ำแข็งไส/โบราณ', 'น้ำเต้าหู้', 'ชามะนาว/ชาผลไม้', 'โกโก้/นมปั่น', 'โซดาอิตาเลียน', 'น้ำมะพร้าว', 'น้ำสมุนไพร']
        },
        {
            group: 'ของหวาน/ขนม',
            items: ['ไอศกรีม', 'วาฟเฟิล/เครป', 'ขนมครก/ขนมครกสิงคโปร์', 'ขนมกุยช่าย', 'บัวลอย', 'สาคูไส้หมู', 'ขนมถ้วย', 'ข้าวเหนียวมะม่วง', 'บิงซู', 'ไดฟูกุ', 'พานาคอตต้า', 'โรตี', 'ขนมโตเกียว', 'ขนมเบื้อง', 'ปังปิ้ง/ปังเย็น', 'โดนัท/เบเกอรี่', 'สายไหม', 'ข้าวโพด/ถั่วต้ม']
        },
        {
            group: 'ผลไม้',
            items: ['ผลไม้ตัด', 'ผลไม้ดอง/แช่บ๊วย']
        },
        {
            group: 'นานาชาติ',
            items: ['ซูชิ', 'ทาโกะยากิ', 'อาหารเกาหลี', 'หมูกระทะ/skewer', 'เครปเค้กชาไทย', 'เบอร์เกอร์/แซนด์วิช', 'พิซซ่า', 'ฮอทดอก', 'สเต็ก', 'ต๊อกบกกี', 'ติ่มซำ', 'เคบับ', 'ราเมน']
        }
    ],
    FASHION: [
        {
            group: 'เสื้อผ้า',
            items: ['เสื้อยืด/เสื้อเชิ้ต', 'กางเกงขาสั้น/ขายาว', 'กระโปรง', 'ชุดเดรส', 'เสื้อผ้าเกาหลี/วินเทจ', 'ชุดกีฬา/athleisure', 'เสื้อผ้ามือสอง', 'เสื้อผ้าเด็ก', 'ชุดนอน', 'เสื้อกันหนาว/แจ็คเก็ต', 'ผ้าไหม/ผ้าทอ/ผ้าขาวม้า']
        },
        {
            group: 'รองเท้า',
            items: ['รองเท้าแตะ', 'รองเท้าผ้าใบ', 'รองเท้าส้นสูง', 'รองเท้ามือสอง', 'คัทชู/รองเท้าแฟชั่น']
        },
        {
            group: 'เครื่องประดับ',
            items: ['สร้อยคอ', 'กำไลข้อมือ', 'แหวน', 'ต่างหู', 'เครื่องประดับดีไซน์ไทย', 'กิ๊บ/ที่คาดผม', 'นาฬิกา']
        },
        {
            group: 'กระเป๋า',
            items: ['กระเป๋าผ้า', 'กระเป๋าสะพายข้าง', 'กระเป๋าสตางค์', 'กระเป๋าเป้']
        },
        {
            group: 'อุปกรณ์แต่งตัว',
            items: ['หมวกแก๊ป/หมวกสาน', 'แว่นตากันแดด', 'เข็มขัด', 'ถุงเท้า', 'ผ้าพันคอ']
        }
    ],
    // key ต้องตรงกับค่า productType ในฟอร์มสมัครร้าน (SHOP_APPLICATION_PRODUCT_TYPES ใน routes/sellerRoute.js)
    'อื่นๆ': [
        {
            group: 'ของใช้/ของแต่งบ้าน',
            items: ['ของแต่งบ้าน/ของใช้', 'ต้นไม้/กระบองเพชร', 'เครื่องเขียน']
        },
        {
            group: 'อุปกรณ์มือถือ/gadget',
            items: ['เคสมือถือ', 'หูฟัง', 'สายชาร์จ/อุปกรณ์เสริม']
        },
        {
            group: 'ความงาม',
            items: ['เครื่องสำอาง', 'สกินแคร์', 'น้ำหอม']
        },
        {
            group: 'บริการ',
            items: ['ทำเล็บ/ต่อขนตา', 'ถักเปีย', 'สักชั่วคราว/เฮนน่า', 'ดูดวง', 'ถ่ายรูป/ตู้สติกเกอร์', 'วาดภาพเหมือน']
        },
        {
            group: 'เกม/ของเล่น',
            items: ['ของเล่น', 'กาชาปอง/ตู้คีบ', 'เกมปาเป้า/ยิงลูกโป่ง', 'ตักปลา']
        },
        {
            group: 'งานคราฟต์/ของที่ระลึก',
            items: ['ของที่ระลึก', 'งานแฮนด์เมด', 'สินค้า OTOP']
        }
    ]
};

// ทุกค่าที่เลือกได้จริง (ใช้ validate ฝั่ง server กันส่งค่ามั่ว)
const ALL_PRODUCT_SUBTYPES = Object.values(PRODUCT_SUBTYPE_GROUPS)
    .flat()
    .flatMap((g) => g.items);

// ระยะห่างขั้นต่ำ (จำนวนล็อก) ที่ร้านขายสินค้าเฉพาะซ้ำกันต้องเว้นห่างกัน ตอนแอดมินจัดล็อก
// ดู utils/stallSpacing.js
const MIN_STALL_SPACING = {
    FOOD: 5,
    FASHION: 3,
    'อื่นๆ': 3
};

// ประเภทสินค้าที่มีรายการให้ติ๊ก (ตรงกับ SHOP_APPLICATION_PRODUCT_TYPES ใน routes/sellerRoute.js)
const PRODUCT_TYPE_LABELS = {
    FOOD: 'อาหาร/เครื่องดื่ม',
    FASHION: 'เสื้อผ้า/แฟชั่น',
    'อื่นๆ': 'อื่นๆ'
};

// เทียบชื่อแบบไม่สนช่องว่าง/ตัวพิมพ์ — ใช้รวมคำที่ผู้ขายพิมพ์เอง และกันแอดมินเพิ่มรายการซ้ำกับที่มีอยู่
function normalizeSubtypeKey(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, '');
}

// --- รายการที่แอดมินเพิ่มเอง (ตาราง ProductSubtypeOption, หน้า /admin/product-subtypes) ---
// zod refine ใน validationSchemas.js เป็น sync จึงเก็บไว้ใน memory แล้วโหลดใหม่ทุก 60 วินาที
// (route ที่ใช้ต้อง await loadCustomSubtypes() ก่อน) — แอดมินเพิ่ม/ซ่อนแล้วล้าง cache ทันทีด้วย invalidateCustomSubtypes()
const CUSTOM_SUBTYPE_CACHE_MS = 60 * 1000;
let customSubtypeCache = { loadedAt: 0, rows: [] };

async function loadCustomSubtypes({ force = false } = {}) {
    if (!force && Date.now() - customSubtypeCache.loadedAt < CUSTOM_SUBTYPE_CACHE_MS) {
        return customSubtypeCache.rows;
    }
    try {
        const prisma = require('../config/prismaClient');
        const rows = await prisma.productSubtypeOption.findMany({ orderBy: [{ productType: 'asc' }, { groupName: 'asc' }, { name: 'asc' }] });
        customSubtypeCache = { loadedAt: Date.now(), rows };
    } catch (error) {
        // DB ใช้ไม่ได้ชั่วคราว: ใช้ค่าเดิมใน cache ไปก่อน (รายการหลักยังใช้ได้ครบ)
        console.error('loadCustomSubtypes error:', error.message);
    }
    return customSubtypeCache.rows;
}

function invalidateCustomSubtypes() {
    customSubtypeCache = { loadedAt: 0, rows: customSubtypeCache.rows };
}

// รายการหลัก + ที่แอดมินเพิ่ม (เฉพาะที่ไม่ซ่อน) — กลุ่มชื่อเดิมต่อท้ายในกลุ่มนั้น ชื่อกลุ่มใหม่ต่อท้ายประเภท
function getProductSubtypeGroups() {
    const merged = {};
    Object.entries(PRODUCT_SUBTYPE_GROUPS).forEach(([type, groups]) => {
        merged[type] = groups.map((g) => ({ group: g.group, items: g.items.slice() }));
    });
    customSubtypeCache.rows.filter((row) => !row.isHidden).forEach((row) => {
        if (!merged[row.productType]) merged[row.productType] = [];
        let group = merged[row.productType].find((g) => g.group === row.groupName);
        if (!group) {
            group = { group: row.groupName, items: [] };
            merged[row.productType].push(group);
        }
        if (!group.items.includes(row.name)) group.items.push(row.name);
    });
    return merged;
}

// ค่าที่ส่งมาได้ — รวมรายการที่ซ่อนแล้วด้วย (ร้านที่ติ๊กไว้ก่อนซ่อนยังส่งใบสมัครใหม่ได้)
function isAllowedSubtype(value) {
    return ALL_PRODUCT_SUBTYPES.includes(value) || customSubtypeCache.rows.some((row) => row.name === value);
}

// ชื่อที่มีอยู่แล้วทั้งหมด (normalize) — ใช้เช็คว่าคำที่ผู้ขายพิมพ์เองมีในรายการแล้วหรือยัง
function getExistingSubtypeKeys() {
    return new Set([...ALL_PRODUCT_SUBTYPES, ...customSubtypeCache.rows.map((row) => row.name)].map(normalizeSubtypeKey));
}

module.exports = {
    PRODUCT_SUBTYPE_GROUPS,
    ALL_PRODUCT_SUBTYPES,
    MIN_STALL_SPACING,
    PRODUCT_TYPE_LABELS,
    normalizeSubtypeKey,
    loadCustomSubtypes,
    invalidateCustomSubtypes,
    getProductSubtypeGroups,
    isAllowedSubtype,
    getExistingSubtypeKeys
};
