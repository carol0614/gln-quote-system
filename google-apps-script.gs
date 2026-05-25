/**
 * GLN 預算分配表 — 線索接收 Web App
 * --------------------------------------------------------
 * 部署方式：
 *   1. 開新 Google Sheet，命名「GLN_預算分配表_線索」
 *   2. 工具 → 指令碼編輯器，貼入本檔全部程式碼
 *   3. 上方腳本屬性將 SHEET_ID 換成你的 Sheet ID（URL 中 /d/ 後面那段）
 *   4. 部署 → 新增部署作業 → 類型「網頁應用程式」
 *      - 執行身分：我（carol@goodlivingnotes.com）
 *      - 存取權：任何人（不需登入）
 *   5. 複製產生的 Web App URL → 貼到 web/config.json 的 leadEndpoint
 *   6. 第一次提交時會自動建表頭，後續每筆 append 一列
 *
 * 月報自動化：
 *   執行 setupMonthlyTrigger() 一次，之後每月 1 日早上 9 點
 *   自動產生上月統計 → 寫入「月報統計」分頁 + Email Carol
 */

// ===== 設定區（請依實際情況修改） =====
const SHEET_ID           = '1KA6ykh3QmmGggudtqkcZ1mN6mrb1q8rEU5N6euIltTw';
const SHEET_NAME         = '線索';          // 主站完整表單
const LANDING_SHEET_NAME = '落地頁診斷';   // 落地頁簡短診斷
const STATS_SHEET_NAME   = '月報統計';     // 每月自動寫入
const NOTIFY_EMAIL       = 'carol@goodlivingnotes.com';
// ====================================

// 主站完整表單表頭
// ⚠️ 新欄位請加在「完整 JSON」之前（最末），勿插中間以免錯位既有資料
const HEADERS = [
  '時間戳記', 'Email', '姓名', '電話', '案型', '屋齡', '坪數', '縣市',
  '預估區間下限(萬)', '預估區間上限(萬)', '預估總價(萬)', '每坪單價(萬)',
  '信心度', '信心分數', '期待預算(萬)', '預算彈性', '開工月', '入住時間',
  '屋況加成', '風格層級', '房數', '樓層數', '陽台數',
  '翻新衛浴', '新增衛浴', '是否含廚房', '一般窗', '落地窗',
  '大型設備', '智能家電', '上次裝修',
  '喜歡/必要的元素', '想避開', '設計需求', '居住成員', '收納需求', '服務範圍',
  '希望現勘', '其他備註', '認識管道', '聯絡偏好', '推薦碼',
  '地址', '照片數', 'LINE ID', '完整 JSON'
];

// 落地頁診斷表頭
const LANDING_HEADERS = [
  '時間戳記', '來源', '坪數', '屋齡', '房屋形態', '縣市',
  '最焦慮的事', '預計搬入', '預算帶',
  '粗估區間下限(萬)', '粗估區間上限(萬)'
];

// 中文對照表
const WORRY_LABELS = {
  budget:        '超出預算',
  timeline:      '工程延誤',
  communication: '設計師溝通不良',
  quality:       '基礎工程品質看不出來',
  noresponse:    '出問題找不到人',
  hidden:        '住進去後才發現問題'
};
const MOVEIN_LABELS = {
  '3m':  '3 個月內',
  '6m':  '3–6 個月',
  '12m': '6–12 個月',
  '1y+': '1 年以上'
};
const BUDGET_LABELS = {
  'under100': '100 萬以下',
  '100-200':  '100–200 萬',
  '200-400':  '200–400 萬',
  '400-600':  '400–600 萬',
  '600plus':  '600 萬以上'
};
const FORM_LABELS = {
  'community':        '社區大樓',
  'apartment':        '公寓',
  'elevator-mansion': '電梯華廈',
  'rural':            '平房/三合院',
  'row-townhouse':    '連排透天',
  'detached-villa':   '獨棟透天',
  'commercial':       '商業空間',
  'self-build':       '自地自建'
};

