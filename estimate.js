/**
 * GLN 線上預算分配計算引擎 v3.3
 * 對應 GLN 預算分配系統 v3 總表（generate_v3_master.py v3.3）
 *
 * 9-Step 公式：
 *   1. 每坪單價 = 7 × 案型參數 × 規模折扣 × 風格倍率 × (1 + 區域% + 屋況%)
 *   2. 主體小計 = Step 1 × 室內坪數
 *   3-1 冷氣        = (房數 + 1) × 4.5 萬
 *   3-2 大型設備    = Σ 勾選項目（大樓/透天單價不同）
 *   3-3 智能家電    = 單選層級
 *   3-4 廚房        = 屋齡 < 15 = 0；≥ 15 依房數 27/35/45
 *   3-5 衛浴        = 屋齡 < 15 = 0；≥ 15 翻新×15 + 新增×25
 *   3-6 窗戶        = 一般窗 0.8/扇 + 落地窗 3.5/扇
 *   4. 工程小計 = Step 2 + Σ Step 3
 *   5. 設計費 = max(室內坪數, 15) × 設計費單價
 *   6. 監工費 = 工程小計 × 10%
 *   7. 稅 = (工程 + 設計 + 監工) × 5%
 *   8. 預估總價 = 工程 + 設計 + 監工 + 稅
 *   9. 客戶區間 = 總價 × (1 + 下緣%) ~ 總價 × (1 + 上緣%)，依信心度動態
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GLNEstimate = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ────────────────────────────────────────────────
  // 工具
  // ────────────────────────────────────────────────

  function findCaseType(params, caseTypeKey) {
    const opt = params.case_type.options.find(o => o.key === caseTypeKey);
    if (!opt) throw new Error(`找不到案型：${caseTypeKey}`);
    return opt;
  }

  function findScaleMultiplier(params, ping, caseTypeOpt) {
    if (caseTypeOpt.force_scale_one) return 1.00;
    for (const r of params.scale_discount.rules) {
      if (ping <= r.ping_max) return r.multiplier;
    }
    return 1.00;
  }

  function findRegionZone(params, county) {
    for (const z of params.region_adjustment.zones) {
      if (z.counties.some(c => county.includes(c))) return z;
    }
    return params.region_adjustment.zones.find(z => z.key === 'south');
  }

  function sumConditionAdj(params, conditionKeys) {
    const lookup = Object.fromEntries(
      params.condition_adjustment.options.map(o => [o.key, o.adjustment_pct])
    );
    const raw = conditionKeys.reduce((s, k) => s + (lookup[k] || 0), 0);
    const cap = params.condition_adjustment.cap_pct;
    return { raw, capped: Math.min(raw, cap), cap };
  }

  function findStyleMultiplier(params, styleKey) {
    const opt = params.style_factor.options.find(o => o.key === styleKey);
    if (!opt) throw new Error(`找不到風格：${styleKey}`);
    return opt;
  }

  function calcLargeEquipment(params, equipKeys, caseTypeOpt, rooms, floors) {
    const isTownhouse = caseTypeOpt.category === 'townhouse';
    let total = 0;
    const lines = [];
    for (const key of equipKeys) {
      const opt = params.large_equipment.options.find(o => o.key === key);
      if (!opt) continue;
      let amount = 0;
      if (opt.apartment_10k_per_unit != null) {
        const perUnit = isTownhouse ? opt.townhouse_10k_per_unit : opt.apartment_10k_per_unit;
        const basis = isTownhouse ? opt.unit_basis_townhouse : opt.unit_basis_apartment;
        const units = basis === 'floors' ? (floors || 2) : (rooms + 1);
        amount = perUnit * units;
      } else {
        const v = isTownhouse ? opt.townhouse_10k : opt.apartment_10k;
        amount = (v == null) ? 0 : v;
      }
      total += amount;
      lines.push({ key, label: opt.label, amount });
    }
    return { total, lines };
  }

  function calcSmartHome(params, smartKey, caseTypeOpt) {
    const opt = params.smart_home.options.find(o => o.key === smartKey) ||
                params.smart_home.options[0];
    const isTownhouse = caseTypeOpt.category === 'townhouse';
    const amount = isTownhouse ? opt.townhouse_10k : opt.apartment_10k;
    return { amount, label: opt.label, key: opt.key };
  }

  function calcKitchen(params, rooms, age, hasKitchen) {
    if (!hasKitchen) return 0;
    if (age < params.kitchen_addon.age_threshold) return 0;
    let pick = params.kitchen_addon.rules[0];
    for (const r of params.kitchen_addon.rules) {
      if (rooms >= r.rooms) pick = r;
    }
    return pick.amount_10k;
  }

  function calcBathroom(params, renovate, addNew, age) {
    if (age < params.bathroom_addon.age_threshold) return 0;
    return renovate * params.bathroom_addon.renovate_per_unit_10k
         + addNew   * params.bathroom_addon.add_new_per_unit_10k;
  }

  function calcWindow(params, regularCount, balconyCount) {
    return regularCount * params.window_addon.regular_per_unit_10k
         + balconyCount * params.window_addon.balcony_per_unit_10k;
  }

  function findDesignFeePerPing(params, regionZone, caseTypeKey) {
    const feeZoneKey = regionZone.design_fee_zone;
    const feeZone = params.design_fee.rates_per_ping[feeZoneKey];
    const isNewHouse = (caseTypeKey === 'new_house');
    return isNewHouse ? feeZone.new_house : feeZone.midage_old;
  }

  function calcConfidence(params, inputs) {
    const f = params.confidence.factors;
    let score = 0;
    const reasons = [];

    // 案型
    const caseScore = f.case_type[inputs.caseType] || 0;
    score += caseScore;
    reasons.push({ factor: '案型', detail: inputs.caseType, score: caseScore });

    // 屋況勾選數
    const condCount = (inputs.conditions || []).length;
    let condScore = 0;
    for (const tier of f.condition_count) {
      if (condCount <= tier.max_count) { condScore = tier.score; break; }
    }
    score += condScore;
    reasons.push({ factor: '屋況勾選', detail: `${condCount} 項`, score: condScore });

    // 風格
    const styleScore = f.style[inputs.style] || 0;
    score += styleScore;
    reasons.push({ factor: '風格', detail: inputs.style, score: styleScore });

    // 大設備數
    const equipCount = (inputs.largeEquipment || []).length;
    let equipScore = 0;
    for (const tier of f.large_equipment_count) {
      if (equipCount <= tier.max_count) { equipScore = tier.score; break; }
    }
    score += equipScore;
    reasons.push({ factor: '大設備勾選', detail: `${equipCount} 項`, score: equipScore });

    // 年輕屋齡加分
    let ageScore = 0;
    if (inputs.age < f.young_age_bonus.age_below) {
      ageScore = f.young_age_bonus.score;
    }
    score += ageScore;
    reasons.push({ factor: `屋齡 < ${f.young_age_bonus.age_below}`, detail: `${inputs.age} 年`, score: ageScore });

    // 找對應 tier
    const tier = params.confidence.tiers.find(t => score >= t.min_score) ||
                 params.confidence.tiers[params.confidence.tiers.length - 1];
    return { score, tier, reasons };
  }

  // ────────────────────────────────────────────────
  // 主函式
  // ────────────────────────────────────────────────

  /**
   * @param {Object} params - 從 params.json 載入
   * @param {Object} inputs
   * @param {string} inputs.caseType - new_house | midage | old_house | townhouse_mid | townhouse_old
   * @param {number} inputs.age      - 屋齡（年）
   * @param {number} inputs.ping     - 室內坪數
   * @param {string} inputs.county   - 縣市名稱
   * @param {string[]} inputs.conditions - 屋況 key 陣列
   * @param {string} inputs.style    - simple | local | refined
   * @param {number} inputs.rooms    - 房數
   * @param {number} [inputs.floors] - 樓層數（透天用，預設 2）
   * @param {boolean} inputs.hasKitchen   - 廚房翻新
   * @param {number} inputs.bathroomsRenovate
   * @param {number} inputs.bathroomsNew
   * @param {number} inputs.regularWindows - 一般窗扇數
   * @param {number} inputs.balconyWindows - 落地窗扇數
   * @param {string[]} inputs.largeEquipment - 大設備 key 陣列
   * @param {string} inputs.smartHome - 智能家電層級 key
   */
  function estimate(params, inputs) {
    const {
      caseType, age, ping, county,
      conditions = [], style = 'local',
      rooms = 3, floors = 2,
      hasKitchen = false,
      bathroomsRenovate = 0, bathroomsNew = 0,
      regularWindows = 0, balconyWindows = 0,
      largeEquipment = [],
      smartHome = 'none'
    } = inputs;

    const caseOpt = findCaseType(params, caseType);
    const scaleMult = findScaleMultiplier(params, ping, caseOpt);
    const region = findRegionZone(params, county);
    const cond = sumConditionAdj(params, conditions);
    const styleOpt = findStyleMultiplier(params, style);

    // Step 1: 每坪單價
    const adjMultiplier = 1 + (region.adjustment_pct + cond.capped) / 100;
    const unitPrice = params.base_price_per_ping_10k
                    * caseOpt.multiplier
                    * scaleMult
                    * styleOpt.multiplier
                    * adjMultiplier;

    // Step 2: 主體小計
    const mainBody = unitPrice * ping;

    // Step 3-1 ~ 3-6
    const aircon = (rooms + 1) * params.aircon.per_unit_10k;
    const equip  = calcLargeEquipment(params, largeEquipment, caseOpt, rooms, floors);
    const smart  = calcSmartHome(params, smartHome, caseOpt);
    const kitchen = calcKitchen(params, rooms, age, hasKitchen);
    const bathroom = calcBathroom(params, bathroomsRenovate, bathroomsNew, age);
    const windowFee = calcWindow(params, regularWindows, balconyWindows);

    // Step 4: 工程小計
    const engineeringSubtotal = mainBody + aircon + equip.total + smart.amount
                              + kitchen + bathroom + windowFee;

    // Step 5: 設計費
    const feePerPing = findDesignFeePerPing(params, region, caseType);
    const designPing = Math.max(ping, params.design_fee.min_ping);
    const designFee = (designPing * feePerPing) / 10000; // 元 → 萬

    // Step 6: 監工費
    const supervisionFee = engineeringSubtotal * (params.additional_fees.supervision_pct / 100);

    // Step 7: 稅
    const taxBase = engineeringSubtotal + supervisionFee + designFee;
    const tax = taxBase * (params.additional_fees.tax_pct / 100);

    // Step 8: 總價
    const total = engineeringSubtotal + designFee + supervisionFee + tax;

    // Step 9: 客戶區間（依信心度）
    const conf = calcConfidence(params, { caseType, conditions, style, largeEquipment, age });
    const lower = total * (1 + conf.tier.lower_pct / 100);
    const upper = total * (1 + conf.tier.upper_pct / 100);

    // 6 大類分區（給結果頁顯示用）
    // 2026-05-24：split 以 caseType 為 key，5 類各自區分（含 townhouse_mid / townhouse_old）
    const splitRef = params.category_breakdown_ref.main_body_split;
    const split = splitRef[caseType] || splitRef.midage;
    const splitTotal = (split.基礎工程_pct + split.裝修工程_pct);
    const categoryBreakdown = {
      '基礎工程':  round0(mainBody * split.基礎工程_pct / splitTotal),
      '裝修工程':  round0(mainBody * split.裝修工程_pct / splitTotal),
      '冷氣':      round1(aircon),
      '大型設備':  round1(equip.total),
      '智能家電':  round1(smart.amount),
      '廚房設備':  round1(kitchen),
      '衛浴設備':  round1(bathroom),
      '窗戶':      round1(windowFee)
    };

    return {
      unitPrice: round2(unitPrice),
      mainBody: round1(mainBody),
      aircon: round1(aircon),
      largeEquipmentTotal: round1(equip.total),
      largeEquipmentLines: equip.lines,
      smartHome: { ...smart, amount: round1(smart.amount) },
      kitchen: round1(kitchen),
      bathroom: round1(bathroom),
      windowFee: round1(windowFee),
      engineeringSubtotal: round1(engineeringSubtotal),
      designFee: round1(designFee),
      supervisionFee: round2(supervisionFee),
      tax: round2(tax),
      total: round0(total),
      clientRange: [round0(lower), round0(upper)],
      confidence: {
        score: conf.score,
        label: conf.tier.label,
        lowerPct: conf.tier.lower_pct,
        upperPct: conf.tier.upper_pct,
        strategy: conf.tier.strategy,
        color: conf.tier.color,
        reasons: conf.reasons
      },
      breakdown: {
        basePrice: params.base_price_per_ping_10k,
        caseTypeKey: caseType,
        caseTypeMultiplier: caseOpt.multiplier,
        scaleMultiplier: scaleMult,
        styleKey: style,
        styleMultiplier: styleOpt.multiplier,
        regionZone: region.label,
        regionAdjPct: region.adjustment_pct,
        conditionAdjRaw: cond.raw,
        conditionAdjCapped: cond.capped,
        conditionCap: cond.cap,
        designFeePerPing: feePerPing,
        designPing: designPing
      },
      categoryBreakdown
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function round0(x) { return Math.round(x); }

  return { estimate };
}));
