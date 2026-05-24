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
 * 進階：
 *   - NOTIFY_EMAIL 設定後，每筆線索會寄通知信給 Carol
 *   - 之後要串 Notion CRM，在 appendToSheet() 後加 notion.create() 即可
 */

// ===== 設定區（請依實際情況修改） =====
const SHEET_ID = 'YOUR_SHEET_ID_HERE';         // 換成你的 Google Sheet ID
const SHEET_NAME = '線索';                      // 工作表分頁名稱（會自動建立）
const NOTIFY_EMAIL = 'carol@goodlivingnotes.com'; // 通知信收件，空字串 = 不寄
// ====================================

// 表頭欄位（變更請確保新增欄位放在最後，舊資料才不會錯位）
const HEADERS = [
  '時間戳記', 'Email', '姓名', '電話', '案型', '屋齡', '坪數', '縣市',
  '預估區間下限(萬)', '預估區間上限(萬)', '預估總價(萬)', '每坪單價(萬)',
  '信心度', '信心分數', '預算範圍', '期待預算(萬)', '入住時間',
  '屋況加成', '風格層級', '房數', '樓層數',
  '翻新衛浴', '新增衛浴', '是否含廚房', '一般窗', '落地窗',
  '大型設備', '智能家電', '結構', '上次裝修',
  '參考風格', '想避開', '設計需求', '居住成員', '收納需求', '服務範圍',
  '希望現勘', '其他備註', '認識管道', '聯絡偏好', '推薦碼',
  '地址', '照片數', '完整 JSON'
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const row = buildRow(data);
    appendToSheet(row);
    if (NOTIFY_EMAIL) sendNotification(data);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput('GLN Lead Endpoint OK. 用 POST 送資料。')
    .setMimeType(ContentService.MimeType.TEXT);
}

function buildRow(data) {
  const inp = data.inputs || {};
  const meta = inp.meta || {};
  const res = data.result || {};
  const range = res.clientRange || [null, null];
  const photoCount = Object.values(meta.photoCounts || {}).reduce((a, b) => a + b, 0);

  return [
    data.submittedAt || new Date().toISOString(),
    meta.email || '', meta.name || '', meta.phone || '',
    inp.caseType || '', inp.age || '', inp.ping || '', inp.county || '',
    range[0] || '', range[1] || '', res.total || '', res.unitPrice || '',
    res.confidence || '', res.confidenceScore || '',
    meta.budget || '', meta.budgetExpected || '', meta.moveInMonth || '',
    (inp.conditions || []).join('、'), inp.style || '', inp.rooms || '', inp.floors || '',
    inp.bathroomsRenovate || 0, inp.bathroomsNew || 0,
    inp.hasKitchen ? 'Y' : 'N',
    inp.regularWindows || 0, inp.balconyWindows || 0,
    (inp.largeEquipment || []).join('、'), inp.smartHome || '',
    meta.structure || '', meta.lastReno || '',
    (meta.styleRefs || []).join('、'), meta.styleAvoid || '',
    meta.designNeeds || '', meta.members || '', meta.storage || '', meta.serviceScope || '',
    meta.siteVisit || '', meta.notes || '',
    meta.source || '', meta.contactPref || '', meta.referral || '',
    meta.address || '', photoCount,
    JSON.stringify(data)
  ];
}

function appendToSheet(row) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#7C837B').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(row);
}

function sendNotification(data) {
  const inp = data.inputs || {};
  const meta = inp.meta || {};
  const res = data.result || {};
  const range = res.clientRange || [null, null];

  const subject = `[GLN 新線索] ${meta.name || '匿名'}・${inp.county || ''}・${inp.ping || '?'} 坪・NT$ ${range[0]}-${range[1]} 萬`;
  const body = [
    `📋 新預算分配表線索進來了`,
    ``,
    `姓名：${meta.name || ''}`,
    `Email：${meta.email || ''}`,
    `電話：${meta.phone || ''}`,
    `LINE 偏好聯絡：${meta.contactPref || ''}`,
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
