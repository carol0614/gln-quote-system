/**
 * GLN 線上估價系統 — 前端邏輯 v3.3
 * 對應 estimate.js v3.3 + params.json v3.3
 */

(function () {
  'use strict';

  // ────────────────────────────────────────────────
  // 載入係數參數
  // ────────────────────────────────────────────────
  let PARAMS = null;
  fetch('params.json')
    .then(r => r.json())
    .then(json => { PARAMS = json; })
    .catch(err => {
      console.error('[GLN] 載入 params.json 失敗：', err);
      alert('系統參數載入失敗，請重新整理頁面。');
    });

  // ────────────────────────────────────────────────
  // 平滑跳轉
  // ────────────────────────────────────────────────
  document.querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.jump);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ────────────────────────────────────────────────
  // 進階模式：分頁導航
  // ────────────────────────────────────────────────
  const fullForm = document.getElementById('form-full');
  const steps = fullForm.querySelectorAll('.step');
  const totalSteps = steps.length;
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  let currentStep = 1;

  function updateProgress() {
    progressBar.style.width = (currentStep / totalSteps * 100) + '%';
    progressLabel.textContent = `第 ${currentStep} / ${totalSteps} 區塊`;
  }

  function showStep(n) {
    steps.forEach(s => s.classList.remove('active'));
    const target = fullForm.querySelector(`.step[data-step="${n}"]`);
    if (target) {
      target.classList.add('active');
      currentStep = n;
      updateProgress();
      document.getElementById('mode-full').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function validateStep(n) {
    const step = fullForm.querySelector(`.step[data-step="${n}"]`);
    if (!step) return true;

    // radio：name 相同的群組，至少一個 checked
    const radioGroups = new Set();
    step.querySelectorAll('input[type="radio"][required]').forEach(r => radioGroups.add(r.name));
    for (const name of radioGroups) {
      const checked = step.querySelector(`input[name="${name}"]:checked`);
      if (!checked) {
        const first = step.querySelector(`input[name="${name}"]`);
        if (first) {
          first.focus();
          const card = first.closest('.case-card, .style-card');
          if (card) {
            card.style.boxShadow = '0 0 0 2px #C67D5A';
            setTimeout(() => { card.style.boxShadow = ''; }, 2000);
          }
        }
        return false;
      }
    }

    // 其他必填
    const requiredFields = step.querySelectorAll('[required]:not([type="radio"])');
    for (const field of requiredFields) {
      if (!field.value) {
        field.focus();
        field.style.borderColor = '#C67D5A';
        setTimeout(() => { field.style.borderColor = ''; }, 2000);
        return false;
      }
    }
    return true;
  }

  fullForm.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!validateStep(currentStep)) return;
      if (currentStep < totalSteps) showStep(currentStep + 1);
    });
  });
  fullForm.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 1) showStep(currentStep - 1);
    });
  });

  // ────────────────────────────────────────────────
  // 廚衛自動鎖定（v3：屋齡 < 15 強制 N；新成屋一律 N）
  // ────────────────────────────────────────────────
  function autoLockKitchenByAge() {
    const caseType = fullForm.querySelector('input[name="caseType"]:checked')?.value;
    const age = parseInt(fullForm.age.value, 10);
    const kitchenYes = fullForm.querySelector('input[name="kitchen"][value="yes"]');
    const kitchenNo  = fullForm.querySelector('input[name="kitchen"][value="no"]');
    if (!kitchenYes || !kitchenNo) return;
    const forceN = caseType === 'new_house' || (Number.isFinite(age) && age < 15);
    if (forceN) {
      kitchenNo.checked = true;
      kitchenYes.disabled = true;
    } else {
      kitchenYes.disabled = false;
    }
  }
  fullForm.querySelectorAll('input[name="caseType"]').forEach(r =>
    r.addEventListener('change', autoLockKitchenByAge));
  fullForm.age.addEventListener('change', autoLockKitchenByAge);

  // ────────────────────────────────────────────────
  // 照片上傳（base64 預覽，AI 評估留 stub）
  // ────────────────────────────────────────────────
  const PHOTO_STORE = {}; // { cat: [{ name, dataUrl }] }
  const MAX_PER_CAT = { exterior: 5, bathroom: 5, kitchen: 5, severe: 5, interior: 5, ideal: 10 };

  function renderPhotoPreview(cat) {
    const preview = document.querySelector(`[data-preview="${cat}"]`);
    const counter = document.querySelector(`[data-for="${cat}"]`);
    if (!preview) return;
    const photos = PHOTO_STORE[cat] || [];
    counter.textContent = photos.length;
    preview.innerHTML = photos.map((p, i) => `
      <div class="photo-thumb">
        <img src="${p.dataUrl}" alt="${p.name}">
        <button type="button" class="photo-remove" data-cat="${cat}" data-idx="${i}" aria-label="移除">×</button>
      </div>
    `).join('');
  }

  document.querySelectorAll('.photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const cat = input.dataset.cat;
      const max = MAX_PER_CAT[cat] || 5;
      PHOTO_STORE[cat] = PHOTO_STORE[cat] || [];
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        if (PHOTO_STORE[cat].length >= max) {
          alert(`此類已達上限 ${max} 張，請先移除舊照片。`);
          break;
        }
        if (file.size > 8 * 1024 * 1024) {
          alert(`${file.name} 超過 8MB，請壓縮後上傳。`);
          continue;
        }
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        PHOTO_STORE[cat].push({ name: file.name, dataUrl });
      }
      input.value = '';
      renderPhotoPreview(cat);
    });
  });

  // 委派移除按鈕
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.photo-remove');
    if (!btn) return;
    const cat = btn.dataset.cat;
    const idx = parseInt(btn.dataset.idx, 10);
    if (PHOTO_STORE[cat]) {
      PHOTO_STORE[cat].splice(idx, 1);
      renderPhotoPreview(cat);
    }
  });

  // ────────────────────────────────────────────────
  // 推斷 caseType（給快速模式用）
  // ────────────────────────────────────────────────
  function deriveCaseType(houseType, age) {
    if (houseType === '預售屋' || houseType === '新成屋') return 'new_house';
    if (houseType === '透天') return age >= 25 ? 'townhouse_old' : 'townhouse_mid';
    // 公寓華廈 / 中古屋 / 大樓
    return age >= 25 ? 'old_house' : 'midage';
  }

  // ────────────────────────────────────────────────
  // 收集表單資料 → estimate inputs
  // ────────────────────────────────────────────────
  // collectQuickInputs 已移除（quick form 改為 landing.html）

  function collectFullInputs() {
    const f = fullForm;
    const conditions = Array.from(f.querySelectorAll('input[name="cond"]:checked')).map(c => c.value);
    const largeEquipment = Array.from(f.querySelectorAll('input[name="equip"]:checked')).map(c => c.value);
    const caseType = f.querySelector('input[name="caseType"]:checked')?.value || 'midage';
    const age = parseInt(f.age.value, 10);

    return {
      caseType,
      age,
      ping: parseFloat(f.ping.value),
      county: f.county.value,
      conditions,
      style: f.querySelector('input[name="styleLevel"]:checked')?.value || 'local',
      rooms: parseInt(f.rooms.value, 10) || 3,
      floors: parseInt(f.floors.value, 10) || 2,
      hasKitchen: f.querySelector('input[name="kitchen"]:checked')?.value === 'yes',
      bathroomsRenovate: parseInt(f.bathRenovate.value, 10) || 0,
      bathroomsNew: parseInt(f.bathNew.value, 10) || 0,
      regularWindows: parseInt(f.regularWindows.value, 10) || 0,
      balconyWindows: parseInt(f.balconyWindows.value, 10) || 0,
      largeEquipment,
      smartHome: f.querySelector('input[name="smartHome"]:checked')?.value || 'none',
      meta: {
        name: f.name.value,
        phone: f.phone.value,
        email: f.email.value,
        source: f.source.value,
        contactPref: f.contactPref.value,
        referral: f.referral.value,
        address: f.address.value,
        structure: f.structure.value,
        lastReno: f.lastReno.value,
        styleRefs: Array.from(f.querySelectorAll('input[name="styleRef"]:checked')).map(c => c.value),
        styleAvoid: f.styleAvoid.value,
        budget: f.budget.value,
        budgetExpected: f.budgetExpected.value,
        budgetFlex: f.budgetFlex.value,
        startMonth: f.startMonth.value,
        endMonth: f.endMonth.value,
        moveInMonth: f.moveInMonth.value,
        designNeeds: f.designNeeds.value,
        members: f.members.value,
        storage: f.storage.value,
        serviceScope: f.serviceScope.value,
        siteVisit: f.querySelector('input[name="siteVisit"]:checked')?.value,
        notes: f.notes.value,
        photoCounts: Object.fromEntries(Object.entries(PHOTO_STORE).map(([k, arr]) => [k, arr.length]))
      }
    };
  }

  // ────────────────────────────────────────────────
  // 顯示結果 Modal（S2 暫時相容版；S3 會重編 6 分類分區）
  // ────────────────────────────────────────────────
  const modal = document.getElementById('result-modal');
  const resultBody = document.getElementById('result-body');
  document.getElementById('modal-close').addEventListener('click', () => modal.hidden = true);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  function fmt(n) { return Number(n).toLocaleString('zh-TW'); }

  // 6 大類 metadata（icon、說明、為什麼會有價差）
  const CAT_META = {
    '基礎工程': { icon: '🧱', desc: '拆除／泥作／水電／防水／磁磚／鋁窗', diff: '屋齡愈大 / 漏水壁癌 / 管線重拉差異最大' },
    '裝修工程': { icon: '🪵', desc: '木作／油漆／系統櫃／石材／木地板', diff: '風格層級（簡約 0.85 vs 精緻 1.30）差 50%' },
    '冷氣':     { icon: '❄️',  desc: '依房間數估台數 (房數+1) × 4.5 萬', diff: '幾乎不浮動，依房數固定' },
    '大型設備': { icon: '⚙️',  desc: '全熱／淨水／軟水／除濕／熱泵／太陽能', diff: '勾選與否差異最大；透天又比大樓高' },
    '智能家電': { icon: '🏠', desc: '照明／窗簾／空調／影音／中控／安防', diff: '4 級單選，從 0 到 120 萬都有可能' },
    '廚房設備': { icon: '🍳', desc: '廚櫃／檯面／瓦斯爐／水槽', diff: '屋齡 <15 年自動 0；≥15 年依房數 27/35/45 萬' },
    '衛浴設備': { icon: '🚿', desc: '馬桶／面盆／淋浴／鏡櫃／配管', diff: '翻新 15 萬/間 + 新增 25 萬/間；<15 年自動 0' },
    '窗戶':     { icon: '🪟', desc: '鋁窗汰換（一般窗 + 落地窗）', diff: '看扇數；老屋常需全換' }
  };

  function showResult(inputs, result, isQuick) {
    const meta = inputs.meta || {};
    const conf = result.confidence;
    const b = result.breakdown;
    const caseLabel = (PARAMS.case_type.options.find(o => o.key === inputs.caseType) || {}).label || inputs.caseType;
    const styleLabel = (PARAMS.style_factor.options.find(o => o.key === inputs.style) || {}).label || inputs.style;

    // 屋況加成顯示
    const conditionLabels = (PARAMS.condition_adjustment.options || [])
      .filter(o => inputs.conditions.includes(o.key))
      .map(o => o.label)
      .join('、') || '（無）';

    // ─── 6 大類視覺化分區 ───
    const cat = result.categoryBreakdown || {};
    const catEntries = Object.entries(cat).filter(([k, v]) => v > 0);
    const maxCat = Math.max(...catEntries.map(([, v]) => v), 1);
    const catVizHtml = catEntries.map(([k, v]) => {
      const m = CAT_META[k] || { icon: '·', desc: '', diff: '' };
      const widthPct = Math.max(2, Math.round(v / maxCat * 100));
      return `
        <div class="cat-bar">
          <div class="cat-bar-head">
            <span class="cat-icon">${m.icon}</span>
            <span class="cat-name">${k}</span>
            <span class="cat-amount">NT$ ${fmt(v)} 萬</span>
          </div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${widthPct}%"></div></div>
          <p class="cat-desc">${m.desc}</p>
        </div>`;
    }).join('');

    // ─── 預算超出怎麼辦（強化版）───
    let budgetBlock = '';
    const budgetCap = parseInt(meta.budget, 10);
    if (budgetCap && budgetCap > 0 && budgetCap < result.clientRange[0]) {
      const gap = result.clientRange[0] - budgetCap;
      budgetBlock = `
        <div class="result-callout callout-warn">
          <div class="callout-head">
            <span class="callout-icon">⚠️</span>
            <h3>預算超出該怎麼辦？</h3>
          </div>
          <p class="callout-lead">您的預算上限 <b>${fmt(budgetCap)} 萬</b>，估價區間下限 <b>${fmt(result.clientRange[0])} 萬</b>，差距約 <b>${fmt(gap)} 萬</b>。先別緊張，我們有 3 條路：</p>
          <ol class="callout-list">
            <li><b>分階段裝修</b> ─ 先做必做（水電、防水、衛浴），系統櫃／軟裝／家具未來再補。降 30–50% 預算很常見。</li>
            <li><b>降風格層級</b> ─ 從「精緻 ×1.30」改「局部 ×1.15」可降約 13%；改「簡約 ×0.85」可降約 35%。</li>
            <li><b>減大設備／智能</b> ─ 全熱、太陽能、智能家電是「Nice to have」。先撤可省 30–120 萬。</li>
          </ol>
          <p class="callout-foot">💡 設計階段我們會幫您做嚴謹的預算控管，不會為了簽約硬塞。預算不合適我們會柔性引導，<b>敢說不</b>。</p>
        </div>
      `;
    }

    // ─── 信心度 reasons ───
    const reasonHtml = (conf.reasons || []).map(r => {
      const sign = r.score > 0 ? '+' : '';
      const cls = r.score > 0 ? 'good' : (r.score < 0 ? 'bad' : '');
      return `<li class="reason ${cls}"><span class="reason-factor">${r.factor}</span><span class="reason-detail">${r.detail}</span><span class="reason-score">${sign}${r.score}</span></li>`;
    }).join('');

    // ─── 為什麼會有價差（教育區）───
    const visibleCats = catEntries.map(([k]) => k);
    const diffRows = visibleCats.map(k => {
      const m = CAT_META[k];
      return m ? `<li><b>${m.icon} ${k}</b>　${m.diff}</li>` : '';
    }).join('');

    resultBody.innerHTML = `
      <!-- ① 區間 + 信心度 -->
      <p class="result-eyebrow">Your Estimated Range</p>
      <h2 class="result-range">NT$ ${fmt(result.clientRange[0])} – ${fmt(result.clientRange[1])} 萬</h2>
      <p class="result-confidence">${conf.label}　·　${conf.strategy}</p>
      <p class="result-conf-meta">區間寬度 ${conf.lowerPct}% / +${conf.upperPct}%　·　信心分 ${conf.score >= 0 ? '+' : ''}${conf.score}　·　依您填的 5 項條件動態計算</p>

      ${budgetBlock}

      <!-- ② 你的房子摘要 -->
      <div class="result-section">
        <h4>您的房屋摘要</h4>
        <div class="result-row"><span class="label">案型</span><span class="value">${caseLabel}（×${b.caseTypeMultiplier}）</span></div>
        <div class="result-row"><span class="label">屋齡 / 坪數</span><span class="value">${inputs.age} 年　·　${inputs.ping} 坪（規模 ×${b.scaleMultiplier}）</span></div>
        <div class="result-row"><span class="label">所在區域</span><span class="value">${inputs.county}（${b.regionZone} +${b.regionAdjPct}%）</span></div>
        <div class="result-row"><span class="label">屋況加成</span><span class="value">${conditionLabels}（+${b.conditionAdjCapped}%${b.conditionAdjRaw > b.conditionAdjCapped ? '，已套上限 +' + b.conditionCap + '%' : ''}）</span></div>
        <div class="result-row"><span class="label">設計風格</span><span class="value">${styleLabel}（×${b.styleMultiplier}）</span></div>
      </div>

      <!-- ③ 6 大類視覺化 -->
      <div class="result-section">
        <h4>預算分配（依 8 大類）</h4>
        <p class="section-sub">每根長條的相對長度＝該類佔比；右側為金額（萬）。</p>
        <div class="cat-bars">${catVizHtml}</div>
      </div>

      <!-- ④ 費用組成 -->
      <div class="result-section">
        <h4>費用組成（NT$ 萬）</h4>
        <div class="result-row"><span class="label">每坪單價</span><span class="value">${result.unitPrice} 萬</span></div>
        <div class="result-row"><span class="label">工程小計</span><span class="value">${fmt(result.engineeringSubtotal)}</span></div>
        <div class="result-row"><span class="label">設計費</span><span class="value">${result.designFee}（${b.designFeePerPing}/坪 × ${b.designPing} 坪）</span></div>
        <div class="result-row"><span class="label">監工費（10%）</span><span class="value">${result.supervisionFee}</span></div>
        <div class="result-row"><span class="label">稅金（5%）</span><span class="value">${result.tax}</span></div>
        <div class="result-row total"><span class="label">預估總價</span><span class="value">NT$ ${fmt(result.total)} 萬</span></div>
      </div>

      <!-- ⑤ 信心度組成 -->
      <div class="result-section">
        <h4>為什麼是這個信心度？</h4>
        <ul class="reason-list">${reasonHtml}</ul>
      </div>

      <!-- ⑥ 為什麼有價差（教育） -->
      <div class="result-section">
        <h4>為什麼同坪數會有價差？</h4>
        <p class="section-sub">同樣 30 坪，可能 200 萬也可能 600 萬。差異主要在這幾個地方：</p>
        <ul class="diff-list">${diffRows}</ul>
        <p class="diff-foot">→ <b>愈精準的屋況資訊愈能縮小區間。</b>現勘後我們可以給您 ±5% 的正式報價。</p>
      </div>

      <!-- ⑦ 丈量提案價值 -->
      <div class="result-callout callout-value">
        <div class="callout-head">
          <span class="callout-icon">📐</span>
          <h3>下一步：丈量提案（10,000–20,000 元）</h3>
        </div>
        <p class="callout-lead">您現在拿到的是「<b>區間粗估</b>」。下一階段「<b>丈量提案</b>」會給您：</p>
        <ul class="value-list">
          <li>✅ 設計師到場丈量 2–4 小時，現場確認屋況</li>
          <li>✅ 量身製作 2–4 週的提案（預算／風格／平面規劃）</li>
          <li>✅ 一次完整提案會議，共投入 20–40 小時</li>
          <li>✅ <b>簽設計約後丈量費全額折抵設計費</b>，等於免費</li>
          <li>✅ 區間從 ±${Math.abs(conf.lowerPct)}/${conf.upperPct}% 收斂到 ±5%</li>
        </ul>
        <p class="callout-foot">💡 收費目的是<b>確保雙方有誠意合作</b>，並保障已簽約客戶的服務品質（設計師 90% 工時須留給簽約客戶）。</p>
      </div>

      <!-- ⑧ LINE CTA -->
      <div class="result-line-cta">
        <p class="result-line-title">📩 預算粗估只是第一步</p>
        <p class="result-line-sub">加入官方 LINE，由客服安排丈量提案時段與適合的設計師。<br>
        <b>兩個工作日內</b>專人聯繫。</p>
        <a href="https://lin.ee/YXt0syEs" target="_blank" rel="noopener" class="btn btn-line btn-line-lg">加入官方 LINE 預約丈量 →</a>
        <p class="result-line-meta">官方 LINE ID：@glninterior　·　0910-859-525</p>
      </div>

      <div class="result-cta">
        <button class="btn btn-outline" onclick="document.getElementById('result-modal').hidden = true">關閉視窗</button>
      </div>

      <!-- ⑨ 免責 -->
      <p class="result-disclaimer">
        ⚠️ 本估價為初步參考區間，最終報價以現場勘查後正式報價單為準。<br>
        區間係依您填寫的資料 + GLN 過往案例反推之每坪基準價推算，實際金額可能因屋況、材料庫存、施工難度而調整。<br>
        本系統估價不含家電、家具、軟裝採購（除非另行討論）。
      </p>
    `;

    modal.hidden = false;
    modal.scrollTop = 0;
  }

  // ────────────────────────────────────────────────
  // 送出 — 完整模式（quick 模式已改為 landing.html）
  // ────────────────────────────────────────────────
  fullForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!PARAMS) { alert('參數尚未載入，請稍候。'); return; }

    const c1 = document.getElementById('consent1');
    const c2 = document.getElementById('consent2');
    if (!c1.checked || !c2.checked) {
      alert('請勾選兩項同意項以繼續。');
      return;
    }

    if (!validateStep(currentStep)) return;
    const inputs = collectFullInputs();
    if (!inputs.caseType || !inputs.age || !inputs.ping || !inputs.county) {
      alert('表單資料不完整，請回到前面步驟檢查。');
      return;
    }

    try {
      const result = GLNEstimate.estimate(PARAMS, inputs);
      showResult(inputs, result, false);
      console.log('[GLN] 完整估價：', { inputs, result });
    } catch (err) {
      console.error(err);
      alert('估價計算失敗：' + err.message);
    }
  });

})();
