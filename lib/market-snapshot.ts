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
  modules: Record<string, ModuleState>;
  quality: {
    score: number;
    checks: QualityCheck[];
  };
  errors: string[];
};
