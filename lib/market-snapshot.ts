export type ModuleState = {
  status: "live" | "partial" | "unavailable";
  records: number;
  message: string;
};

export type IndexSnapshot = {
  code: string;
  name: string;
  close: number;
  pctChange: number;
};

export type PeriodIndexSnapshot = IndexSnapshot & {
  returnPct: number;
};

export type PeriodSnapshot = {
  startDate: string;
  endDate: string;
  tradingDays: number;
  averageReturnPct: number;
  best: PeriodIndexSnapshot | null;
  worst: PeriodIndexSnapshot | null;
  indexes: PeriodIndexSnapshot[];
};

export type QualityCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type IndustrySnapshot = {
  code: string;
  name: string;
  close: number;
  pctChange: number;
  return20d: number | null;
  return60d: number | null;
  pe: number | null;
  pb: number | null;
};

export type SecurityFlowSnapshot = {
  code: string;
  name: string;
  pctChange: number;
  netAmountYi: number;
};

export type ComponentSnapshot = {
  code: string;
  name: string;
  group: "老登" | "中登" | "小登";
  close: number;
  pctChange: number;
  return20d: number | null;
  return60d: number | null;
  distance20dMaPct: number | null;
  maxDrawdown60dPct: number | null;
};

export type EventSnapshot = {
  code: string;
  name: string;
  announcedAt: string;
  endDate: string;
  type: string;
  changeMin: number | null;
  changeMax: number | null;
};

export type FinancialSnapshot = {
  code: string;
  name: string;
  announcedAt: string;
  endDate: string;
  roe: number | null;
  grossMargin: number | null;
  debtToAssets: number | null;
  operatingCashflowRatio: number | null;
};

export type InstrumentSnapshot = {
  code: string;
  close: number;
  pctChange: number | null;
  amountYi: number | null;
  openInterest: number | null;
};

export type AnalyticsSnapshot = {
  observations: Array<{
    title: string;
    direction: "positive" | "neutral" | "negative";
    summary: string;
    evidence: string[];
  }>;
  factors: Array<{
    name: string;
    score: number;
    signal: string;
    evidence: string;
  }>;
  portfolio: Array<{
    code: string;
    name: string;
    weight: number;
    reason: string;
  }>;
  backtest: {
    startDate: string;
    endDate: string;
    observations: number;
    totalReturnPct: number;
    benchmarkReturnPct: number;
    annualizedVolatilityPct: number;
    maxDrawdownPct: number;
    excessWinRatePct: number;
    methodology: string;
  } | null;
};

export type MarketSnapshot = {
  generatedAt: string;
  tradeDate: string;
  source: "Tushare Pro";
  status: "live" | "partial";
  market: {
    securities: number;
    up: number;
    down: number;
    flat: number;
    averagePctChange: number;
    amountYi: number;
    totalMarketValueYi: number | null;
    netMoneyflowYi: number | null;
  };
  indexes: IndexSnapshot[];
  periods: Record<"今日" | "20日" | "60日", PeriodSnapshot>;
  domains: {
    industries: IndustrySnapshot[];
    components: ComponentSnapshot[];
    valuation: {
      medianPeTtm: number | null;
      medianPb: number | null;
      profitablePeCoverage: number;
    };
    financials: FinancialSnapshot[];
    flows: SecurityFlowSnapshot[];
    events: EventSnapshot[];
    futures: InstrumentSnapshot[];
    funds: InstrumentSnapshot[];
  };
  analytics: AnalyticsSnapshot;
  modules: Record<string, ModuleState>;
  quality: {
    score: number;
    checks: QualityCheck[];
  };
  errors: string[];
};
