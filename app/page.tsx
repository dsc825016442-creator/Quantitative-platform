"use client";

import { useMemo, useState } from "react";

const nav = ["结论", "AI观察", "大类资产", "新闻", "指数×基差", "温度计", "登指数", "纯因子轮动", "大额方向", "判断标尺", "证据链"];
const industries = [
  { n: "银行", pct: 1.16, heat: 84, flow: 12.8, breadth: "23 / 42" },
  { n: "化学制药", pct: 0.54, heat: 71, flow: 8.4, breadth: "88 / 154" },
  { n: "通信设备", pct: 0.39, heat: 67, flow: 18.6, breadth: "61 / 118" },
  { n: "电网设备", pct: 0.22, heat: 63, flow: 7.7, breadth: "49 / 108" },
  { n: "工业金属", pct: -4.2, heat: 18, flow: -21.4, breadth: "9 / 74" },
];
const regimes = [
  { key: "老登", tone: "violet", move: -0.82, heat: 84.8, flow: -3.84, win: "2 / 5", best: "国有大型银行 +1.16%", worst: "房地产开发 -2.14%", desc: "低估值、高分红、重资产，对利率与政策预期最敏感", inflow: "农业银行 +8.1亿　贵州茅台 +7.4亿　中国银行 +3.7亿", outflow: "—" },
  { key: "中登", tone: "blue", move: -1.27, heat: 77.7, flow: -72.12, win: "1 / 6", best: "化学制药 +0.54%", worst: "工业金属 -4.20%", desc: "中游周期成长，对库存周期与产业政策高度敏感", inflow: "多氟多 +10.7亿　宁德时代 +6.7亿　舒泰神 +2.8亿", outflow: "新和成 -5.3亿　菲利华 -4.1亿　铜陵有色 -4.1亿" },
  { key: "小登", tone: "gold", move: -1.19, heat: 25.5, flow: -386.95, win: "1 / 6", best: "通信设备 +0.39%", worst: "游戏 -1.91%", desc: "主题弹性最大，对流动性与产业催化最敏感", inflow: "天孚通信 +18.6亿　景旺电子 +6.9亿　锐捷网络 +6.7亿", outflow: "长鑫科技 -23.4亿　中际旭创 -21.5亿　兆易创新 -18.4亿" },
];

function MiniLine() {
  return <svg viewBox="0 0 520 92" className="mini-line" aria-label="近20日市场热度趋势"><path d="M5 61 C38 57 60 25 94 33 S153 78 185 46 S243 19 277 34 S335 68 371 48 S433 73 474 43 S505 29 516 37"/><line x1="0" y1="70" x2="520" y2="70"/><circle cx="516" cy="37" r="4"/></svg>;
}

