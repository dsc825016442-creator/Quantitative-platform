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

const capabilityOrder = ["行情", "财务", "指数行业", "资金", "事件预期", "期货基金"] as const;
type CapabilityKey = typeof capabilityOrder[number];
const capabilityData: Record<CapabilityKey, {
  kicker: string; title: string; description: string; status: string; tone: string;
  metrics: { label: string; value: string; note: string }[];
  endpoints: string[]; columns: string[]; rows: string[][]; note: string;
}> = {
  "行情": {
    kicker: "MARKET / DAILY", title: "日线行情与市场温度", description: "统一股票、指数、ETF 的收盘行情、复权、估值与交易状态，形成所有研究模块的价格底座。", status: "日频可生产", tone: "green",
    metrics: [{label:"覆盖证券",value:"5,400+",note:"沪深京 A 股"},{label:"更新频率",value:"T+0",note:"收盘后 15–17 时"},{label:"回看窗口",value:"全历史",note:"停牌日不生成行情"},{label:"质量规则",value:"8 项",note:"复权/停牌/涨跌停"}],
    endpoints:["daily","adj_factor","daily_basic","index_daily","fund_daily","trade_cal"], columns:["观察标的","收盘 / 点位","日涨跌","20日状态","数据口径"],
    rows:[["沪深300","4,081.26","-1.27%","弱于60日线","index_daily"],["中证红利","6,442.81","-0.82%","热度84.8%","index_daily"],["创业板指","2,918.74","-1.19%","波动抬升","index_daily"],["全A成交额","18,642亿","-6.4%","缩量","daily 汇总"]], note:"当前页面为研究快照；正式接入后显示真实交易日、更新时间和原始批次号。"
  },
  "财务": {
    kicker:"FUNDAMENTALS / PIT", title:"点时财务与质量因子", description:"按公告可见时间组织三张财务报表、业绩快报与预告，避免用修订后的财务数据回填历史判断。", status:"日频可生产", tone:"blue",
    metrics:[{label:"报表类型",value:"3+2",note:"三表/快报/预告"},{label:"时间口径",value:"PIT",note:"公告日可见"},{label:"核心因子",value:"24",note:"质量/成长/估值"},{label:"异常检查",value:"6 项",note:"单位/跳变/缺失"}],
    endpoints:["income","balancesheet","cashflow","fina_indicator","forecast","express"], columns:["指标","当前截面","环比变化","研究解释","来源"],
    rows:[["全A盈利上调广度","52.8%","+3.1pct","温和改善","forecast / express"],["ROE 中位数","7.6%","+0.2pct","质量稳定","fina_indicator"],["经营现金流覆盖","0.91x","-0.04x","需观察","cashflow"],["低估值分位","68.4%","+5.2pct","价值占优","daily_basic"]], note:"必须同时保存 end_date、ann_date、f_ann_date；任何指标都只在公告可见后的下一交易日进入信号。"
  },
  "指数行业": {
    kicker:"INDEX / SW2021", title:"指数、行业与时点成员", description:"用申万 2021 分类及成员进出日期重建历史行业归属，为轮动、广度与归因提供无幸存者偏差的截面。", status:"31 行业可生产", tone:"violet",
    metrics:[{label:"一级行业",value:"31",note:"申万 SW2021"},{label:"成员记录",value:"5,900+",note:"含进出日期"},{label:"轮动窗口",value:"20日",note:"可切换 5/60/120"},{label:"审计覆盖",value:"100%",note:"成分版本化"}],
    endpoints:["index_classify","index_member_all","index_weight","sw_daily","index_dailybasic"], columns:["申万一级","20日收益","热度分位","上涨广度","轮动判断"],
    rows:[["银行","+4.82%","84","23 / 42","防御主线"],["通信","+2.31%","67","61 / 118","主题扩散"],["医药生物","+1.08%","71","88 / 154","底部改善"],["有色金属","-6.74%","18","9 / 74","周期降温"]], note:"历史回测必须使用 in_date / out_date；当日行业归属和指数权重均保留独立版本。"
  },
  "资金": {
    kicker:"FLOW / BEHAVIOR", title:"成交方向与拥挤度", description:"将个股资金流、大宗交易、融资融券与龙虎榜组合成交易行为观察，不把供应商算法口径误称为真实资金迁移。", status:"盘后可研究", tone:"gold",
    metrics:[{label:"资金净额",value:"-462.9亿",note:"三篮子合计"},{label:"融资余额",value:"1.91万亿",note:"市场汇总"},{label:"异常成交",value:"42",note:"龙虎榜/大宗"},{label:"口径标签",value:"已标注",note:"算法估算"}],
    endpoints:["moneyflow","moneyflow_ths","margin","margin_detail","top_list","block_trade"], columns:["标的","净流入","大单占比","同步信号","风险提示"],
    rows:[["天孚通信","+18.6亿","12.4%","龙虎榜活跃","拥挤上升"],["农业银行","+8.1亿","6.8%","融资平稳","低波动"],["中际旭创","-21.5亿","-14.1%","高换手","分歧放大"],["长鑫科技","-23.4亿","-16.7%","大额卖出","事件核验"]], note:"资金流为成交拆单模型估算；页面、导出与 AI 结论中都必须保留供应商与算法口径说明。"
  },
  "事件预期": {
    kicker:"EVENT / EXPECTATION", title:"公告事件与盈利预期修正", description:"把业绩预告、快报、披露计划和卖方盈利预测放在同一时间轴，识别信息到达后的行业扩散。", status:"核心接口已实测", tone:"red",
    metrics:[{label:"研报样本",value:"741",note:"3日实测记录"},{label:"行业映射",value:"31",note:"时点化聚合"},{label:"信号延迟",value:"T+1",note:"禁止当日偷看"},{label:"预期窗口",value:"20/60/120",note:"交易日"}],
    endpoints:["report_rc","forecast","express","disclosure_date","anns_d","stk_surv"], columns:["事件 / 行业","方向","覆盖","信息日期","证据状态"],
    rows:[["电子 · 盈利预测","上调","36 家","2026-08-13","多券商一致"],["医药 · 业绩预告","改善","22 家","2026-08-13","公告可追溯"],["有色 · 盈利预测","下调","18 家","2026-08-12","扩散中"],["银行 · 中报披露","中性","14 家","2026-08-12","等待正文"]], note:"同券商、同股票、同预测期前后比较；先在股票内平均券商，再聚合到当时有效行业。"
  },
  "期货基金": {
    kicker:"MULTI-ASSET / FOF", title:"期货期限结构与基金基础", description:"用合约、结算价、持仓量和基金净值/份额构建大类资产状态、基差、ETF 申赎及 FOF 观察。", status:"日频可研究", tone:"cyan",
    metrics:[{label:"期货交易所",value:"5",note:"商品/金融期货"},{label:"曲线字段",value:"结算+OI",note:"近远月可构造"},{label:"基金基础",value:"全市场",note:"净值/份额/持仓"},{label:"利率代理",value:"SHIBOR",note:"中债曲线待授权"}],
    endpoints:["fut_basic","fut_daily","fut_mapping","fund_basic","fund_nav","fund_share"], columns:["资产","观察值","结构信号","流动性","研究用途"],
    rows:[["沪深300期指","贴水 0.42%","谨慎","高","指数×基差"],["豆粕期限结构","年化 +5.8%","Back","高","商品 Carry"],["黄金 ETF","份额 +1.7%","净申购","高","避险需求"],["红利 ETF","份额 +0.9%","净申购","中高","FOF 风格"]], note:"连续合约只用于研究展示；交易信号必须映射到当日真实可交易合约，并处理换月与交割窗口。"
  }
};

