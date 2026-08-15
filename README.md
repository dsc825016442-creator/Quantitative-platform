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

## 本地开发

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。

## 服务器启动

服务器需要 Node.js `>=22.13.0`、npm 和 Git。首次部署执行：

```bash
git clone https://github.com/dsc825016442-creator/Quantitative-platform.git
cd Quantitative-platform
npm ci
npm test
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

服务启动后：

- 本机访问：`http://127.0.0.1:3000`
- 局域网或公网访问：`http://服务器IP:3000`
- 修改端口：将命令中的 `3000` 换成目标端口，或设置 `PORT` 环境变量

需要确保云服务器安全组或系统防火墙已放行对应端口。正式公网环境建议使用 Nginx / Caddy 反向代理到 `127.0.0.1:3000`，并配置 HTTPS，不建议长期直接暴露 Node.js 端口。

### 后台常驻（PM2）

```bash
npm install --global pm2
pm2 start "npm run start -- --hostname 127.0.0.1 --port 3000" --name quantitative-platform
pm2 save
pm2 startup
```

常用运维命令：

```bash
pm2 status
pm2 logs quantitative-platform
pm2 restart quantitative-platform
pm2 stop quantitative-platform
```

### 更新服务器版本

```bash
cd Quantitative-platform
git pull --ff-only
npm ci
npm test
npm run build
pm2 restart quantitative-platform
```

如果没有使用 PM2，最后一行改为重新执行 `npm run start -- --hostname 0.0.0.0 --port 3000`。

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

页面当前包含可运行的演示数据与完整交互骨架，尚未读取 Tushare Token。后续接入真实数据服务时，应通过服务器环境变量或密钥管理服务配置 Token，禁止写入源码、README 或提交到 GitHub。数据模块可按 `docs/data-source-plan.md` 逐项替换为定时同步后的真实数据。

## 分享与协作

- 只查看或下载：直接分享本仓库链接；公开仓库无需 GitHub 授权即可查看。
- 共同开发：在仓库 `Settings → Collaborators → Add people` 中邀请对方的 GitHub 账号。
- 分配具体任务：在仓库 `Issues → New issue` 新建任务，选择负责人后分享该 Issue 链接。
- 独立修改：对方可以 Fork 仓库，修改后通过 Pull Request 提交合并请求。

## 部署

项目基于 [vinext](https://github.com/cloudflare/vinext)，可部署到 Cloudflare Workers / OpenAI Sites。公开站点无需登录；如未来加入自选组合、用户偏好或写入功能，可再按页面启用可选身份验证。
