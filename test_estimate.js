/**
 * v3 estimate.js 對拍腳本
 * 對應 generate_v3_master.py §7.2 的 10 個範例
 *
 * 跑法：node test_estimate.js
 */
const fs = require('fs');
const path = require('path');

const params = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'params.json'), 'utf-8')
);
const { estimate } = require('./estimate.js');

const cases = [
  {
    name: '1. 台北客變新成屋',
    inputs: {
      caseType: 'new_house', age: 1, ping: 18, county: '台北',
      conditions: [], style: 'simple',
      rooms: 2, hasKitchen: false,
      bathroomsRenovate: 0, bathroomsNew: 0,
      regularWindows: 0, balconyWindows: 0,
      largeEquipment: [], smartHome: 'none'
    },
    expected: { unitPrice: 5.71, mainBody: 102.8, aircon: 13.5, engineeringSubtotal: 116.3,
                designFee: 10.8, total: 146, range: [139, 153], confLabel: '🟢 高' }
  },
  {
    name: '2. 新北中古大樓翻新',
    inputs: {
      caseType: 'midage', age: 18, ping: 28, county: '新北',
      conditions: [], style: 'local',
      rooms: 3, hasKitchen: true,
      bathroomsRenovate: 2, bathroomsNew: 0,
      regularWindows: 0, balconyWindows: 0,
      largeEquipment: ['water_filter'], smartHome: 'none'
    },
    expected: { unitPrice: 9.06, total: 419, range: [377, 440], confLabel: '🟡 中' }
  },
  {
    name: '3. 台北老公寓重整',
    inputs: {
      caseType: 'old_house', age: 42, ping: 25, county: '台北',
      conditions: ['leak', 'partial_demolish'], style: 'refined',
      rooms: 2, hasKitchen: true,
      bathroomsRenovate: 1, bathroomsNew: 0,
      regularWindows: 6, balconyWindows: 0,
      largeEquipment: ['hrv', 'water_filter', 'dehumidifier'], smartHome: 'basic'
    },
    expected: { unitPrice: 13.61, total: 533, range: [426, 613], confLabel: '🔴 低' }
  },
  {
    name: '4. 新竹預售客變',
    inputs: {
      caseType: 'new_house', age: 0, ping: 32, county: '新竹',
      conditions: [], style: 'local',
      rooms: 3, hasKitchen: false,
      bathroomsRenovate: 0, bathroomsNew: 0,
      regularWindows: 0, balconyWindows: 0,
      largeEquipment: [], smartHome: 'none'
    },
    expected: { unitPrice: 7.08, total: 298, range: [283, 313], confLabel: '🟢 高' }
  },
  {
    name: '5. 台中中古漏水',
    inputs: {
      caseType: 'midage', age: 22, ping: 30, county: '台中',
      conditions: ['leak'], style: 'simple',
      rooms: 3, hasKitchen: true,
      bathroomsRenovate: 2, bathroomsNew: 0,
      regularWindows: 0, balconyWindows: 0,
      largeEquipment: ['water_filter'], smartHome: 'none'
    },
    expected: { unitPrice: 6.05, total: 335, range: [318, 352], confLabel: '🟢 高' }
  },
  {
    name: '6. 高雄老屋打隔',
    inputs: {
      caseType: 'old_house', age: 30, ping: 30, county: '高雄',
      conditions: ['leak', 'partial_demolish'], style: 'local',
      rooms: 3, hasKitchen: true,
      bathroomsRenovate: 2, bathroomsNew: 0,
      regularWindows: 0, balconyWindows: 0,
      largeEquipment: [], smartHome: 'none'
    },
    expected: { unitPrice: 10.27, total: 474, range: [403, 521], confLabel: '🟠 中低' }
  },
  {
    name: '7. 台南透天老屋全翻',
    inputs: {
      caseType: 'townhouse_old', age: 38, ping: 55, county: '台南',
      conditions: ['full_demolish', 'structural'], style: 'refined',
      rooms: 4, floors: 3, hasKitchen: true,
      bathroomsRenovate: 3, bathroomsNew: 0,
      regularWindows: 7, balconyWindows: 2,
      largeEquipment: ['water_filter', 'water_softener', 'heat_pump', 'solar'],
      smartHome: 'mid'
    },
    expected: { unitPrice: 12.66, total: 1123, range: [898, 1291], confLabel: '🔴 低' }
  },
  {
    name: '8. 屏東透天老屋',
    inputs: {
      caseType: 'townhouse_old', age: 28, ping: 50, county: '屏東',
      conditions: ['leak', 'partial_demolish'], style: 'local',
      rooms: 4, floors: 2, hasKitchen: true,
      bathroomsRenovate: 3, bathroomsNew: 0,
      regularWindows: 6, balconyWindows: 1,
      largeEquipment: ['water_filter'], smartHome: 'none'
    },
    expected: { unitPrice: 10.65, total: 800, range: [640, 920], confLabel: '🔴 低' }
  },
  {
    name: '9. 澎湖老屋（套雙北）',
    inputs: {
      caseType: 'old_house', age: 25, ping: 28, county: '澎湖',
      conditions: ['leak'], style: 'simple',
      rooms: 3, hasKitchen: true,
      bathroomsRenovate: 2, bathroomsNew: 0,
      regularWindows: 4, balconyWindows: 0,
      largeEquipment: [], smartHome: 'none'
    },
    expected: { unitPrice: 8.38, total: 394, range: [355, 414], confLabel: '🟡 中' }
  },
  {
    name: '10. 桃園老公寓漏水',
    inputs: {
      caseType: 'old_house', age: 40, ping: 22, county: '桃園',
      conditions: ['leak'], style: 'local',
      rooms: 2, hasKitchen: true,
      bathroomsRenovate: 1, bathroomsNew: 0,
      regularWindows: 4, balconyWindows: 0,
      largeEquipment: ['water_filter'], smartHome: 'none'
    },
    expected: { unitPrice: 10.44, total: 356, range: [303, 392], confLabel: '🟠 中低' }
  }
];

