import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from research_engine import build_analytics  # noqa: E402


class ResearchEngineTest(unittest.TestCase):
    def test_builds_versioned_python_analytics_without_lookahead(self):
        dates = [f"202601{day:02d}" for day in range(1, 32)] + [f"202602{day:02d}" for day in range(1, 20)]
        histories = []
        indexes = []
        for index in range(5):
            rows = [{"tradeDate": date, "close": 100 + day * (index + 1)} for day, date in enumerate(dates)]
            histories.append({"code": f"IDX{index}", "name": f"指数{index}", "rows": rows})
            indexes.append({"code": f"IDX{index}", "name": f"指数{index}", "close": rows[-1]["close"], "pctChange": 1, "returnPct": index + 1})
        inputs = {
            "schemaVersion": "research-inputs/v1",
            "tradeDate": dates[-1],
            "market": {"amountYi": 20000, "netMoneyflowYi": -100},
            "periods": {
                "今日": {"endDate": dates[-1]},
                "20日": {"averageReturnPct": 3, "indexes": indexes},
            },
            "industries": [
                {"name": "行业A", "pctChange": 1, "return20d": 5},
                {"name": "行业B", "pctChange": -1, "return20d": -2},
            ],
            "financials": [{"roe": 10}, {"roe": 8}],
            "valuation": {"medianPeTtm": 20},
            "indexHistory": histories,
        }
        analytics = build_analytics(inputs)
        self.assertEqual(analytics["engine"], "python")
        self.assertEqual(analytics["schemaVersion"], "research-analytics/v1")
        self.assertEqual(len(analytics["factors"]), 5)
        self.assertEqual(sum(item["weight"] for item in analytics["portfolio"]), 100)
        self.assertEqual(analytics["portfolio"][0]["name"], "指数4")
        self.assertIsNotNone(analytics["backtest"])
        self.assertIn("不使用当日收盘后的未来信息", analytics["backtest"]["methodology"])


if __name__ == "__main__":
    unittest.main()
