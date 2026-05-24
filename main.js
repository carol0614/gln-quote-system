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
  function collectQuickInputs() {
    const f = document.getElementById('form-quick');
    const age = parseInt(f.age.value, 10);
    return {
      caseType: deriveCaseType(f.houseType.value, age),
      age,
      ping: parseFloat(f.ping.value),
      county: f.county.value,
      conditions: [],
      style: 'local',
      rooms: 3,
      floors: 2,
      hasKitchen: !(f.houseType.value === '新成屋' || f.houseType.value === '預售屋' || age < 15),
      bathroomsRenovate: 2,
      bathroomsNew: 0,
      regularWindows: 0,
      balconyWindows: 0,
      largeEquipment: [],
      smartHome: 'none',
      meta: {
        houseTypeLabel: f.houseType.value,
        email: f.email.value
      }
    };
  }

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
        notes: f.notes.value
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

  function showResult(inputs, result, isQuick) {
    const meta = inputs.meta || {};
    const conf = result.confidence;
    const caseLabel = (PARAMS.case_type.options.find(o => o.key === inputs.caseType) || {}).label || inputs.caseType;
    const styleLabel = (PARAMS.style_factor.options.find(o => o.key === inputs.style) || {}).label || inputs.style;

    // 屋況加成顯示
    const conditionLabels = (PARAMS.condition_adjustment.options || [])
      .filter(o => inputs.conditions.includes(o.key))
      .map(o => o.label)
      .join('、') || '（無）';

    // 預算打架判定
    let budgetBlock = '';
    const budgetCap = parseInt(meta.budget, 10);
    if (budgetCap && budgetCap > 0 && budgetCap < result.clientRange[0]) {
      budgetBlock = `
        <div class="budget-conflict">
          <strong>🟡 您的預算與估價有落差</strong>
          <p>您的預算上限：NT$ ${fmt(budgetCap)} 萬<br>
             估價區間下限：NT$ ${fmt(result.clientRange[0])} 萬</p>
          <p style="margin-top:6px"><strong>建議方向：</strong></p>
          <ol>
            <li><strong>必做</strong>：水電管線、防水（攸關安全與壽命）</li>
            <li><strong>應做</strong>：鋁窗、衛浴、廚具（影響日常使用）</li>
            <li><strong>可緩做</strong>：系統櫃、軟裝、家具（未來可分階段）</li>
          </ol>
          <p style="margin-top:6px">💡 我們可以協助您「分階段裝修」，讓預算更彈性。</p>
        </div>
      `;
    }

    // 6 大類分區（v3 categoryBreakdown）
    const cat = result.categoryBreakdown || {};
    const categoryRows = [
      ['基礎工程', cat['基礎工程']],
      ['裝修工程', cat['裝修工程']],
      ['冷氣',     cat['冷氣']],
      ['大型設備', cat['大型設備']],
      ['智能家電', cat['智能家電']],
      ['廚房設備', cat['廚房設備']],
      ['衛浴設備', cat['衛浴設備']],
      ['窗戶',     cat['窗戶']]
    ].filter(r => r[1] > 0).map(([k, v]) =>
      `<div class="result-row"><span class="label">${k}</span><span class="value">NT$ ${fmt(v)} 萬</span></div>`
    ).join('');

    // 信心度 reasons
    const reasonHtml = (conf.reasons || []).map(r => {
      const sign = r.score > 0 ? '+' : '';
      const cls = r.score > 0 ? 'good' : (r.score < 0 ? 'bad' : '');
      return `<li class="reason ${cls}"><span class="reason-factor">${r.factor}</span><span class="reason-detail">${r.detail}</span><span class="reason-score">${sign}${r.score}</span></li>`;
    }).join('');

    const b = result.breakdown;
    resultBody.innerHTML = `
      <p class="result-eyebrow">Your Estimated Range</p>
      <h2 class="result-range">NT$ ${fmt(result.clientRange[0])} – ${fmt(result.clientRange[1])} 萬</h2>
      <p class="result-confidence">${conf.label}　·　${conf.strategy}</p>
      <p class="result-conf-meta">區間寬度 ${conf.lowerPct}% / +${conf.upperPct}%　·　信心分 ${conf.score >= 0 ? '+' : ''}${conf.score}</p>

      ${budgetBlock}

      <div class="result-section">
        <h4>Your House</h4>
        <div class="result-row"><span class="label">案型</span><span class="value">${caseLabel}（×${b.caseTypeMultiplier}）</span></div>
        <div class="result-row"><span class="label">屋齡</span><span class="value">${inputs.age} 年</span></div>
        <div class="result-row"><span class="label">室內坪數</span><span class="value">${inputs.ping} 坪　·　規模 ×${b.scaleMultiplier}</span></div>
        <div class="result-row"><span class="label">所在區域</span><span class="value">${inputs.county}（${b.regionZone} +${b.regionAdjPct}%）</span></div>
        <div class="result-row"><span class="label">屋況加成</span><span class="value">${conditionLabels}（+${b.conditionAdjCapped}%${b.conditionAdjRaw > b.conditionAdjCapped ? '，已套上限 +' + b.conditionCap + '%' : ''}）</span></div>
        <div class="result-row"><span class="label">設計風格</span><span class="value">${styleLabel}（×${b.styleMultiplier}）</span></div>
      </div>

      <div class="result-section">
        <h4>分類預算（NT$ 萬）</h4>
        ${categoryRows}
      </div>

      <div class="result-section">
        <h4>費用組成（NT$ 萬）</h4>
        <div class="result-row"><span class="label">每坪單價</span><span class="value">${result.unitPrice} 萬</span></div>
        <div class="result-row"><span class="label">工程小計</span><span class="value">${fmt(result.engineeringSubtotal)}</span></div>
        <div class="result-row"><span class="label">設計費</span><span class="value">${result.designFee}（${b.designFeePerPing}/坪 × ${b.designPing} 坪）</span></div>
        <div class="result-row"><span class="label">監工費（10%）</span><span class="value">${result.supervisionFee}</span></div>
        <div class="result-row"><span class="label">稅金（5%）</span><span class="value">${result.tax}</span></div>
        <div class="result-row total"><span class="label">預估總價</span><span class="value">NT$ ${fmt(result.total)} 萬</span></div>
      </div>

      <div class="result-section">
        <h4>信心度組成</h4>
        <ul class="reason-list">${reasonHtml}</ul>
      </div>

      <div class="result-line-cta">
        <p class="result-line-title">📩 預算粗估只是第一步</p>
        <p class="result-line-sub">立刻預約，取得更詳細的專人諮詢<br>
        我們會由設計師依您的屋況提供 <strong>精準正式報價</strong> 與 <strong>1–2 個量身規劃方案</strong>。</p>
        <a href="https://lin.ee/YXt0syEs" target="_blank" rel="noopener" class="btn btn-line btn-line-lg">加入官方 LINE 預約諮詢 →</a>
        <p class="result-line-meta">官方 LINE ID：@glninterior　·　兩個工作日內專人聯繫</p>
      </div>

      <div class="result-cta">
        <button class="btn btn-outline" onclick="document.getElementById('result-modal').hidden = true">關閉視窗</button>
      </div>

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
  // 送出 — 快速模式
  // ────────────────────────────────────────────────
  document.getElementById('form-quick').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!PARAMS) { alert('參數尚未載入，請稍候。'); return; }
    const inputs = collectQuickInputs();
    if (!inputs.caseType || !inputs.age || !inputs.ping || !inputs.county) {
      alert('請填寫所有必填欄位。');
      return;
    }
    try {
      const result = GLNEstimate.estimate(PARAMS, inputs);
      showResult(inputs, result, true);
      console.log('[GLN] 快速估價：', { inputs, result });
    } catch (err) {
      console.error(err);
      alert('估價計算失敗：' + err.message);
    }
  });

  // ────────────────────────────────────────────────
  // 送出 — 完整模式
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
