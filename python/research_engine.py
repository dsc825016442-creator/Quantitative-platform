#!/usr/bin/env python3
"""Compute explainable research analytics from protected market inputs."""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return min(maximum, max(minimum, value))


def number(value: Any) -> float:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else 0.0
    except (TypeError, ValueError):
        return 0.0


def build_backtest(index_history: list[dict[str, Any]]) -> dict[str, Any] | None:
    histories = [
        {str(row["tradeDate"]): number(row["close"]) for row in item.get("rows", [])}
        for item in index_history
    ]
    if not histories:
        return None
    dates = sorted(date for date in histories[0] if all(date in history for history in histories))
    if len(dates) < 42:
        return None
    equity = benchmark_equity = peak = 1.0
    max_drawdown = 0.0
    excess_wins = 0
    daily_model_returns: list[float] = []
    for day in range(20, len(dates)):
        previous_date = dates[day - 1]
        signal_date = dates[day - 20]
        current_date = dates[day]
        ranking = sorted(
            range(len(histories)),
            key=lambda index: histories[index][previous_date] / histories[index][signal_date] - 1,
            reverse=True,
        )
        weights = [0.1] * len(histories)
        weights[ranking[0]], weights[ranking[1]], weights[ranking[2]] = 0.35, 0.25, 0.2
        daily_returns = [
            history[current_date] / history[previous_date] - 1 for history in histories
        ]
        model_return = sum(value * weights[index] for index, value in enumerate(daily_returns))
        benchmark_return = statistics.fmean(daily_returns)
        equity *= 1 + model_return
        benchmark_equity *= 1 + benchmark_return
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity / peak - 1)
        excess_wins += int(model_return > benchmark_return)
        daily_model_returns.append(model_return)
    volatility = statistics.stdev(daily_model_returns) * math.sqrt(252) * 100
    return {
        "startDate": dates[20],
        "endDate": dates[-1],
        "observations": len(daily_model_returns),
        "totalReturnPct": (equity - 1) * 100,
        "benchmarkReturnPct": (benchmark_equity - 1) * 100,
        "annualizedVolatilityPct": volatility,
        "maxDrawdownPct": max_drawdown * 100,
        "excessWinRatePct": excess_wins / len(daily_model_returns) * 100,
        "methodology": "Python引擎使用前20日动量排名生成次日权重；不使用当日收盘后的未来信息。",
    }


def build_analytics(inputs: dict[str, Any]) -> dict[str, Any]:
    if inputs.get("schemaVersion") != "research-inputs/v1":
        raise ValueError("unsupported research input schema")
    market = inputs["market"]
    periods = inputs["periods"]
    industries = inputs.get("industries", [])
    financials = inputs.get("financials", [])
    valuation = inputs.get("valuation", {})
    industry_advance_rate = (
        sum(1 for item in industries if number(item.get("pctChange")) > 0) / len(industries) * 100
        if industries else 0.0
    )
    average_roe = statistics.fmean(number(item.get("roe")) for item in financials) if financials else 0.0
    momentum = number(periods["20日"].get("averageReturnPct"))
    median_pe = valuation.get("medianPeTtm")
    factor_inputs = [
        ("动量", clamp(50 + momentum * 5), f"核心指数20日均值 {momentum:.2f}%"),
        ("价值", clamp(100 - number(median_pe if median_pe is not None else 50) * 1.5), f"PE(TTM)中位数 {number(median_pe):.2f}" if median_pe is not None else "PE(TTM)中位数 暂无"),
        ("质量", clamp(45 + average_roe * 2), f"代表公司ROE均值 {average_roe:.2f}%"),
        ("广度", clamp(industry_advance_rate), f"申万一级上涨占比 {industry_advance_rate:.1f}%"),
        ("流动性", clamp(35 + math.log10(max(1, number(market.get("amountYi")))) * 12), f"全A成交额 {number(market.get('amountYi')):.0f}亿元"),
    ]
    factors = [
        {
            "name": name,
            "score": round(score),
            "signal": "偏强" if score >= 65 else "偏弱" if score <= 35 else "中性",
            "evidence": evidence,
        }
        for name, score, evidence in factor_inputs
    ]
    ranked_indexes = sorted(periods["20日"].get("indexes", []), key=lambda item: number(item.get("returnPct")), reverse=True)
    rank_weights = [30, 25, 20, 15, 10]
    portfolio = [
        {
            "code": item["code"],
            "name": item["name"],
            "weight": rank_weights[rank],
            "reason": f"20日收益排名第 {rank + 1}（{number(item.get('returnPct')):.2f}%）",
        }
        for rank, item in enumerate(ranked_indexes[:5])
    ]
    best_industry = next((item for item in industries if item.get("return20d") is not None), None)
    positive_industries = sum(1 for item in industries if number(item.get("pctChange")) > 0)
    net_flow = market.get("netMoneyflowYi")
    observations = [
        {
            "title": "市场广度",
            "direction": "positive" if industry_advance_rate >= 55 else "negative" if industry_advance_rate < 40 else "neutral",
            "summary": f"{positive_industries}/{len(industries)} 个申万一级行业上涨，广度为 {industry_advance_rate:.1f}%。",
            "evidence": ["sw_daily", f"trade_date={periods['今日']['endDate']}"],
        },
        {
            "title": "中期主线",
            "direction": "positive" if best_industry and number(best_industry.get("return20d")) > 0 else "neutral",
            "summary": f"{best_industry['name']} 20日收益 {number(best_industry['return20d']):.2f}%，位居一级行业首位。" if best_industry else "行业历史窗口暂不可用。",
            "evidence": ["index_classify", "sw_daily"],
        },
        {
            "title": "资金与风险",
            "direction": "positive" if number(net_flow) >= 0 else "negative",
            "summary": f"全A资金流估算 {number(net_flow):.1f} 亿元；该口径为成交拆单模型，不代表账户真实迁移。" if net_flow is not None else "全A资金流暂不可用。",
            "evidence": ["moneyflow", "算法估算口径"],
        },
    ]
    return {
        "engine": "python",
        "schemaVersion": "research-analytics/v1",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "observations": observations,
        "factors": factors,
        "portfolio": portfolio,
        "backtest": build_backtest(inputs.get("indexHistory", [])),
    }


def load_inputs(url: str | None, input_path: str | None) -> dict[str, Any]:
    if input_path:
        payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
    else:
        secret = os.environ.get("REFRESH_SECRET", "")
        if not url or not secret:
            raise RuntimeError("url and REFRESH_SECRET are required")
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {secret}"})
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.load(response)
    return payload.get("inputs", payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url")
    parser.add_argument("--input")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    inputs = load_inputs(args.url, args.input)
    result = {"tradeDate": inputs["tradeDate"], "analytics": build_analytics(inputs)}
    output = Path(args.output)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(output)


if __name__ == "__main__":
    main()