export default function Home() {
  const [active, setActive] = useState("结论");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => industries.filter(i => i.n.includes(query.trim())), [query]);
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>市场与组合研究</span><small>FOF INVESTMENT NOTEBOOK</small></div>
        <div className="side-rule" />
        <button className="side-active"><i/>市场驾驶舱</button>
        <button>FOF周报</button><button>资金方向</button><button>新闻梳理</button>
        <div className="side-section">OPERATIONS</div>
        <button>控制台</button><button>数据地图</button>
        <div className="data-state"><b><i/>数据报告已生成</b><span>AS OF · 2026年8月13日</span><span>L0 市场 · 日度</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <nav>{nav.map(item => <button key={item} className={active===item ? "active" : ""} onClick={()=>setActive(item)}>{item}</button>)}</nav>
          <div className="top-actions"><input aria-label="搜索行业" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索行业"/><button className="refresh" onClick={()=>setFresh(v=>!v)}>{fresh ? "已更新" : "刷新"}</button></div>
        </header>

        <div className="content">
          <section className="hero-grid">
            <div><p className="eyebrow">MARKET REGIME / TUSHARE</p><h1>今日是老钱在动，<br/>还是新钱在动？</h1><p className="lead">把风格、行业、资金与事件证据放在同一张研究桌上，先判断市场由谁驱动，再决定组合该向哪里倾斜。</p></div>
            <div className="signal-panel"><div className="signal-head"><span>市场热度轨迹</span><strong>偏防御</strong></div><MiniLine/><div className="signal-metrics"><span><b>84.8%</b>老登热度</span><span><b>-462.9亿</b>三组资金净额</span><span><b>31</b>申万一级行业</span></div></div>
          </section>

          <section className="block">
            <div className="block-head"><div><span className="section-index">01 / REGIME</span><h2>登指数 · 三个代际板块</h2></div><p>热度分位 = 近20日平均收益在过去3年同口径分布中的位置；资金方向仅表达成交方向，不代表真实资金迁移。</p></div>
            <div className="regime-grid">
              {regimes.map(r => <article className={`regime-card ${r.tone}`} key={r.key}>
                <div className="card-top"><span className="pill">{r.key}</span><strong>{r.move.toFixed(2)}%</strong></div><p>{r.desc}</p>
                <div className="meter-row"><span>模块热度分位</span><div className="meter"><i style={{width:`${r.heat}%`}}/></div><b>{r.heat}%</b></div>
                <dl><div><dt>同日资金方向净额</dt><dd>{r.flow} 亿</dd></div><div><dt>今日涨跌家数</dt><dd>{r.win}<small>（0平）</small></dd></div></dl>
                <div className="best-worst"><span>最强 <b>{r.best}</b></span><span>最弱 <b>{r.worst}</b></span></div>
                <div className="flow-line"><span>个股资金流入</span><b>{r.inflow}</b></div><div className="flow-line muted"><span>个股资金流出</span><b>{r.outflow}</b></div>
              </article>)}
            </div>
            <button className="disclosure" onClick={()=>setExpanded(expanded === "components" ? null : "components")}><span>{expanded === "components" ? "▾" : "▸"}</span> 21 只成分明细（点位、区间收益、距离、回撤）</button>
            {expanded === "components" && <div className="drawer"><span>农业银行</span><b>+1.12%</b><span>中国移动</span><b>+0.38%</b><span>宁德时代</span><b>-1.04%</b><span>中际旭创</span><b>-2.21%</b></div>}
          </section>

          <section className="block compact">
            <button className="section-toggle" onClick={()=>setExpanded(expanded === "rotation" ? null : "rotation")}><span>{expanded === "rotation" ? "▾" : "▸"}</span><b>行业轮动 · 纯因子口径 · 31行业 × 近20日</b><em>数据源：Tushare / SW2021</em></button>
            {expanded === "rotation" && <div className="rotation-table"><div className="tr th"><span>行业</span><span>涨跌</span><span>热度</span><span>资金方向</span><span>广度</span></div>{filtered.map(i=><div className="tr" key={i.n}><b>{i.n}</b><span className={i.pct>=0?"positive":"negative"}>{i.pct>0?"+":""}{i.pct}%</span><span>{i.heat}</span><span>{i.flow>0?"+":""}{i.flow}亿</span><span>{i.breadth}</span></div>)}</div>}
          </section>

          <section className="block compact"><button className="section-toggle" onClick={()=>setExpanded(expanded === "factor" ? null : "factor")}><span>{expanded === "factor" ? "▾" : "▸"}</span><b>风格与行业因子明细 · Barra CNE6 纯因子（查阅用）</b><em>部分因子需付费数据</em></button>{expanded === "factor" && <div className="factor-strip"><span>价值 <b>+0.71σ</b></span><span>规模 <b>-0.43σ</b></span><span>动量 <b>-0.28σ</b></span><span>波动 <b>+0.56σ</b></span><span>流动性 <b>-0.19σ</b></span></div>}</section>

          <section className="block data-map"><div className="block-head"><div><span className="section-index">02 / DATA MAP</span><h2>数据能力与缺口</h2></div><p>从“可展示”推进到“可复现、可审计、可商用”的最短补数路径。</p></div><div className="capability-grid"><div><span className="cap-tag ready">现有可做</span><h3>Tushare 主骨架</h3><p>日线、财务、指数与成员、行业映射、资金流、公告事件、研报盈利预测、期货与基金基础。</p></div><div><span className="cap-tag free">免费补充</span><h3>盘中与原文证据</h3><p>AKShare、交易所/巨潮公告、央行与统计局；补足实时行情、公告原文、宏观高频与交叉校验。</p></div><div><span className="cap-tag paid">建议付费</span><h3>一致预期与风险模型</h3><p>Wind / iFinD / Choice 等机构数据；补齐点时一致预期、Barra 风险暴露、基金持仓穿透与稳定商用授权。</p></div></div></section>
        </div>
      </section>
    </main>
  );
}
