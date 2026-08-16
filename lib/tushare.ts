import type {
  MarketSnapshot,
  ModuleState,
  PeriodSnapshot,
  QualityCheck,
} from "./market-snapshot";

type TushareResponse = {
  code: number;
  msg: string | null;
  data?: { fields?: string[]; items?: unknown[][] };
};

type QueryResult = {
  rows: Record<string, unknown>[];
  error: string | null;
};

const endpoint = "https://api.tushare.pro";

function chinaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("-", "");
}

function dateDaysAgo(days: number) {
  return chinaDate(new Date(Date.now() - days * 86_400_000));
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

async function query(
  token: string,
  apiName: string,
  params: Record<string, string>,
  fields: string,
): Promise<QueryResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_name: apiName, token, params, fields }),
    });
    if (!response.ok) {
      return { rows: [], error: `${apiName}: HTTP ${response.status}` };
    }
    const payload = (await response.json()) as TushareResponse;
    if (payload.code !== 0) {
      return { rows: [], error: `${apiName}: ${payload.msg || `code ${payload.code}`}` };
    }
    const names = payload.data?.fields ?? [];
    const rows = (payload.data?.items ?? []).map(item =>
      Object.fromEntries(names.map((name, index) => [name, item[index]])),
    );
    return { rows, error: null };
  } catch (error) {
    return {
      rows: [],
      error: `${apiName}: ${error instanceof Error ? error.message : "request failed"}`,
    };
  }
}

async function latestDaily(token: string) {
  for (let offset = 0; offset < 10; offset += 1) {
    const tradeDate = dateDaysAgo(offset);
    const result = await query(
      token,
      "daily",
      { trade_date: tradeDate },
      "ts_code,trade_date,close,pct_chg,amount",
    );
    if (result.error) return { ...result, tradeDate };
    if (result.rows.length) return { ...result, tradeDate };
  }
  return { rows: [], error: "daily: 最近10日没有可用行情", tradeDate: chinaDate() };
}

function moduleState(result: QueryResult, successMessage: string): ModuleState {
  if (result.error) {
    return { status: "unavailable", records: 0, message: result.error };
  }
  if (!result.rows.length) {
    return { status: "partial", records: 0, message: "本批次暂无记录" };
  }
  return { status: "live", records: result.rows.length, message: successMessage };
}

function buildPeriod(
  indexDefinitions: readonly (readonly [string, string])[],
  indexResults: QueryResult[],
  tradingDays: 0 | 20 | 60,
  tradeDate: string,
): PeriodSnapshot {
  const indexes = indexResults.flatMap((result, index) => {
    const history = [...result.rows].sort((left, right) =>
      String(left.trade_date).localeCompare(String(right.trade_date)),
    );
    const latest = history.at(-1);
    if (!latest) return [];
    const anchor = tradingDays === 0 ? latest : history.at(-(tradingDays + 1));
    if (!anchor) return [];
    const latestClose = number(latest.close);
    const anchorClose = number(anchor.close);
    const returnPct = tradingDays === 0
      ? number(latest.pct_chg)
      : anchorClose > 0
        ? (latestClose / anchorClose - 1) * 100
        : 0;
    return [{
      code: indexDefinitions[index][0],
      name: indexDefinitions[index][1],
      close: latestClose,
      pctChange: number(latest.pct_chg),
      returnPct,
      startDate: String(anchor.trade_date),
    }];
  });
  const ranked = [...indexes].sort((left, right) => right.returnPct - left.returnPct);
  return {
    startDate: indexes[0]?.startDate ?? tradeDate,
    endDate: tradeDate,
    tradingDays: tradingDays || 1,
    averageReturnPct: indexes.length
      ? indexes.reduce((sum, item) => sum + item.returnPct, 0) / indexes.length
      : 0,
    best: ranked[0] ?? null,
    worst: ranked.at(-1) ?? null,
    indexes: indexes.map(item => ({
      code: item.code,
      name: item.name,
      close: item.close,
      pctChange: item.pctChange,
      returnPct: item.returnPct,
    })),
  };
}

