/**
 * GLN 落地頁 — Stage 1-4 漸進揭露 SPA
 * 對應 報價系統策略報告 v2.0
 */

(function () {
  'use strict';

  // ────────────────────────────────────────────────
  // 載入 params
  // ────────────────────────────────────────────────
  let PARAMS = null;
  fetch('params.json')
    .then(r => r.json())
    .then(json => { PARAMS = json; })
    .catch(err => console.error('[GLN] params.json 載入失敗', err));

  // ────────────────────────────────────────────────
  // Stage 切換
  // ────────────────────────────────────────────────
  const stages = document.querySelectorAll('.stage');
  const stageDots = document.querySelectorAll('.stage-dot');

  function goStage(n) {
    stages.forEach(s => s.classList.toggle('active', s.dataset.stage == n));
    stageDots.forEach(d => {
      const ds = parseInt(d.dataset.s, 10);
      d.classList.remove('active', 'done');
      if (ds < n) d.classList.add('done');
      else if (ds == n) d.classList.add('active');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-next-stage]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const n = parseInt(btn.dataset.nextStage, 10);
      if (n === 3) {
        // 進 Stage 3 前用 diag 表單算結果
        renderQuote();
      }
      goStage(n);
    });
  });
  document.querySelectorAll('[data-back-stage]').forEach(btn => {
    btn.addEventListener('click', () => goStage(parseInt(btn.dataset.backStage, 10)));
  });

  // ────────────────────────────────────────────────
  // Stage 2：7 題診斷導航
  // ────────────────────────────────────────────────
  const diagForm = document.getElementById('diag-form');
  const diagSteps = diagForm.querySelectorAll('.diag-step');
  const eduCards = diagForm.querySelectorAll('.edu-card');
  const TOTAL_Q = 7;
  const diagBar = document.getElementById('diag-progress-bar');
  const diagLabel = document.getElementById('diag-progress-label');
  let currentQ = 1;
  let pendingEdu = null; // 'after-q2' / 'after-q4' / 'after-q6'

  function showQ(n) {
    diagSteps.forEach(s => s.classList.remove('active'));
    eduCards.forEach(c => c.classList.remove('active'));
    const target = diagForm.querySelector(`.diag-step[data-q="${n}"]`);
    if (target) {
      target.classList.add('active');
      currentQ = n;
      diagBar.style.width = (n / TOTAL_Q * 100) + '%';
      diagLabel.textContent = `第 ${n} / ${TOTAL_Q} 題`;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showEdu(key) {
    diagSteps.forEach(s => s.classList.remove('active'));
    const target = diagForm.querySelector(`.edu-card[data-edu="${key}"]`);
    if (target) {
      target.classList.add('active');
      pendingEdu = key;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function flashError(el) {
    if (!el) return;
    el.style.outline = '2px solid #C67D5A';
    el.style.outlineOffset = '2px';
    setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 1800);
  }

  function validateQ(n) {
    const step = diagForm.querySelector(`.diag-step[data-q="${n}"]`);
    if (!step) return true;
    // radio
    const radios = step.querySelectorAll('input[type="radio"][required]');
    const radioGroups = new Set();
    radios.forEach(r => radioGroups.add(r.name));
    for (const name of radioGroups) {
      if (!step.querySelector(`input[name="${name}"]:checked`)) {
        flashError(step.querySelector('.radio-cards'));
        return false;
      }
    }
    // other required
    const others = step.querySelectorAll('input:not([type="radio"])[required], select[required]');
    for (const f of others) {
      if (!f.value) {
        f.focus();
        flashError(f);
        return false;
      }
    }
    return true;
  }

  diagForm.querySelectorAll('.diag-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!validateQ(currentQ)) return;
      // 觸發教育卡（v2 #2/#4/#5：Q2 屋齡 / Q3 形態 / Q5 焦慮）
      if (currentQ === 2) { swapEduVariant('after-q2'); showEdu('after-q2'); return; }
      if (currentQ === 3) { swapEduVariant('after-q3'); showEdu('after-q3'); return; }
      if (currentQ === 5) { swapEduVariant('after-q5'); showEdu('after-q5'); return; }
      if (currentQ < TOTAL_Q) showQ(currentQ + 1);
    });
  });

  // 依答題內容切換教育卡變體（4 / 8 / 4）
  function swapEduVariant(eduKey) {
    const card = diagForm.querySelector(`.edu-card[data-edu="${eduKey}"]`);
    if (!card) return;
    if (eduKey === 'after-q2') {
      const age = parseInt(diagForm.age.value, 10) || 0;
      let key = '50+';
      if (age < 15) key = '0-15';
      else if (age < 25) key = '15-25';
      else if (age < 50) key = '25-50';
      card.querySelectorAll('[data-age-variant]').forEach(p => {
        p.style.display = p.dataset.ageVariant === key ? '' : 'none';
      });
    } else if (eduKey === 'after-q3') {
      const form = diagForm.querySelector('input[name="houseForm"]:checked')?.value;
      card.querySelectorAll('[data-form-variant]').forEach(p => {
        p.style.display = p.dataset.formVariant === form ? '' : 'none';
      });
    } else if (eduKey === 'after-q5') {
      const worry = diagForm.querySelector('input[name="worry"]:checked')?.value;
      card.querySelectorAll('[data-worry-variant]').forEach(p => {
        p.style.display = p.dataset.worryVariant === worry ? '' : 'none';
      });
    }
  }

  diagForm.querySelectorAll('.diag-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentQ > 1) showQ(currentQ - 1);
    });
  });

  diagForm.querySelectorAll('.edu-continue').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pendingEdu === 'after-q2') showQ(3);
      else if (pendingEdu === 'after-q3') showQ(4);
      else if (pendingEdu === 'after-q5') showQ(6);
      pendingEdu = null;
    });
  });

  // 自地自建選了才顯示地號欄位
  diagForm.querySelectorAll('input[name="houseForm"]').forEach(r => {
    r.addEventListener('change', () => {
      const extra = document.getElementById('self-build-extra');
      if (extra) extra.style.display = r.value === 'self-build' && r.checked ? '' : (diagForm.querySelector('input[name="houseForm"]:checked')?.value === 'self-build' ? '' : 'none');
    });
  });

  // 表單送出 → 進 Stage 3
  diagForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateQ(currentQ)) return;
    renderQuote();
    goStage(3);
  });

  // ────────────────────────────────────────────────
  // Stage 3：算粗估範圍（±30%）
  // ────────────────────────────────────────────────
  // ────────────────────────────────────────────────
  // Stage 3：粗估範圍（依房屋形態 × 屋齡 的每坪價區間，Carol 2026-05-25 規範）
  // ────────────────────────────────────────────────
  // 比照組（基準）：5 種房屋形態套用同一張表
  const BASE_PRICE_PER_PING = {
    new: [5,  9],   // 新成屋（< 5 年）
    mid: [9,  13],  // 中古屋（5-25 年）
    old: [11, 16]   // 老屋（≥ 25 年）
  };
  // 透天倍率
  const TOWNHOUSE_MULT = 1.05;

  // 房屋形態 → 倍率（其餘為特殊：商空 / 自地自建 不算範圍）
  const FORM_MULTIPLIER = {
    'community':         1.00,   // 社區大樓（基準）
    'apartment':         1.00,   // 公寓
    'elevator-mansion':  1.00,   // 電梯華廈
    'rural':             1.00,   // 平房/三合院/農舍
    'row-townhouse':     TOWNHOUSE_MULT,  // 連排透天
    'detached-villa':    TOWNHOUSE_MULT   // 獨棟透天/別墅
    // 'commercial' / 'self-build' → 特殊處理
  };

  function ageCategory(age) {
    if (age < 5) return 'new';
    if (age < 25) return 'mid';
    return 'old';
  }

  function computeQuote(ping, houseForm, age) {
    // 商空 / 自地自建：特殊
    if (houseForm === 'commercial' || houseForm === 'self-build') {
      return { special: true, formKey: houseForm };
    }
    const mult = FORM_MULTIPLIER[houseForm];
    if (mult == null) return null;
    const cat = ageCategory(age);
    const [lowPer, highPer] = BASE_PRICE_PER_PING[cat];
    return {
      lower: Math.round(lowPer  * mult * ping),
      upper: Math.round(highPer * mult * ping),
      perPingLow:  +(lowPer  * mult).toFixed(2),
      perPingHigh: +(highPer * mult).toFixed(2),
      category: cat,
      formMultiplier: mult
    };
  }

  function renderQuote() {
    const f = diagForm;
    const ping = parseFloat(f.ping.value) || 30;
    const age = parseInt(f.age.value, 10) || 25;
    const houseForm = f.querySelector('input[name="houseForm"]:checked')?.value;

    const el = document.getElementById('quote-range');
    if (!el) return;

    const r = computeQuote(ping, houseForm, age);
    if (!r) {
      el.textContent = '請完整填寫前面題目';
      return;
    }
    const fmt = n => Number(n).toLocaleString('zh-TW');
    if (r.special) {
      const label = r.formKey === 'commercial' ? '商業空間' : '自地自建';
      el.innerHTML = `<span class="quote-special">${label}　依照專案規劃</span><br><span class="quote-special-sub">加入 LINE 瞭解更多案例</span>`;
    } else {
      el.innerHTML = `${fmt(r.lower)} – ${fmt(r.upper)} <small>萬</small>`;
    }
    // 同步副標（每坪單價）— 若 quote-acc 不存在則略過
    const accEl = document.querySelector('.quote-acc-dynamic');
    if (accEl && !r.special) {
      accEl.textContent = `每坪 ${r.perPingLow}–${r.perPingHigh} 萬 × ${ping} 坪`;
    } else if (accEl) {
      accEl.textContent = '';
    }
  }

})();
