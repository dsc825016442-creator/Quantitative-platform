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

  const [dailyBasic, moneyflow, forecast, funds, futures, ...indexResults] =
    await Promise.all([
      query(token, "daily_basic", { trade_date: tradeDate }, "ts_code,trade_date,total_mv,pe_ttm,pb"),
      query(token, "moneyflow", { trade_date: tradeDate }, "ts_code,trade_date,net_mf_amount"),
      query(token, "forecast", { ann_date: tradeDate }, "ts_code,ann_date,end_date,type,p_change_min,p_change_max"),
      query(token, "fund_daily", { trade_date: tradeDate }, "ts_code,trade_date,close,pct_chg,amount"),
      query(token, "fut_daily", { trade_date: tradeDate, exchange: "CFFEX" }, "ts_code,trade_date,close,settle,vol,oi"),
      ...indexDefinitions.map(([tsCode]) =>
        query(token, "index_daily", { ts_code: tsCode, start_date: dateDaysAgo(120), end_date: tradeDate }, "ts_code,trade_date,close,pct_chg"),
      ),
    ]);

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

  const moduleResults: Record<string, ModuleState> = {
    行情: { status: "live", records: daily.rows.length, message: `最新交易日 ${tradeDate}` },
    财务: moduleState(dailyBasic, "日频估值截面已更新"),
    指数行业: indexes.length
      ? { status: indexes.length === indexDefinitions.length ? "live" : "partial", records: indexes.length, message: "核心指数已更新；行业成员沿用最近版本" }
      : { status: "unavailable", records: 0, message: "核心指数接口不可用" },
    资金: moduleState(moneyflow, "个股资金流已聚合"),
    事件预期: moduleState(forecast, "近30日业绩预告已更新"),
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
  const checks = qualityChecks(daily.rows, indexes, market, moduleResults);
  const qualityScore = Math.round(
    checks.reduce((sum, check) => sum + (check.status === "pass" ? 100 : check.status === "warn" ? 60 : 0), 0) / checks.length,
  );
  const errors = [
    dailyBasic.error,
    moneyflow.error,
    forecast.error,
    funds.error,
    futures.error,
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
    modules: moduleResults,
    quality: { score: qualityScore, checks },
    errors,
  };
}
