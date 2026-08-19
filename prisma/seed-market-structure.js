const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PRODUCT_TYPES = [
  { code: 'FASHION', name: 'Fashion', displayOrder: 1 },
  { code: 'FOOD', name: 'Food', displayOrder: 2 },
  { code: 'EVENT_BOOTH', name: 'Event Booth', displayOrder: 3 }
];

const ZONE_DEFINITIONS = [
  {
    code: 'A',
    name: 'Zone A',
    description: 'Fashion + Food',
    productCategory: 'FASHION',
    productTypes: ['FASHION', 'FOOD'],
    size: '2x2',
    basePrice: 150,
    displayOrder: 1,
    rows: [
      { rowCode: 'A1', start: 101, end: 119 },
      { rowCode: 'A2', start: 201, end: 219 },
      { rowCode: 'A3', start: 301, end: 319 },
      { rowCode: 'A4', start: 401, end: 421 },
      { rowCode: 'A5', start: 501, end: 521 },
      { rowCode: 'A6', start: 601, end: 622 },
      { rowCode: 'A7', start: 701, end: 722 },
      { rowCode: 'A8', start: 801, end: 823 },
      { rowCode: 'A9', start: 901, end: 923 }
    ]
  },
  {
    code: 'B',
    name: 'Zone B',
    description: 'Food',
    productCategory: 'FOOD',
    productTypes: ['FOOD'],
    size: '3x3',
    basePrice: 180,
    displayOrder: 2,
    rows: [
      { rowCode: 'B100', start: 100, end: 100 },
      { rowCode: 'B1', start: 101, end: 123 },
      { rowCode: 'B200', start: 200, end: 200 },
      { rowCode: 'B2', start: 201, end: 223 },
      { rowCode: 'B299', start: 299, end: 299 },
      { rowCode: 'B300', start: 300, end: 300 },
      { rowCode: 'B3', start: 301, end: 323 },
      { rowCode: 'B4', start: 401, end: 423 },
      { rowCode: 'B5', start: 501, end: 523 },
      { rowCode: 'B6', start: 601, end: 623 },
      { rowCode: 'B7', start: 701, end: 715 }
    ]
  },
  {
    code: 'C',
    name: 'Zone C',
    description: 'Fashion',
    productCategory: 'FASHION',
    productTypes: ['FASHION'],
    size: '3x3',
    basePrice: 200,
    displayOrder: 3,
    rows: [{ rowCode: 'C1', start: 101, end: 112 }]
  },
  {
    code: 'D',
    name: 'Zone D',
    description: 'Food',
    productCategory: 'FOOD',
    productTypes: ['FOOD'],
    size: '4x3',
    basePrice: 250,
    displayOrder: 4,
    rows: [{ rowCode: 'D2', start: 201, end: 212 }]
  },
  {
    code: 'E',
    name: 'Zone E',
    description: 'Fashion',
    productCategory: 'FASHION',
    productTypes: ['FASHION'],
    size: '2x2',
    basePrice: 200,
    displayOrder: 5,
    rows: [{ rowCode: 'E1', start: 101, end: 104 }]
  },
  {
    code: 'F',
    name: 'Zone F',
    description: 'Food',
    productCategory: 'FOOD',
    productTypes: ['FOOD'],
    size: '3x3',
    basePrice: 180,
    displayOrder: 6,
    rows: [
      { rowCode: 'F1', start: 101, end: 117 },
      { rowCode: 'F2', start: 201, end: 217 },
      { rowCode: 'F3', start: 301, end: 334 },
      { rowCode: 'F4', start: 401, end: 434 },
      { rowCode: 'F5', start: 501, end: 536 },
      { rowCode: 'F6', start: 601, end: 636 }
    ]
  },
  {
    code: 'X',
    name: 'Zone X',
    description: 'Event Booth',
    productCategory: 'EVENT_BOOTH',
    productTypes: ['EVENT_BOOTH'],
    size: '4x4',
    basePrice: 300,
    displayOrder: 7,
    rows: [{ rowCode: 'X1', start: 101, end: 106 }]
  }
];

const PINK_RULE_TOKENS = [
  'A101', 'A102', 'A118', 'A119', 'A201', 'A202', 'A218', 'A219', 'A401', 'A402', 'A420', 'A421',
  'A501', 'A502', 'A520', 'A522', 'A601', 'A602', 'A701', 'A702', 'A721', 'A722', 'A801', 'A901',
  'A823', 'A923', 'F101', 'F201', 'F301', 'F401', 'F501', 'F601', 'B100', 'B123', 'F434', 'F536'
];