function qualityChecks(
  dailyRows: Record<string, unknown>[],
  indexes: MarketSnapshot["indexes"],
  market: MarketSnapshot["market"],
  moduleResults: Record<string, ModuleState>,
): QualityCheck[] {
  const breadthTotal = market.up + market.down + market.flat;
  const checks: QualityCheck[] = [
    {
      id: "daily_coverage",
      label: "日线覆盖",
      status: dailyRows.length >= 5_000 ? "pass" : dailyRows.length >= 4_500 ? "warn" : "fail",
      detail: `${dailyRows.length} 只证券`,
    },
    {
      id: "breadth_balance",
      label: "涨跌家数守恒",
      status: breadthTotal === market.securities ? "pass" : "fail",
      detail: `${breadthTotal} / ${market.securities}`,
    },
    {
      id: "turnover_positive",
      label: "成交额有效",
      status: market.amountYi > 0 ? "pass" : "fail",
      detail: `${market.amountYi.toFixed(0)} 亿元`,
    },
    {
      id: "index_coverage",
      label: "核心指数覆盖",
      status: indexes.length === 5 ? "pass" : indexes.length >= 3 ? "warn" : "fail",
      detail: `${indexes.length} / 5`,
    },
    {
      id: "price_bounds",
      label: "涨跌幅边界",
      status: dailyRows.every(row => Math.abs(number(row.pct_chg)) <= 25) ? "pass" : "warn",
      detail: "检查单日绝对涨跌幅 ≤ 25%",
    },
    {
      id: "module_availability",
      label: "模块可用性",
      status: Object.values(moduleResults).every(module => module.status === "live") ? "pass" : "warn",
      detail: `${Object.values(moduleResults).filter(module => module.status === "live").length} / ${Object.keys(moduleResults).length} 实时`,
    },
  ];
  return checks;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildBacktest(indexResults: QueryResult[]): MarketSnapshot["analytics"]["backtest"] {
  const histories = indexResults.map(result => new Map(result.rows.map(row => [String(row.trade_date), number(row.close)])));
  const dates = [...histories[0].keys()]
    .filter(date => histories.every(history => history.has(date)))
    .sort();
  if (dates.length < 42) return null;
  let equity = 1;
  let benchmarkEquity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let excessWins = 0;
  const returns: number[] = [];
  for (let day = 20; day < dates.length; day += 1) {
    const previousDate = dates[day - 1];
    const signalDate = dates[day - 20];
    const currentDate = dates[day];
    const ranking = histories.map((history, index) => ({
      index,
      momentum: number(history.get(previousDate)) / number(history.get(signalDate)) - 1,
    })).sort((left, right) => right.momentum - left.momentum);
    const weights = new Array(histories.length).fill(0.1);
    weights[ranking[0].index] = 0.35;
    weights[ranking[1].index] = 0.25;
    weights[ranking[2].index] = 0.2;
    const dailyReturns = histories.map(history => number(history.get(currentDate)) / number(history.get(previousDate)) - 1);
    const modelReturn = dailyReturns.reduce((sum, value, index) => sum + value * weights[index], 0);
    const benchmarkReturn = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
    equity *= 1 + modelReturn;
    benchmarkEquity *= 1 + benchmarkReturn;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
    excessWins += modelReturn > benchmarkReturn ? 1 : 0;
    returns.push(modelReturn);
  }
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, returns.length - 1);
  return {
    startDate: dates[20],
    endDate: dates.at(-1) ?? dates[20],
    observations: returns.length,
    totalReturnPct: (equity - 1) * 100,
    benchmarkReturnPct: (benchmarkEquity - 1) * 100,
    annualizedVolatilityPct: Math.sqrt(variance * 252) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    excessWinRatePct: returns.length ? excessWins / returns.length * 100 : 0,
    methodology: "使用前20日动量排名生成次日权重；不使用当日收盘后的未来信息。",
  };
}

