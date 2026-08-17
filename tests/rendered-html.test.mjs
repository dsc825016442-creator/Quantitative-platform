import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the quantitative research dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>市场与组合研究 · Tushare 数据驾驶舱<\/title>/);
  assert.match(html, /Tushare 数据工作台/);
  assert.match(html, /今日是老钱在动/);
  assert.match(html, /AI观察/);
  assert.match(html, /大类资产/);
  assert.match(html, /证据链/);
  assert.match(html, /role="tablist" aria-label="Tushare 数据模块"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /行情/);
  assert.match(html, /财务/);
  assert.match(html, /期货基金/);
});

test("keeps tabs, periods, filters and disclosures interactive", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /\[active, setActive\].*useState.*\("结论"\)/);
  assert.match(page, /\[period, setPeriod\].*useState\("20日"\)/);
  assert.match(page, /\["今日","20日","60日"\]/);
  assert.match(page, /onClick=\{\(\)=>setPeriod\(item\)\}/);
  assert.match(page, /onClick=\{\(\)=>setActive\(item\)\}/);
  assert.match(page, /onChange=\{e=>setQuery\(e\.target\.value\)\}/);
  assert.match(page, /onClick=\{\(\)=>setCapability\(item\)\}/);
  assert.match(page, /expanded === "components"/);
  assert.match(page, /expanded === "rotation"/);
  assert.match(page, /expanded === "factor"/);
  assert.match(page, /核心指数已按真实交易日重算/);
  assert.match(page, /snapshot\?\.periods/);
  assert.match(page, /snapshot\?\.quality/);
  assert.match(page, /snapshot\.domains\?\.industries/);
  assert.match(page, /snapshot\.domains\?\.flows/);
  assert.match(page, /snapshot\.domains\?\.events/);
  assert.match(page, /snapshot\.domains\.futures/);
  assert.match(page, /snapshot\?\.analytics/);
  assert.match(page, /copySummary/);
  assert.match(page, /downloadAnalytics/);
  assert.match(page, /snapshot\?\.domains\?\.components/);
  assert.match(page, /filteredIndustries\.map/);
  assert.match(page, /后续投资方向/);
  assert.doesNotMatch(page, /const industries = \[/);
});

test("protects and schedules the production market refresh", async () => {
  const [route, researchRoute, publicRoute, workflow, pythonEngine] = await Promise.all([
    readFile(new URL("../app/api/refresh-market/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research-analytics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market-snapshot/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/daily-market-refresh.yml", import.meta.url), "utf8"),
    readFile(new URL("../python/research_engine.py", import.meta.url), "utf8"),
  ]);

  assert.match(route, /REFRESH_SECRET/);
  assert.match(route, /authorization/);
  assert.match(route, /secretsEqual/);
  assert.match(route, /status: 401/);
  assert.match(workflow, /timezone: "Asia\/Shanghai"/);
  assert.match(workflow, /cron: "30 18 \* \* \*"/);
  assert.match(workflow, /secrets\.REFRESH_SECRET/);
  assert.match(workflow, /for attempt in 1 2 3/);
  assert.match(workflow, /x-refresh-force/);
  assert.match(workflow, /setup-python@v5/);
  assert.match(workflow, /python3 python\/research_engine\.py/);
  assert.match(workflow, /api\/research-analytics/);
  assert.doesNotMatch(workflow, /TUSHARE_TOKEN/);
  assert.match(researchRoute, /REFRESH_SECRET/);
  assert.match(researchRoute, /stale analytics trade date/);
  assert.match(publicRoute, /delete publicSnapshot\.researchInputs/);
  assert.match(pythonEngine, /"engine": "python"/);
  assert.match(pythonEngine, /def build_backtest/);
});
