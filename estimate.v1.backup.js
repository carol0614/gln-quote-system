/**
 * GLN 線上估價計算引擎 v1.0
 * 對應規格書 v1.2 §7 + 係數參數 v1.0
 *
 * 用法（瀏覽器）：
 *   const result = estimate(params, inputs);
 *
 * 用法（Node 驗證）：
 *   const { estimate } = require('./estimate.js');
 *
 * 公式：見 PARAMS_FILE §10 完整試算範例
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GLNEstimate = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ────────────────────────────────────────────────
  // 工具函式
  // ────────────────────────────────────────────────

  function findBasePrice(params, houseType, age) {
    // 第一輪：嚴格 [min, max)，避免邊界重疊（如 age=20 大樓應落到 20+ 區間）
    for (const rule of params.base_price_per_ping.rules) {
      if (rule.house_type.includes(houseType)
          && age >= rule.age_min
          && age < rule.age_max) {
        return rule.price;
      }
    }
    // 第二輪：包含上界 [min, max]，處理首段邊界（如 age=5 新成屋仍視為 0-5 區間）
    for (const rule of params.base_price_per_ping.rules) {
      if (rule.house_type.includes(houseType)
          && age >= rule.age_min
          && age <= rule.age_max) {
        return rule.price;
      }
    }
    throw new Error(`找不到基準價：${houseType} / ${age}年`);
  }

  function findRegionAdj(params, county) {
    for (const [zone, info] of Object.entries(params.region_adjustment.rules)) {
      if (info.counties.some(c => county.includes(c))) {
        return { zone, pct: info.adjustment_pct };
      }
    }
    // 找不到則歸為南部 0%
    return { zone: '南部', pct: 0 };
  }

  function sumConditionAdj(params, conditionKeys, houseType) {
    const lookup = Object.fromEntries(
      params.condition_adjustment.options.map(o => [o.key, o.adjustment_pct])
    );
    const total = conditionKeys.reduce((s, k) => s + (lookup[k] || 0), 0);

    // 套用 cap
    const caps = params.condition_adjustment.caps;
    // 公寓華廈 / 大樓 / 中古屋 → 35; 透天 → 45
    let cap = 35;
    if (houseType.includes('透天')) cap = 45;
    else if (caps[houseType] != null) cap = caps[houseType];

    return { raw: total, capped: Math.min(total, cap), cap };
  }

  function findScaleMultiplier(params, ping) {
    for (const rule of params.scale_discount.rules) {
      if (ping >= rule.ping_min && ping <= rule.ping_max) {
        return rule.multiplier;
      }
    }
    return 1.0;
  }

  function findKitchenAddon(params, rooms, houseType, age) {
    const cfg = params.kitchen_addon;
    // 新成屋 / 預售屋 5 年內免
    if (cfg.skip_for_new_house
        && age <= cfg.skip_age_threshold
        && (houseType === '新成屋' || houseType === '預售屋')) {
      return 0;
    }
    // 找符合房數的規則（≥ 4 房用最後一條）
    let pick = cfg.rules[0];
    for (const r of cfg.rules) {
      if (rooms >= r.rooms) pick = r;
    }
    return pick.amount_10k;
  }

  function findDesignFee(params, ping, houseType, age) {
    const cfg = params.design_fee;
    let feePerPing = null;
    for (const r of cfg.rules) {
      // 老屋翻新：age >= 20
      if (r.house_type.includes('老屋翻新') && age >= (r.age_min || 20)) {
        feePerPing = r.fee_per_ping;
      }
      // 中古屋：5 ≤ age < 20
      if (r.house_type.includes('中古屋')
          && age >= (r.age_min || 5)
          && age < (r.age_max || 20)) {
        feePerPing = r.fee_per_ping;
      }
      // 新成屋
      if (r.house_type.includes(houseType) && houseType === '新成屋') {
        feePerPing = r.fee_per_ping;
      }
      // 預售屋
      if (r.house_type.includes(houseType) && houseType === '預售屋') {
        feePerPing = r.fee_per_ping;
      }
    }

    // Fallback by house type + age
    if (feePerPing === null) {
      if (age >= 20) feePerPing = 8000;             // 老屋
      else if (age >= 5) feePerPing = 6000;          // 中古
      else if (houseType === '新成屋') feePerPing = 4500;
      else if (houseType === '預售屋') feePerPing = 3000;
      else feePerPing = 6000;
    }

    const raw = ping * feePerPing;
    return Math.max(raw, cfg.minimum_fee);
  }

  // ────────────────────────────────────────────────
  // 主函式
  // ────────────────────────────────────────────────

  /**
   * @param {Object} params - 從 params.json 載入的係數
   * @param {Object} inputs - 客戶輸入
   * @param {string} inputs.houseType - 房屋型態
   * @param {number} inputs.age - 屋齡（年）
   * @param {number} inputs.ping - 室內坪數
   * @param {string} inputs.county - 縣市
   * @param {string[]} inputs.conditions - 屋況勾選 key 陣列
   * @param {number} inputs.rooms - 房數
   * @param {number} inputs.bathroomsRenovate - 翻新廁所數
   * @param {number} inputs.bathroomsNew - 新增廁所數
   * @param {boolean} inputs.hasKitchenRenovation - 廚房是否翻新
   * @param {string} [inputs.confidence='中'] - '高' | '中' | '低' | '參考'
   * @returns {Object} 完整計算結果（萬為單位）
   */
  function estimate(params, inputs) {
    const {
      houseType, age, ping, county,
      conditions = [], rooms = 3,
      bathroomsRenovate = 0, bathroomsNew = 0,
      hasKitchenRenovation = false,
      confidence = '中'
    } = inputs;

    // Step 1: 每坪單價
    const basePrice = findBasePrice(params, houseType, age);
    const scaleMult = findScaleMultiplier(params, ping);
    const region = findRegionAdj(params, county);
    const cond = sumConditionAdj(params, conditions, houseType);
    const adjMultiplier = 1 + (region.pct + cond.capped) / 100;
    const unitPrice = basePrice * scaleMult * adjMultiplier;

    // Step 2: 工程小計
    const bathroomAddon = bathroomsRenovate * params.bathroom_addon.renovate_existing_per_unit
                       + bathroomsNew * params.bathroom_addon.add_new_per_unit;
    const kitchenAddon = hasKitchenRenovation
                       ? findKitchenAddon(params, rooms, houseType, age)
                       : 0;
    const engineeringSubtotal = unitPrice * ping + bathroomAddon + kitchenAddon;

    // Step 3: 設計費
    const designFee = findDesignFee(params, ping, houseType, age) / 10000; // 元 → 萬

    // Step 4: 監工費
    const supervisionFee = engineeringSubtotal * (params.additional_fees.supervision_pct / 100);

    // Step 5: 稅金
    const taxBase = engineeringSubtotal + supervisionFee + designFee;
    const tax = taxBase * (params.additional_fees.tax_pct / 100);

    // Step 6: 預估總價
    const total = engineeringSubtotal + designFee + supervisionFee + tax;

    // Step 7: 客戶端顯示區間
    // v1.3：所有信心度統一使用 ±10%（Carol 決議：避免高/中/低差異造成客戶混淆）
    const confidenceWidth = 0.10;

    const clientRange = [
      total * (1 - confidenceWidth),
      total * (1 + confidenceWidth)
    ];

    return {
      // 計算明細（萬為單位）
      unitPrice: round2(unitPrice),
      engineeringSubtotal: round0(engineeringSubtotal),
      designFee: round1(designFee),
      supervisionFee: round1(supervisionFee),
      tax: round1(tax),
      total: round0(total),
      clientRange: [round0(clientRange[0]), round0(clientRange[1])],

      // 解釋用
      breakdown: {
        basePrice,
        scaleMultiplier: scaleMult,
        regionZone: region.zone,
        regionAdjPct: region.pct,
        conditionAdjRaw: cond.raw,
        conditionAdjCapped: cond.capped,
        conditionCap: cond.cap,
        bathroomAddon,
        kitchenAddon,
        confidenceWidth,
        confidence
      }
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function round0(x) { return Math.round(x); }

  return { estimate };
}));