const TOL_UNIT = 0.05;
const TOL_TOTAL = 3;
const TOL_RANGE = 5;

let pass = 0, fail = 0;
const failed = [];

console.log('\n========== v3 estimate.js 對拍 ==========\n');

for (const c of cases) {
  const r = estimate(params, c.inputs);
  const exp = c.expected;

  const checks = [
    { name: '每坪價',  got: r.unitPrice, exp: exp.unitPrice, tol: TOL_UNIT },
    { name: '總價',    got: r.total,     exp: exp.total,     tol: TOL_TOTAL }
  ];
  if (exp.range) {
    checks.push({ name: '區間下', got: r.clientRange[0], exp: exp.range[0], tol: TOL_RANGE });
    checks.push({ name: '區間上', got: r.clientRange[1], exp: exp.range[1], tol: TOL_RANGE });
  }
  if (exp.mainBody != null) checks.push({ name: '主體', got: r.mainBody, exp: exp.mainBody, tol: 1 });
  if (exp.aircon != null) checks.push({ name: '冷氣', got: r.aircon, exp: exp.aircon, tol: 0.5 });
  if (exp.engineeringSubtotal != null) checks.push({ name: '工程小計', got: r.engineeringSubtotal, exp: exp.engineeringSubtotal, tol: 2 });
  if (exp.designFee != null) checks.push({ name: '設計費', got: r.designFee, exp: exp.designFee, tol: 0.5 });

  const ok = checks.every(ch => Math.abs(ch.got - ch.exp) <= ch.tol);
  const confOk = !exp.confLabel || r.confidence.label === exp.confLabel;

  if (ok && confOk) {
    pass++;
    console.log(`✅ ${c.name}`);
    console.log(`   每坪 ${r.unitPrice}（exp ${exp.unitPrice}）｜總價 ${r.total}（exp ${exp.total}）｜區間 ${r.clientRange[0]}-${r.clientRange[1]} ${r.confidence.label}`);
  } else {
    fail++;
    failed.push(c.name);
    console.log(`❌ ${c.name}`);
    console.log(`   每坪 ${r.unitPrice}（exp ${exp.unitPrice}）｜總價 ${r.total}（exp ${exp.total}）`);
    console.log(`   區間 ${r.clientRange[0]}-${r.clientRange[1]}（exp ${exp.range?.[0]}-${exp.range?.[1]}）`);
    console.log(`   信心度 ${r.confidence.label}（exp ${exp.confLabel}）｜分 ${r.confidence.score}`);
    checks.filter(ch => Math.abs(ch.got - ch.exp) > ch.tol).forEach(ch => {
      console.log(`     ↳ ${ch.name}：got ${ch.got}, exp ${ch.exp}, diff ${(ch.got - ch.exp).toFixed(2)}`);
    });
  }
}

console.log(`\n========== 結果：${pass} / ${cases.length} pass ==========`);
if (fail > 0) {
  console.log(`失敗案例：${failed.join(', ')}`);
  process.exit(1);
}