function MiniLine() {
  return <svg viewBox="0 0 520 92" className="mini-line" aria-label="近20日市场热度趋势"><path d="M5 61 C38 57 60 25 94 33 S153 78 185 46 S243 19 277 34 S335 68 371 48 S433 73 474 43 S505 29 516 37"/><line x1="0" y1="70" x2="520" y2="70"/><circle cx="516" cy="37" r="4"/></svg>;
}

export default function Home() {
  const [active, setActive] = useState("结论");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [query, setQuery] = useState("");
  const [capability, setCapability] = useState<CapabilityKey>("行情");
  const filtered = useMemo(() => industries.filter(i => i.n.includes(query.trim())), [query]);
  const cap = capabilityData[capability];
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

          <section className="data-console" id="tushare-console">
            <div className="console-title"><div><span className="section-index">TUSHARE CORE / 06 MODULES</span><h2>Tushare 数据工作台</h2><p>从接口覆盖走到研究结论：每个模块都带数据状态、关键指标、端点血缘和口径提醒。</p></div><div className="console-health"><i/><span>6 个模块</span><b>主骨架就绪</b><small>演示快照 · 待接服务端增量</small></div></div>
            <div className="cap-tabs" role="tablist" aria-label="Tushare 数据模块">{capabilityOrder.map(item=><button role="tab" aria-selected={capability===item} className={capability===item?"active":""} onClick={()=>setCapability(item)} key={item}><span>{String(capabilityOrder.indexOf(item)+1).padStart(2,"0")}</span>{item}</button>)}</div>
            <div className={`cap-panel ${cap.tone}`}>
              <div className="cap-intro"><div><span>{cap.kicker}</span><h3>{cap.title}</h3><p>{cap.description}</p></div><b>{cap.status}</b></div>
              <div className="cap-metrics">{cap.metrics.map(metric=><article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></article>)}</div>
              <div className="endpoint-line"><span>接口血缘</span>{cap.endpoints.map(endpoint=><code key={endpoint}>{endpoint}</code>)}</div>
              <div className="cap-table"><div className="cap-tr cap-th">{cap.columns.map(column=><span key={column}>{column}</span>)}</div>{cap.rows.map((row,index)=><div className="cap-tr" key={row[0]}>{row.map((cell,i)=><span key={`${index}-${i}`} className={i===0?"row-title":""}>{cell}</span>)}</div>)}</div>
              <div className="quality-note"><b>口径提醒</b><p>{cap.note}</p><button onClick={()=>setFresh(v=>!v)}>{fresh?"快照已标记":"标记待刷新"}</button></div>
            </div>
            <div className="pipeline"><span><i className="ok"/>原始层 <b>RAW</b></span><em>→</em><span><i className="ok"/>清洗层 <b>NORMALIZED</b></span><em>→</em><span><i className="ok"/>点时层 <b>PIT</b></span><em>→</em><span><i/>指标层 <b>FEATURES</b></span><em>→</em><span><i/>页面层 <b>SERVING</b></span></div>
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