// ────────────────────────────────────────────────
// 路由入口
// ────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.source === 'landing') {
      return handleLandingLead(data);
    }
    // 主站完整表單
    const row = buildRow(data);
    appendToSheet(row, SHEET_NAME, HEADERS, '#7C837B');
    if (NOTIFY_EMAIL) sendNotification(data);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResp({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService
    .createTextOutput('GLN Lead Endpoint OK. 用 POST 送資料。')
    .setMimeType(ContentService.MimeType.TEXT);
}

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────
// 落地頁診斷接收
// ────────────────────────────────────────────────
function handleLandingLead(data) {
  const row = [
    data.submittedAt || new Date().toISOString(),
    'landing',
    data.ping  || '',
    data.age   || '',
    FORM_LABELS[data.houseForm]  || data.houseForm  || '',
    data.county || '',
    WORRY_LABELS[data.worry]     || data.worry      || '',
    MOVEIN_LABELS[data.moveIn]   || data.moveIn     || '',
    BUDGET_LABELS[data.budget]   || data.budget     || '',
    data.quoteLow  !== null ? data.quoteLow  : '',
    data.quoteHigh !== null ? data.quoteHigh : ''
  ];
  appendToSheet(row, LANDING_SHEET_NAME, LANDING_HEADERS, '#A87D5A');
  return jsonResp({ ok: true });
}

// ────────────────────────────────────────────────
// 主站完整表單處理
// ────────────────────────────────────────────────
function buildRow(data) {
  const inp  = data.inputs || {};
  const meta = inp.meta   || {};
  const res  = data.result || {};
  const range = res.clientRange || [null, null];
  const photoCount = Object.values(meta.photoCounts || {}).reduce((a, b) => a + b, 0);

  return [
    data.submittedAt || new Date().toISOString(),
    meta.email || '', meta.name || '', meta.phone || '',
    inp.caseType || '', inp.age || '', inp.ping || '', inp.county || '',
    range[0] || '', range[1] || '', res.total || '', res.unitPrice || '',
    res.confidence || '', res.confidenceScore || '',
    meta.budgetExpected || '', meta.budgetFlex || '',
    meta.startMonth || '', meta.moveInMonth || '',
    (inp.conditions || []).join('、'), inp.style || '',
    inp.rooms || '', inp.floors || '', inp.balconies || 0,
    inp.bathroomsRenovate || 0, inp.bathroomsNew || 0,
    inp.hasKitchen ? 'Y' : 'N',
    inp.regularWindows || 0, inp.balconyWindows || 0,
    (inp.largeEquipment || []).join('、'), inp.smartHome || '',
    meta.lastReno || '',
    meta.styleElements || '', meta.styleAvoid || '',
    meta.designNeeds || '', meta.members || '', meta.storage || '', meta.serviceScope || '',
    meta.siteVisit || '', meta.notes || '',
    meta.source || '', meta.contactPref || '', meta.referral || '',
    meta.address || '', photoCount, meta.lineId || '',
    JSON.stringify(data)
  ];
}

// ────────────────────────────────────────────────
// Sheet 寫入（共用）
// ────────────────────────────────────────────────
function appendToSheet(row, sheetName, headers, headerColor) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  ensureHeaders(sheet, headers, headerColor || '#7C837B');
  sheet.appendRow(row);
}

function ensureHeaders(sheet, headers, headerColor) {
  const applyStyle = () => {
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground(headerColor)
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  };
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    applyStyle();
    return;
  }
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  if (!headers.every((h, i) => h === current[i])) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    applyStyle();
  }
}

// ────────────────────────────────────────────────
// 通知信（主站完整表單用）
// ────────────────────────────────────────────────
function sendNotification(data) {
  const inp  = data.inputs || {};
  const meta = inp.meta   || {};
  const res  = data.result || {};
  const range = res.clientRange || [null, null];

  const subject = `[GLN 新線索] ${meta.name || '匿名'}・${inp.county || ''}・${inp.ping || '?'} 坪・NT$ ${range[0]}-${range[1]} 萬`;
  const body = [
    `📋 新預算分配表線索進來了`,
    ``,
    `姓名：${meta.name || ''}`,
    `Email：${meta.email || ''}`,
    `電話：${meta.phone || ''}`,
    `LINE ID：${meta.lineId || '（未填，後續主動引導加好友）'}`,
    `偏好聯絡：${meta.contactPref || ''}`,
    ``,
    `案型：${inp.caseType || ''}（屋齡 ${inp.age || ''} 年）`,
    `坪數：${inp.ping || ''}`,
    `縣市：${inp.county || ''}`,
    `地址：${meta.address || ''}`,
    ``,
    `估價區間：NT$ ${range[0]} – ${range[1]} 萬`,
    `預估總價：NT$ ${res.total} 萬`,
    `每坪單價：${res.unitPrice} 萬`,
    `信心度：${res.confidence}（分數 ${res.confidenceScore}）`,
    ``,
    `客戶期待預算：${meta.budgetExpected || '未填'} 萬`,
    `入住時間：${meta.moveInMonth || '未填'}`,
    `設計需求：${meta.designNeeds || '未填'}`,
    ``,
    `→ Sheet 內全部欄位請查：https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`
  ].join('\n');

  MailApp.sendEmail({ to: NOTIFY_EMAIL, subject, body });
}

// ────────────────────────────────────────────────
// 月報統計（每月 1 日 09:00 自動執行）
// ────────────────────────────────────────────────

/**
 * 執行一次 setupMonthlyTrigger() 即可設定每月自動觸發。
 * 之後每月 1 日早上 9 點自動跑 generateMonthlyStats()。
 */
function setupMonthlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'generateMonthlyStats') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('generateMonthlyStats')
    .timeBased()
    .onMonthDay(1)
    .atHour(9)
    .create();
  Logger.log('月報觸發器已建立：每月 1 日 09:00 執行 generateMonthlyStats()');
}

/**
 * 統計上個月的落地頁診斷資料，寫入「月報統計」分頁 + Email Carol。
 * 可手動執行測試。
 */
function generateMonthlyStats() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const landingSheet = ss.getSheetByName(LANDING_SHEET_NAME);
  if (!landingSheet || landingSheet.getLastRow() < 2) {
    Logger.log('落地頁診斷 sheet 無資料，略過月報');
    return;
  }

  // 計算上個月的起訖
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthLabel = Utilities.formatDate(firstOfLastMonth, 'Asia/Taipei', 'yyyy-MM');

  // 讀取落地頁診斷資料（跳過表頭）
  const allData = landingSheet.getRange(
    2, 1, landingSheet.getLastRow() - 1, LANDING_HEADERS.length
  ).getValues();

  // 篩選上個月資料
  const lastMonthRows = allData.filter(row => {
    const ts = new Date(row[0]);
    return ts >= firstOfLastMonth && ts < firstOfThisMonth;
  });

  const total = lastMonthRows.length;
  if (total === 0) {
    Logger.log(`${monthLabel} 無落地頁資料，略過月報`);
    return;
  }

  // 聚合函式
  function countBy(rows, colIndex) {
    const map = {};
    rows.forEach(r => {
      const v = String(r[colIndex] || '未填');
      map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }
  function rankText(entries, total) {
    return entries.map(([k, v]) => `  ${k}：${v} 筆（${Math.round(v / total * 100)}%）`).join('\n');
  }

  // 各維度統計（欄位索引依 LANDING_HEADERS）
  // 0:時間戳記 1:來源 2:坪數 3:屋齡 4:房屋形態 5:縣市
  // 6:最焦慮的事 7:預計搬入 8:預算帶 9:下限 10:上限
  const worryRank  = countBy(lastMonthRows, 6);
  const formRank   = countBy(lastMonthRows, 4);
  const countyRank = countBy(lastMonthRows, 5);
  const moveInRank = countBy(lastMonthRows, 7);
  const budgetRank = countBy(lastMonthRows, 8);

  // 平均坪數
  const pings  = lastMonthRows.map(r => parseFloat(r[2])).filter(n => !isNaN(n));
  const avgPing = pings.length ? (pings.reduce((a, b) => a + b, 0) / pings.length).toFixed(1) : '-';

  // 寫入月報統計 sheet
  const statsSheet = ss.getSheetByName(STATS_SHEET_NAME) || ss.insertSheet(STATS_SHEET_NAME);
  const statsHeaders = [
    '月份', '總筆數', '平均坪數',
    '#1 焦慮', '#2 焦慮', '#3 焦慮',
    '焦慮完整分布', '房屋形態分布', '縣市分布', '搬入急迫度', '預算帶分布'
  ];
  ensureHeaders(statsSheet, statsHeaders, '#5F6560');

  const top3worry = worryRank.slice(0, 3).map(([k]) => k);
  statsSheet.appendRow([
    monthLabel, total, avgPing,
    top3worry[0] || '', top3worry[1] || '', top3worry[2] || '',
    worryRank.map(([k, v])  => `${k}:${v}`).join(' / '),
    formRank.map(([k, v])   => `${k}:${v}`).join(' / '),
    countyRank.map(([k, v]) => `${k}:${v}`).join(' / '),
    moveInRank.map(([k, v]) => `${k}:${v}`).join(' / '),
    budgetRank.map(([k, v]) => `${k}:${v}`).join(' / ')
  ]);

  // Email Carol
  if (NOTIFY_EMAIL) {
    const top1worry = worryRank[0]
      ? `${worryRank[0][0]}（${Math.round(worryRank[0][1] / total * 100)}%）`
      : '-';
    const subject = `[GLN 落地頁月報] ${monthLabel}｜共 ${total} 筆｜最焦慮：${top1worry}`;
    const body = [
      `📊 GLN 落地頁診斷月報 — ${monthLabel}`,
      ``,
      `總收到筆數：${total} 筆`,
      `平均坪數：${avgPing} 坪`,
      ``,
      `🔥 焦慮排行（行銷題材）`,
      rankText(worryRank, total),
      ``,
      `🏠 房屋形態分布`,
      rankText(formRank, total),
      ``,
      `📍 縣市分布`,
      rankText(countyRank, total),
      ``,
      `⏰ 搬入急迫度`,
      rankText(moveInRank, total),
      ``,
      `💰 預算帶分布`,
      rankText(budgetRank, total),
      ``,
      `→ 完整資料：https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`
    ].join('\n');

    MailApp.sendEmail({ to: NOTIFY_EMAIL, subject, body });
    Logger.log(`月報 Email 已寄出：${subject}`);
  }
}

// ────────────────────────────────────────────────
// 一鍵建立／重建「摘要」分頁（含 3 個自動分級欄位）
// 使用方式：在 Apps Script 編輯器選此函式 → 按「執行」→ 授權 → 完成
// ────────────────────────────────────────────────
function setupSummarySheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('摘要');
  if (!sheet) {
    sheet = ss.insertSheet('摘要', 0);
  } else {
    sheet.clear();
    sheet.clearConditionalFormatRules();
  }

  // ① 基礎資料 QUERY（A1，拉 15 欄含分級用的隱性欄位）
  const queryFormula = '=QUERY({\'線索\'!A:AS}, "SELECT Col1, Col3, Col4, Col45, Col5, Col43, Col34, Col6, Col7, Col11, Col15, Col9, Col18, Col19, Col39 WHERE Col1 IS NOT NULL ORDER BY Col1 DESC LABEL Col1 \'時間\', Col3 \'姓名\', Col4 \'電話\', Col45 \'LINE ID\', Col5 \'案型\', Col43 \'建案/地址\', Col34 \'設計需求\', Col6 \'屋齡\', Col7 \'坪數\', Col11 \'預估總價(萬)\', Col15 \'期待預算(萬)\', Col9 \'估價下限(萬)\', Col18 \'入住月\', Col19 \'屋況加成\', Col39 \'備註\'", 1)';
  sheet.getRange('A1').setFormula(queryFormula);

  // ② 紅旗計數（P1）— 結構/管線、期待 vs 風險、期程壓縮 三項可自動判斷
  const flagFormula = '={"🚩 紅旗"; ARRAYFORMULA(IF(A2:A="", "", IF(REGEXMATCH(N2:N&"", "full_demolish|structural"), 1, 0) + IF((K2:K>0)*(L2:L>0)*(K2:K<L2:L*0.8), 1, 0) + IF((M2:M<>"")*(IFERROR(DATEVALUE(M2:M&"-01"), 0)-TODAY()<180)*(IFERROR(DATEVALUE(M2:M&"-01"), 0)-TODAY()>0), 1, 0)))}';
  sheet.getRange('P1').setFormula(flagFormula);

  // ③ 分級（Q1）— 依 2026 目標客戶分級表
  const gradeFormula = '={"🎯 分級"; ARRAYFORMULA(IF(A2:A="", "", IF(J2:J>=1000, "🚨 必轉 Carol", IF(((E2:E="new_house")*(J2:J<100))+(((E2:E<>"new_house")*(E2:E<>""))*(J2:J<150))>=1, "D 轉 GLV", IF(J2:J<400, "C 訓練組", IF(P2:P>=2, "B 必轉設計總監", IF(J2:J>=700, "A+ 頂級", "A 主力")))))))}';
  sheet.getRange('Q1').setFormula(gradeFormula);

  // ④ 建議行動（R1）
  const actionFormula = '={"🚦 建議行動"; ARRAYFORMULA(IF(A2:A="", "", IF(Q2:Q="🚨 必轉 Carol", "Carol／Hank 24h 內親自聯絡", IF(Q2:Q="B 必轉設計總監", "設計總監 + Carol 預先過案", IF(Q2:Q="A+ 頂級", "主力設計師 24h 內接洽 + 預約丈量", IF(Q2:Q="A 主力", "主力設計師 48h 內接洽", IF(Q2:Q="C 訓練組", "訓練組設計師 72h 內接洽", IF(Q2:Q="D 轉 GLV", "婉拒並推 GLV 系統櫃方案", "—"))))))))}';
  sheet.getRange('R1').setFormula(actionFormula);

  // 標題列樣式
  sheet.setFrozenRows(1);
  sheet.getRange('A1:R1').setFontWeight('bold').setBackground('#7C837B').setFontColor('#FFFFFF');

  // 條件式格式（依分級整列染色）
  const formatRange = sheet.getRange('A2:R1000');
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$Q2="🚨 必轉 Carol"').setBackground('#FFCDD2').setRanges([formatRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$Q2="B 必轉設計總監"').setBackground('#FFE0B2').setRanges([formatRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$Q2="A+ 頂級"').setBackground('#C8E6C9').setRanges([formatRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$Q2="A 主力"').setBackground('#E8F5E9').setRanges([formatRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$Q2="C 訓練組"').setBackground('#E3F2FD').setRanges([formatRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$Q2="D 轉 GLV"').setBackground('#F5F5F5').setRanges([formatRange]).build()
  ];
  sheet.setConditionalFormatRules(rules);

  // 自動調整欄寬
  sheet.autoResizeColumns(1, 18);

  Logger.log('✅ 摘要分頁建立完成');
}