function buildAnalytics(
  periods: MarketSnapshot["periods"],
  market: MarketSnapshot["market"],
  industries: MarketSnapshot["domains"]["industries"],
  financials: MarketSnapshot["domains"]["financials"],
  valuation: MarketSnapshot["domains"]["valuation"],
  indexResults: QueryResult[],
): MarketSnapshot["analytics"] {
  const backtest = buildBacktest(indexResults);
  const industryAdvanceRate = industries.length
    ? industries.filter(industry => industry.pctChange > 0).length / industries.length * 100
    : 0;
  const averageRoe = financials.length
    ? financials.reduce((sum, item) => sum + (item.roe ?? 0), 0) / financials.length
    : 0;
  const factorInputs = [
    { name: "动量", score: clamp(50 + periods["20日"].averageReturnPct * 5), evidence: `核心指数20日均值 ${periods["20日"].averageReturnPct.toFixed(2)}%` },
    { name: "价值", score: clamp(100 - (valuation.medianPeTtm ?? 50) * 1.5), evidence: `PE(TTM)中位数 ${valuation.medianPeTtm?.toFixed(2) ?? "暂无"}` },
    { name: "质量", score: clamp(45 + averageRoe * 2), evidence: `代表公司ROE均值 ${averageRoe.toFixed(2)}%` },
    { name: "广度", score: clamp(industryAdvanceRate), evidence: `申万一级上涨占比 ${industryAdvanceRate.toFixed(1)}%` },
    { name: "流动性", score: clamp(35 + Math.log10(Math.max(1, market.amountYi)) * 12), evidence: `全A成交额 ${market.amountYi.toFixed(0)}亿元` },
  ];
  const factors = factorInputs.map(factor => ({
    ...factor,
    score: Math.round(factor.score),
    signal: factor.score >= 65 ? "偏强" : factor.score <= 35 ? "偏弱" : "中性",
  }));
  const rankedIndexes = [...periods["20日"].indexes].sort((left, right) => right.returnPct - left.returnPct);
  const rankWeights = [30, 25, 20, 15, 10];
  const portfolio = rankedIndexes.map((index, rank) => ({
    code: index.code,
    name: index.name,
    weight: rankWeights[rank] ?? 0,
    reason: `20日收益排名第 ${rank + 1}（${index.returnPct.toFixed(2)}%）`,
  }));
  const bestIndustry = industries.find(industry => industry.return20d !== null);
  const observations: MarketSnapshot["analytics"]["observations"] = [
    {
      title: "市场广度",
      direction: industryAdvanceRate >= 55 ? "positive" : industryAdvanceRate < 40 ? "negative" : "neutral",
      summary: `${industries.filter(item => item.pctChange > 0).length}/${industries.length} 个申万一级行业上涨，广度为 ${industryAdvanceRate.toFixed(1)}%。`,
      evidence: ["sw_daily", `trade_date=${periods.今日.endDate}`],
    },
    {
      title: "中期主线",
      direction: (bestIndustry?.return20d ?? 0) > 0 ? "positive" : "neutral",
      summary: bestIndustry ? `${bestIndustry.name} 20日收益 ${bestIndustry.return20d?.toFixed(2) ?? "—"}%，位居一级行业首位。` : "行业历史窗口暂不可用。",
      evidence: ["index_classify", "sw_daily"],
    },
    {
      title: "资金与风险",
      direction: (market.netMoneyflowYi ?? 0) >= 0 ? "positive" : "negative",
      summary: `全A资金流估算 ${market.netMoneyflowYi?.toFixed(1) ?? "—"} 亿元；该口径为成交拆单模型，不代表账户真实迁移。`,
      evidence: ["moneyflow", "算法估算口径"],
    },
  ];
  return { observations, factors, portfolio, backtest };
}

