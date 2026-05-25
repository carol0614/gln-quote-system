/**
 * GLN 線上估價系統 — 前端邏輯 v3.3
 * 對應 estimate.js v3.3 + params.json v3.3
 */

(function () {
  'use strict';

  // ────────────────────────────────────────────────
  // 線索回傳端點（GAS Web App URL）
  // 部署完 Apps Script 後把 URL 貼到 web/config.json 的 leadEndpoint 欄位。
  // 空字串 = 不送（local dev 預設）。
  // ────────────────────────────────────────────────
  let LEAD_ENDPOINT = '';
  fetch('config.json')
    .then(r => r.ok ? r.json() : {})
    .then(cfg => { LEAD_ENDPOINT = (cfg && cfg.leadEndpoint) || ''; })
    .catch(() => { /* 沒設定就跳過，不擋使用者 */ });

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

    const val = (name) => (f.elements[name] ? f.elements[name].value : '');

    return {
      caseType,
      age,
      ping: parseFloat(f.ping.value),
      county: f.county.value,
      conditions,
      style: f.querySelector('input[name="styleLevel"]:checked')?.value || 'local',
      rooms: parseInt(f.rooms.value, 10) || 3,
      floors: parseInt(f.floors.value, 10) || 2,
      balconies: parseInt(val('balconies'), 10) || 0,
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
        lastReno: f.lastReno.value,
        styleElements: val('styleElements'),
        styleAvoid: f.styleAvoid.value,
        budgetExpected: f.budgetExpected.value,
        budgetFlex: f.budgetFlex.value,
        startMonth: f.startMonth.value,
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

  // ────────────────────────────────────────────────
  // Gated 資源卡：點擊 → 滾到表單區 + 顯示 toast 提示
  // ────────────────────────────────────────────────
  document.querySelectorAll('.resource-card-gated').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      // 滾到表單區
      const target = document.getElementById('mode-full');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // 顯示提示
      showGatedToast();
    });
  });

  function showGatedToast() {
    let toast = document.getElementById('gated-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gated-toast';
      toast.className = 'gated-toast';
      toast.innerHTML = '🔒 完成下方估價填寫，<br>即可解鎖兩份精選資源。';
      document.body.appendChild(toast);
    }
    toast.classList.remove('hide');
    void toast.offsetWidth; // restart animation
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
    }, 3500);
  }

  function fmt(n) { return Number(n).toLocaleString('zh-TW'); }

  // 7 大類 metadata（廚房+衛浴已合併為廚衛設備）
  const CAT_META = {
    '基礎工程': { icon: '🧱', desc: '拆除／泥作／水電／防水／磁磚／鋁窗', diff: '屋齡愈大、漏水壁癌、管線重拉差異最大' },
    '裝修工程': { icon: '🪵', desc: '木作／油漆／系統櫃／石材／木地板', diff: '風格層級差異最大' },
    '冷氣':     { icon: '❄️',  desc: '依房間數估台數', diff: '幾乎不浮動，依房數固定' },
    '大型設備': { icon: '⚙️',  desc: '全熱／淨水／軟水／除濕／熱泵／太陽能', diff: '勾選與否差異最大；透天又比大樓高' },
    '智能家電': { icon: '🏠', desc: '照明／窗簾／空調／影音／中控／安防', diff: '從基礎到全屋中控差異很大' },
    '廚衛設備': { icon: '🚿', desc: '廚房 + 衛浴設備', diff: '進口和國產價差非常大，磁磚等材料和設備的選擇也會影響價格' },
    '窗戶':     { icon: '🪟', desc: '鋁窗汰換（一般窗 + 落地窗）', diff: '看扇數；老屋常需全換' }
  };

  // 把後端回傳的 8 類合併為 7 類（廚房+衛浴）
  function mergeKitchenBath(cat) {
    const merged = {};
    for (const [k, v] of Object.entries(cat || {})) {
      if (k === '廚房設備' || k === '衛浴設備') {
        merged['廚衛設備'] = (merged['廚衛設備'] || 0) + v;
      } else {
        merged[k] = v;
      }
    }
    return merged;
  }

  // ────────────────────────────────────────────────
  // 把線索送到 GAS（fire-and-forget；失敗也不擋使用者）
  // ────────────────────────────────────────────────
  function sendLead(inputs, result) {
    if (!LEAD_ENDPOINT) {
      console.warn('[GLN] LEAD_ENDPOINT 未設定，跳過資料回傳。');
      return Promise.resolve({ skipped: true });
    }
    const payload = {
      submittedAt: new Date().toISOString(),
      source: 'gln-quote-web',
      version: 'v3.3',
      inputs,
      result: {
        clientRange: result.clientRange,
        total: result.total,
        unitPrice: result.unitPrice,
        confidence: result.confidence && result.confidence.label,
        confidenceScore: result.confidence && result.confidence.score,
        categoryBreakdown: result.categoryBreakdown
      }
    };
    // 用 text/plain 避開 GAS CORS preflight
    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(() => ({ ok: true }))
      .catch(err => { console.error('[GLN] sendLead 失敗：', err); return { ok: false, err }; });
  }

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

    // 丈量提案費用（依坪數 + 透天）
    const isTownhouse = inputs.caseType === 'townhouse_mid' || inputs.caseType === 'townhouse_old';
    const measureFeeLabel = (inputs.ping >= 45 || isTownhouse) ? '20,000 元' : '10,000 元';

    // ─── 7 大類視覺化分區（廚衛已合併）───
    const cat = mergeKitchenBath(result.categoryBreakdown);
    const catEntries = Object.entries(cat).filter(([k, v]) => v > 0);
    const catTotal = catEntries.reduce((s, [, v]) => s + v, 0) || 1;
    const maxCat = Math.max(...catEntries.map(([, v]) => v), 1);
    const catVizHtml = catEntries.map(([k, v]) => {
      const m = CAT_META[k] || { icon: '·', desc: '', diff: '' };
      const widthPct = Math.max(2, Math.round(v / maxCat * 100));
      const pct = Math.round(v / catTotal * 100);
      return `
        <div class="cat-bar">
          <div class="cat-bar-head">
            <span class="cat-icon">${m.icon}</span>
            <span class="cat-name">${k}</span>
            <span class="cat-amount">NT$ ${fmt(v)} 萬　<small class="cat-pct">(${pct}%)</small></span>
          </div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${widthPct}%"></div></div>
          <p class="cat-desc">${m.desc}</p>
        </div>`;
    }).join('');

    // ─── 30 年+ 屋齡基本三項建議（除非近 10 年內已更新）───
    let oldHouseBlock = '';
    const lastReno = parseInt(meta.lastReno, 10);
    const recentlyRenovated = Number.isFinite(lastReno) && lastReno > 0 && lastReno <= 10;
    if (inputs.age >= 30 && !recentlyRenovated) {
      oldHouseBlock = `
        <div class="result-callout callout-recommend">
          <div class="callout-head">
            <span class="callout-icon">🛠️</span>
            <h3>30 年+ 屋齡基本工項建議</h3>
          </div>
          <p class="callout-lead">您的房屋屋齡 <b>${inputs.age} 年</b>。對於 30 年以上的房屋，<b>以下三項建議都要做</b>：</p>
          <ol class="callout-list">
            <li><b>衛浴打除重做</b> ─ 老化的防水層通常已失效，漏水隱患高</li>
            <li><b>全屋防水重做</b> ─ 衛浴、廚房、陽台、外牆需整體規劃</li>
            <li><b>管線全換</b> ─ 水管、電線、瓦斯管常已老化或不符現行規範</li>
          </ol>
          <p class="callout-foot">💡 本估價已假設這三項都會做。若您近 10 年內已更新過，請在「最近一次裝修」欄位填寫，我們會酌減。</p>
        </div>
      `;
    }

    // ─── 預算超出怎麼辦（柔性版，不揭內部倍數）───
    let budgetBlock = '';
    const budgetCap = parseInt(meta.budgetExpected, 10);
    if (budgetCap && budgetCap > 0 && budgetCap < result.clientRange[0]) {
      budgetBlock = `
        <div class="result-callout callout-warn">
          <div class="callout-head">
            <span class="callout-icon">⚠️</span>
            <h3>預算超出該怎麼辦？</h3>
          </div>
          <p class="callout-lead">您期待的工程預算 <b>${fmt(budgetCap)} 萬</b>，估價區間下限 <b>${fmt(result.clientRange[0])} 萬</b>。先別緊張，這部分可以一起討論。</p>
          <p class="callout-foot">💡 設計階段我們會做預算的討論控管，也會協助設計及工程優化符合需求，更會引導及給予專業的評估建議。</p>
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

      ${oldHouseBlock}
      ${budgetBlock}

      <!-- ② 你的房子摘要 -->
      <div class="result-section">
        <h4>您的房屋摘要</h4>
        <div class="result-row"><span class="label">案型</span><span class="value">${caseLabel}</span></div>
        <div class="result-row"><span class="label">屋齡 / 坪數</span><span class="value">${inputs.age} 年　·　${inputs.ping} 坪</span></div>
        <div class="result-row"><span class="label">所在區域</span><span class="value">${inputs.county}</span></div>
        <div class="result-row"><span class="label">屋況</span><span class="value">${conditionLabels}</span></div>
        <div class="result-row"><span class="label">設計風格</span><span class="value">${styleLabel}</span></div>
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
        <p class="diff-foot">→ 現場勘查後，我們會依照屋況、環境及需求，給您更準確的預算範圍及提案。<br><b>設計流程後會有詳細報價書。</b></p>
      </div>

      <!-- ⑦ 丈量提案價值 -->
      <div class="result-callout callout-value">
        <div class="callout-head">
          <span class="callout-icon">📐</span>
          <h3>下一步：丈量提案（${measureFeeLabel}）</h3>
        </div>
        <p class="callout-lead">您現在拿到的是「<b>區間粗估</b>」。下一階段「<b>丈量提案</b>」會給您：</p>
        <ul class="value-list">
          <li>✅ 設計師及總監現場丈量 1–2 小時，確認屋況及需求</li>
          <li>✅ 量身製作 2–4 週的提案（預算／風格／平面規劃）</li>
          <li>✅ 提案會議：說明及討論平面格局制定、設計方向、預算討論建議<br><small>＊備註：報告僅供現場討論使用</small></li>
          <li>✅ <b>簽設計約後丈量費全額折抵設計費</b>，等於免費</li>
        </ul>
        <p class="callout-foot">💡 收費目的是<b>確保雙方有誠意合作</b>，並保障已簽約客戶的服務品質（設計師 90% 工時須留給簽約客戶）。</p>
      </div>

      <!-- ⑧ 解鎖資源（gated PDFs，填完表單後解鎖） -->
      <div class="result-unlocked">
        <div class="unlocked-head">
          <span class="unlocked-icon">🎁</span>
          <h3>感謝您完成填寫，為您解鎖兩份精選資源</h3>
          <p class="unlocked-sub">由 GLN 17 年實戰經驗整理，限完成估價的屋主取得。</p>
        </div>
        <div class="unlocked-grid">
          <a href="https://canva.link/j3xqsy8targlex8" target="_blank" rel="noopener" class="unlocked-card">
            <span class="unlocked-tag">老屋翻新</span>
            <h4>老屋翻新／自地自建精華版</h4>
            <ul class="unlocked-bullets">
              <li>什麼是翻新必做工程項目？</li>
              <li>翻新預備與 2026 最新預算配置</li>
              <li>翻新結構補強還是重建？</li>
              <li>自地自建費用與時程</li>
            </ul>
            <span class="unlocked-cta">立即查看 →</span>
          </a>
          <a href="https://canva.link/jmde00ye6wnhj1y" target="_blank" rel="noopener" class="unlocked-card">
            <span class="unlocked-tag">補助申請</span>
            <h4>2026 老宅延壽補助申請懶人包</h4>
            <p class="unlocked-desc">最新申請條件、可補助金額、流程與所需文件一次看完。GLN 承接案件可免費協助評估資格。</p>
            <span class="unlocked-cta">立即查看 →</span>
          </a>
        </div>
      </div>

      <!-- ⑨ LINE CTA -->
      <div class="result-line-cta">
        <p class="result-line-title">📩 立即預約精準客製化的規劃方案</p>
        <p class="result-line-sub">點擊加入官方 LINE，<br>預約免費線上諮詢或現場丈量。</p>
        <a href="https://lin.ee/YXt0syEs" target="_blank" rel="noopener" class="btn btn-line btn-line-lg">請專人跟我聯絡 →</a>
        <p class="result-line-meta">官方 LINE ID：@glninterior　·　0910-859-525</p>
      </div>

      <div class="result-cta">
        <button class="btn btn-outline" onclick="document.getElementById('result-modal').hidden = true">關閉視窗</button>
      </div>

      <!-- ⑩ 免責 -->
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
      sendLead(inputs, result); // fire-and-forget，不擋 UI
      showResult(inputs, result, false);
      console.log('[GLN] 完整估價：', { inputs, result });
    } catch (err) {
      console.error(err);
      alert('估價計算失敗：' + err.message);
    }
  });

})();