const YELLOW_RULE_TOKENS = ['E101-E104', 'C101-C112', 'F117', 'F217', 'F320-F334'];

const BLUE_RULE_TOKENS = [
  'A802', 'A822', 'A902-A922', 'F102', 'F116', 'F202', 'F216', 'F302', 'F402', 'F502', 'F602', 'B101', 'B122'
];

const ELECTRIC_DEVICES = [
  { deviceName: 'Small Blender', defaultDailyFee: 20 },
  { deviceName: 'Toaster', defaultDailyFee: 20 },
  { deviceName: 'Electric Stove', defaultDailyFee: 40 },
  { deviceName: 'Freezer', defaultDailyFee: 40 }
];

function parseSize(sizeText) {
  const [widthText, heightText] = String(sizeText || '2x2').split('x');
  const width = Number.parseInt(widthText, 10);
  const height = Number.parseInt(heightText, 10);
  return {
    width: Number.isFinite(width) ? width : 2,
    height: Number.isFinite(height) ? height : 2
  };
}

function expandStallTokens(tokens) {
  const expanded = [];

  for (const token of tokens) {
    const normalized = String(token || '').trim().toUpperCase();
    if (!normalized) continue;

    if (!normalized.includes('-')) {
      expanded.push(normalized);
      continue;
    }

    const [startCode, endCode] = normalized.split('-').map((part) => String(part || '').trim().toUpperCase());
    const startPrefix = startCode.charAt(0);
    const endPrefix = endCode.charAt(0);
    const startNumber = Number.parseInt(startCode.slice(1), 10);
    const endNumber = Number.parseInt(endCode.slice(1), 10);

    if (!startPrefix || startPrefix !== endPrefix || !Number.isFinite(startNumber) || !Number.isFinite(endNumber)) {
      continue;
    }

    for (let number = startNumber; number <= endNumber; number += 1) {
      expanded.push(`${startPrefix}${number}`);
    }
  }

  return expanded;
}

async function seedProductTypes() {
  const productTypeMap = new Map();

  for (const productType of PRODUCT_TYPES) {
    const row = await prisma.productType.upsert({
      where: { code: productType.code },
      update: {
        name: productType.name,
        displayOrder: productType.displayOrder,
        isActive: true
      },
      create: {
        code: productType.code,
        name: productType.name,
        displayOrder: productType.displayOrder,
        isActive: true
      }
    });

    productTypeMap.set(productType.code, row.id);
  }

  return productTypeMap;
}

async function seedZonesAndRows(productTypeMap) {
  const zoneIdMap = new Map();

  for (const zoneDef of ZONE_DEFINITIONS) {
    const zone = await prisma.zone.upsert({
      where: { code: zoneDef.code },
      update: {
        name: zoneDef.name,
        description: zoneDef.description,
        productCategory: zoneDef.productCategory,
        size: zoneDef.size,
        displayOrder: zoneDef.displayOrder,
        defaultStallWidth: parseSize(zoneDef.size).width,
        defaultStallHeight: parseSize(zoneDef.size).height,
        electricityFee: 15
      },
      create: {
        code: zoneDef.code,
        name: zoneDef.name,
        description: zoneDef.description,
        productCategory: zoneDef.productCategory,
        size: zoneDef.size,
        displayOrder: zoneDef.displayOrder,
        defaultStallWidth: parseSize(zoneDef.size).width,
        defaultStallHeight: parseSize(zoneDef.size).height,
        electricityFee: 15
      }
    });

    zoneIdMap.set(zoneDef.code, zone.id);

    await prisma.zoneProductType.deleteMany({ where: { zoneId: zone.id } });
    if (zoneDef.productTypes.length) {
      await prisma.zoneProductType.createMany({
        data: zoneDef.productTypes.map((productTypeCode) => ({
          zoneId: zone.id,
          productTypeId: productTypeMap.get(productTypeCode)
        })),
        skipDuplicates: true
      });
    }

    await prisma.zoneRow.deleteMany({ where: { zoneId: zone.id } });

    for (let rowIndex = 0; rowIndex < zoneDef.rows.length; rowIndex += 1) {
      const rowDef = zoneDef.rows[rowIndex];
      await prisma.zoneRow.create({
        data: {
          zoneId: zone.id,
          rowCode: rowDef.rowCode,
          label: `Row ${rowDef.rowCode}`,
          price: zoneDef.basePrice,
          size: zoneDef.size,
          displayOrder: rowIndex + 1,
          stallStartNumber: rowDef.start,
          stallEndNumber: rowDef.end
        }
      });
    }
  }

  return zoneIdMap;
}

