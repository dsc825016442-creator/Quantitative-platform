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
  modules: Record<string, ModuleState>;
  errors: string[];
};
