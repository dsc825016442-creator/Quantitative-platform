# Quantitative Platform

面向 A 股市场与组合研究的中文量化研究平台。当前版本以 Tushare 为主数据骨架，覆盖市场结论、AI 观察、大类资产、新闻、指数与基差、温度计、登指数、纯因子轮动、大额方向、判断标尺和证据链等研究页面。

## 当前能力

- 日线行情、财务数据、指数及成分股、行业映射
- 个股与板块资金流、公告事件、研报盈利预测
- 期货与基金基础数据
- 老登 / 中登 / 小登三类风格指数与成分钻取
- 今日 / 20 日 / 60 日周期切换和对应指标联动
- 资金方向、行业轮动、市场温度、因子与证据链展示
- 响应式中文研究工作台，可匿名公开访问

数据接入规划、免费补充源和付费数据建议见 [`docs/data-source-plan.md`](docs/data-source-plan.md)。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。

## 验证与构建

```bash
npm test
npm run build
```

## 项目结构

- `app/`：页面、交互逻辑与样式
- `docs/`：数据源和产品能力规划
- `db/`：Cloudflare D1 / Drizzle 数据层
- `worker/`：部署运行入口
- `tests/`：渲染和关键交互验证
- `.openai/hosting.json`：站点部署配置

## 数据配置

生产环境中应通过服务端环境变量配置 Tushare Token，避免把密钥提交到仓库。页面当前包含可运行的演示数据与完整交互骨架，后续可按 `docs/data-source-plan.md` 将数据模块逐项替换为定时同步后的真实数据。

## 部署

项目基于 [vinext](https://github.com/cloudflare/vinext)，可部署到 Cloudflare Workers / OpenAI Sites。公开站点无需登录；如未来加入自选组合、用户偏好或写入功能，可再按页面启用可选身份验证。