async function seedStalls() {
  const rows = await prisma.zoneRow.findMany({
    include: {
      zone: {
        select: {
          code: true,
          size: true,
          electricityFee: true
        }
      }
    },
    orderBy: [{ zoneId: 'asc' }, { displayOrder: 'asc' }]
  });

  const createdStallCodes = [];

  for (const row of rows) {
    await prisma.stall.deleteMany({ where: { rowId: row.id } });

    const { width, height } = parseSize(row.size || row.zone.size);
    const start = Number(row.stallStartNumber || 0);
    const end = Number(row.stallEndNumber || 0);
    if (!start || !end || end < start) {
      continue;
    }

    const stallRows = [];
    for (let number = start; number <= end; number += 1) {
      const stallCode = `${row.zone.code}${number}`;
      createdStallCodes.push(stallCode);
      stallRows.push({
        rowId: row.id,
        stallCode,
        isAvailable: true,
        status: 'AVAILABLE',
        width,
        height,
        basePrice: row.price,
        extraPrice: 0,
        displayOrder: number,
        electricFeePerDay: Number(row.zone.electricityFee || 15)
      });
    }

    if (stallRows.length) {
      await prisma.stall.createMany({
        data: stallRows,
        skipDuplicates: true
      });
    }
  }

  return new Set(createdStallCodes);
}

async function applyStallPriceRules(availableStallCodes) {
  await prisma.stallPriceRule.deleteMany({});

  const rules = [
    { type: 'PINK', amount: 69, codes: expandStallTokens(PINK_RULE_TOKENS) },
    { type: 'YELLOW', amount: 89, codes: expandStallTokens(YELLOW_RULE_TOKENS) },
    { type: 'BLUE', amount: 29, codes: expandStallTokens(BLUE_RULE_TOKENS) }
  ];

  const missingCodes = [];
  const codeRuleMap = new Map();

  for (const rule of rules) {
    for (const stallCode of rule.codes) {
      if (!availableStallCodes.has(stallCode)) {
        missingCodes.push(stallCode);
        continue;
      }

      codeRuleMap.set(stallCode, rule);
    }
  }

  const targetCodes = Array.from(codeRuleMap.keys());
  const stalls = targetCodes.length
    ? await prisma.stall.findMany({
        where: { stallCode: { in: targetCodes } },
        select: { id: true, stallCode: true }
      })
    : [];

  const priceRuleRows = [];
  const updateOps = [];

  for (const stall of stalls) {
    const rule = codeRuleMap.get(stall.stallCode);
    if (!rule) continue;

    priceRuleRows.push({
      stallId: stall.id,
      ruleType: rule.type,
      extraAmount: rule.amount,
      note: `Auto seeded ${rule.type} pricing`
    });

    updateOps.push(
      prisma.stall.update({
        where: { id: stall.id },
        data: { extraPrice: rule.amount }
      })
    );
  }

  if (priceRuleRows.length) {
    await prisma.stallPriceRule.createMany({ data: priceRuleRows });
  }
  if (updateOps.length) {
    await prisma.$transaction(updateOps);
  }

  if (missingCodes.length) {
    console.warn('Price rules skipped for missing stall codes:', missingCodes.join(', '));
  }
}

async function seedElectricDevices() {
  for (const device of ELECTRIC_DEVICES) {
    await prisma.electricDevice.upsert({
      where: { deviceName: device.deviceName },
      update: {
        defaultDailyFee: device.defaultDailyFee,
        isActive: true
      },
      create: {
        deviceName: device.deviceName,
        defaultDailyFee: device.defaultDailyFee,
        isActive: true
      }
    });
  }
}

async function main() {
  console.log('Seeding market structure...');

  const productTypeMap = await seedProductTypes();
  console.log('Product types seeded');
  await seedZonesAndRows(productTypeMap);
  console.log('Zones and rows seeded');
  const availableStallCodes = await seedStalls();
  console.log('Stalls seeded');
  await applyStallPriceRules(availableStallCodes);
  console.log('Stall price rules seeded');
  await seedElectricDevices();
  console.log('Electric devices seeded');

  console.log(`Seeded ${ZONE_DEFINITIONS.length} zones and ${availableStallCodes.size} stalls.`);
}

main()
  .catch((error) => {
    console.error('Market structure seed failed');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