export async function buildMarketSnapshot(token: string): Promise<MarketSnapshot> {
  const daily = await latestDaily(token);
  if (daily.error || !daily.rows.length) {
    throw new Error(daily.error || "Tushare 日线行情为空");
  }

  const tradeDate = daily.tradeDate;
  const indexDefinitions = [
    ["000300.SH", "沪深300"],
    ["000016.SH", "上证50"],
    ["000905.SH", "中证500"],
    ["000852.SH", "中证1000"],
    ["399006.SZ", "创业板指"],
  ] as const;

  const [dailyBasic, moneyflow, forecast, funds, futures, stockBasic, swClassify, ...indexResults] =
    await Promise.all([
      query(token, "daily_basic", { trade_date: tradeDate }, "ts_code,trade_date,total_mv,pe_ttm,pb"),
      query(token, "moneyflow", { trade_date: tradeDate }, "ts_code,trade_date,net_mf_amount"),
      query(token, "forecast", { ann_date: tradeDate }, "ts_code,ann_date,end_date,type,p_change_min,p_change_max"),
      query(token, "fund_daily", { trade_date: tradeDate }, "ts_code,trade_date,close,pct_chg,amount"),
      query(token, "fut_daily", { trade_date: tradeDate, exchange: "CFFEX" }, "ts_code,trade_date,close,settle,vol,oi"),
      query(token, "stock_basic", { list_status: "L" }, "ts_code,name,industry,market,list_date"),
      query(token, "index_classify", { level: "L1", src: "SW2021" }, "index_code,industry_name,level,industry_code,is_pub"),
      ...indexDefinitions.map(([tsCode]) =>
        query(token, "index_daily", { ts_code: tsCode, start_date: dateDaysAgo(120), end_date: tradeDate }, "ts_code,trade_date,close,pct_chg"),
      ),
    ]);

  const representativeCodes = [...dailyBasic.rows]
    .sort((left, right) => number(right.total_mv) - number(left.total_mv))
    .slice(0, 20)
    .map(row => String(row.ts_code));
  const financialQueryResults = await Promise.all(representativeCodes.map(tsCode =>
    query(token, "fina_indicator", { ts_code: tsCode, start_date: dateDaysAgo(730), end_date: tradeDate }, "ts_code,ann_date,end_date,roe,grossprofit_margin,debt_to_assets,ocf_to_or"),
  ));
  const financialRows = financialQueryResults.flatMap(result => {
    const latest = [...result.rows].sort((left, right) => String(right.ann_date).localeCompare(String(left.ann_date)))[0];
    return latest ? [latest] : [];
  });
  const financialErrors = financialQueryResults.map(result => result.error).filter((message): message is string => Boolean(message));
  const financials: QueryResult = {
    rows: financialRows,
    error: financialRows.length ? null : financialErrors[0] ?? null,
  };
  const swHistoryResults = await Promise.all(swClassify.rows.map(row =>
    query(token, "sw_daily", { ts_code: String(row.index_code), start_date: dateDaysAgo(120), end_date: tradeDate }, "ts_code,trade_date,name,close,pct_change,pe,pb"),
  ));
  const swHistoryRows = swHistoryResults.flatMap(result => result.rows);
  const swHistoryErrors = swHistoryResults.map(result => result.error).filter((message): message is string => Boolean(message));
  const swDaily: QueryResult = {
    rows: swHistoryRows,
    error: swHistoryRows.length ? null : swHistoryErrors[0] ?? null,
  };
  const dailyByCode = new Map(daily.rows.map(row => [String(row.ts_code), row]));
  const marketCapRanking = [...dailyBasic.rows].sort((left, right) => number(right.total_mv) - number(left.total_mv));
  const byLiquidity = (rows: Record<string, unknown>[]) => [...rows]
    .sort((left, right) => number(dailyByCode.get(String(right.ts_code))?.amount) - number(dailyByCode.get(String(left.ts_code))?.amount))
    .slice(0, 7);
  const componentDefinitions = [
    ...marketCapRanking.slice(0, 7).map(row => ({ code: String(row.ts_code), group: "老登" as const })),
    ...byLiquidity(marketCapRanking.slice(500, 2_000)).map(row => ({ code: String(row.ts_code), group: "中登" as const })),
    ...byLiquidity(marketCapRanking.slice(2_000)).map(row => ({ code: String(row.ts_code), group: "小登" as const })),
  ];
  const componentHistoryResults = await Promise.all(componentDefinitions.map(item =>
    query(token, "daily", { ts_code: item.code, start_date: dateDaysAgo(120), end_date: tradeDate }, "ts_code,trade_date,close,pct_chg,amount"),
  ));

  const indexes = indexResults.flatMap((result, index) => {
    const row = [...result.rows].sort((left, right) =>
      String(right.trade_date).localeCompare(String(left.trade_date)),
    )[0];
    if (!row) return [];
    return [{
      code: indexDefinitions[index][0],
      name: indexDefinitions[index][1],
      close: number(row.close),
      pctChange: number(row.pct_chg),
    }];
  });

  const changes = daily.rows.map(row => number(row.pct_chg));
  const totalAmountYi = daily.rows.reduce((sum, row) => sum + number(row.amount), 0) / 100_000;
  const totalMarketValueYi = dailyBasic.rows.length
    ? dailyBasic.rows.reduce((sum, row) => sum + number(row.total_mv), 0) / 10_000
    : null;
  const netMoneyflowYi = moneyflow.rows.length
    ? moneyflow.rows.reduce((sum, row) => sum + number(row.net_mf_amount), 0) / 10_000
    : null;

  const securityNames = new Map(stockBasic.rows.map(row => [String(row.ts_code), String(row.name || row.ts_code)]));
  const dailyChanges = new Map(daily.rows.map(row => [String(row.ts_code), number(row.pct_chg)]));
  const components = componentHistoryResults.flatMap((result, index) => {
    const definition = componentDefinitions[index];
    const history = [...result.rows].sort((left, right) => String(left.trade_date).localeCompare(String(right.trade_date)));
    const latest = history.at(-1);
    if (!latest) return [];
    const latestClose = number(latest.close);
    const periodReturn = (days: number) => {
      const anchorClose = number(history.at(-(days + 1))?.close);
      return anchorClose > 0 ? (latestClose / anchorClose - 1) * 100 : null;
    };
    const recent20 = history.slice(-20).map(row => number(row.close)).filter(value => value > 0);
    const movingAverage20 = recent20.length ? recent20.reduce((sum, value) => sum + value, 0) / recent20.length : 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const row of history.slice(-60)) {
      const close = number(row.close);
      peak = Math.max(peak, close);
      if (peak > 0) maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
    }
    return [{
      code: definition.code,
      name: securityNames.get(definition.code) ?? definition.code,
      group: definition.group,
      close: latestClose,
      pctChange: number(latest.pct_chg),
      return20d: periodReturn(20),
      return60d: periodReturn(60),
      distance20dMaPct: movingAverage20 > 0 ? (latestClose / movingAverage20 - 1) * 100 : null,
      maxDrawdown60dPct: maxDrawdown * 100,
    }];
  });
  const peValues = dailyBasic.rows.map(row => number(row.pe_ttm)).filter(value => value > 0 && value < 1_000);
  const pbValues = dailyBasic.rows.map(row => number(row.pb)).filter(value => value > 0 && value < 100);
  const levelOneCodes = new Set(swClassify.rows.map(row => String(row.index_code)));
  const levelOneNames = new Map(swClassify.rows.map(row => [String(row.index_code), String(row.industry_name || row.index_code)]));
  const industriesByCode = new Map<string, Record<string, unknown>[]>();
  for (const row of swDaily.rows) {
    const code = String(row.ts_code);
    if (levelOneCodes.size && !levelOneCodes.has(code)) continue;
    industriesByCode.set(code, [...(industriesByCode.get(code) ?? []), row]);
  }
  const industries = [...industriesByCode.entries()].flatMap(([code, rows]) => {
    const history = [...rows].sort((left, right) => String(left.trade_date).localeCompare(String(right.trade_date)));
    const latest = history.at(-1);
    if (!latest) return [];
    const close = number(latest.close);
    const periodReturn = (days: number) => {
      const anchor = history.at(-(days + 1));
      const anchorClose = number(anchor?.close);
      return anchorClose > 0 ? (close / anchorClose - 1) * 100 : null;
    };
    return [{
      code,
      name: levelOneNames.get(code) ?? String(latest.name || code),
      close,
      pctChange: number(latest.pct_change),
      return20d: periodReturn(20),
      return60d: periodReturn(60),
      pe: optionalNumber(latest.pe),
      pb: optionalNumber(latest.pb),
    }];
  }).sort((left, right) => (right.return20d ?? -Infinity) - (left.return20d ?? -Infinity));
  const flows = moneyflow.rows.map(row => ({
    code: String(row.ts_code),
    name: securityNames.get(String(row.ts_code)) ?? String(row.ts_code),
    pctChange: dailyChanges.get(String(row.ts_code)) ?? 0,
    netAmountYi: number(row.net_mf_amount) / 10_000,
  })).sort((left, right) => Math.abs(right.netAmountYi) - Math.abs(left.netAmountYi)).slice(0, 30);
  const events = forecast.rows.map(row => ({
    code: String(row.ts_code),
    name: securityNames.get(String(row.ts_code)) ?? String(row.ts_code),
    announcedAt: String(row.ann_date || ""),
    endDate: String(row.end_date || ""),
    type: String(row.type || "业绩预告"),
    changeMin: optionalNumber(row.p_change_min),
    changeMax: optionalNumber(row.p_change_max),
  })).slice(0, 30);
  const financialUpdates = financials.rows.map(row => ({
    code: String(row.ts_code),
    name: securityNames.get(String(row.ts_code)) ?? String(row.ts_code),
    announcedAt: String(row.ann_date || ""),
    endDate: String(row.end_date || ""),
    roe: optionalNumber(row.roe),
    grossMargin: optionalNumber(row.grossprofit_margin),
    debtToAssets: optionalNumber(row.debt_to_assets),
    operatingCashflowRatio: optionalNumber(row.ocf_to_or),
  })).slice(0, 50);
  const instruments = (rows: Record<string, unknown>[], includeOpenInterest: boolean) => rows
    .map(row => ({
      code: String(row.ts_code),
      close: number(row.close),
      pctChange: optionalNumber(row.pct_chg),
      amountYi: optionalNumber(row.amount) === null ? null : number(row.amount) / 100_000,
      openInterest: includeOpenInterest ? optionalNumber(row.oi) : null,
    }))
    .sort((left, right) => (right.amountYi ?? right.openInterest ?? 0) - (left.amountYi ?? left.openInterest ?? 0))
    .slice(0, 30);

  const moduleResults: Record<string, ModuleState> = {
    行情: { status: "live", records: daily.rows.length, message: `最新交易日 ${tradeDate}` },
    财务: financials.error
      ? { status: "partial", records: dailyBasic.rows.length, message: `估值已更新；财务指标受限：${financials.error}` }
      : { status: "live", records: dailyBasic.rows.length + financials.rows.length, message: `估值与近30日财务指标已更新（财务 ${financials.rows.length}）` },
    指数行业: indexes.length
      ? { status: indexes.length === indexDefinitions.length && industries.length === 31 && components.length === 21 ? "live" : "partial", records: indexes.length + industries.length + components.length, message: industries.length ? `${industries.length} 个申万行业、${components.length} 只成分与核心指数已更新` : "核心指数已更新；行业行情暂缺" }
      : { status: "unavailable", records: 0, message: "核心指数接口不可用" },
    资金: moduleState(moneyflow, "个股资金流已聚合"),
    事件预期: moduleState(forecast, "当日业绩预告已更新"),
    期货基金: futures.error && funds.error
      ? { status: "unavailable", records: 0, message: `${futures.error}; ${funds.error}` }
      : { status: futures.error || funds.error ? "partial" : "live", records: futures.rows.length + funds.rows.length, message: `期货 ${futures.rows.length} / 基金 ${funds.rows.length}` },
  };

  const market = {
    securities: daily.rows.length,
    up: changes.filter(value => value > 0).length,
    down: changes.filter(value => value < 0).length,
    flat: changes.filter(value => value === 0).length,
    averagePctChange: changes.reduce((sum, value) => sum + value, 0) / changes.length,
    amountYi: totalAmountYi,
    totalMarketValueYi,
    netMoneyflowYi,
  };
  const periods = {
    今日: buildPeriod(indexDefinitions, indexResults, 0, tradeDate),
    "20日": buildPeriod(indexDefinitions, indexResults, 20, tradeDate),
    "60日": buildPeriod(indexDefinitions, indexResults, 60, tradeDate),
  };
  const valuation = {
    medianPeTtm: median(peValues),
    medianPb: median(pbValues),
    profitablePeCoverage: dailyBasic.rows.length ? peValues.length / dailyBasic.rows.length : 0,
  };
  const futuresList = instruments(futures.rows, true);
  const fundsList = instruments(funds.rows, false);
  const analytics = buildAnalytics(periods, market, industries, financialUpdates, valuation, indexResults);
  const checks = qualityChecks(daily.rows, indexes, market, moduleResults);
  checks.push(
    {
      id: "industry_coverage",
      label: "申万一级行业覆盖",
      status: industries.length === 31 ? "pass" : industries.length >= 28 ? "warn" : "fail",
      detail: `${industries.length} / 31`,
    },
    {
      id: "component_coverage",
      label: "研究成分覆盖",
      status: components.length === 21 ? "pass" : components.length >= 18 ? "warn" : "fail",
      detail: `${components.length} / 21`,
    },
  );
  const qualityScore = Math.round(
    checks.reduce((sum, check) => sum + (check.status === "pass" ? 100 : check.status === "warn" ? 60 : 0), 0) / checks.length,
  );
  const errors = [
    dailyBasic.error,
    moneyflow.error,
    forecast.error,
    funds.error,
    futures.error,
    stockBasic.error,
    swClassify.error,
    swDaily.error,
    financials.error,
    ...componentHistoryResults.map(result => result.error),
    ...indexResults.map(result => result.error),
  ].filter((message): message is string => Boolean(message));
  const hasUnavailable =
    Object.values(moduleResults).some(module => module.status !== "live") ||
    checks.some(check => check.status === "fail");

  return {
    generatedAt: new Date().toISOString(),
    tradeDate,
    source: "Tushare Pro",
    status: hasUnavailable ? "partial" : "live",
    market,
    indexes,
    periods,
    domains: {
      industries,
      components,
      valuation,
      financials: financialUpdates,
      flows,
      events,
      futures: futuresList,
      funds: fundsList,
    },
    analytics,
    modules: moduleResults,
    quality: { score: qualityScore, checks },
    errors,
  };
}
