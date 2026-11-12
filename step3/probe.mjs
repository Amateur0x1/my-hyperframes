// step3/probe.mjs —— 验证虚拟时钟：时间能不能被"直接赋值"
import puppeteer from "puppeteer";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

// 1. shim 读成字符串 —— 它要在【页面里】跑，不是在 Node 里跑
const shim = await readFile(path.resolve("step3/virtual-clock.js"), "utf8");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

try {
  // 2. 关键时机：任何页面脚本执行之前注入。
  //    晚一步，fixture 里的 t0 就会拿到真实时间，后面全错位。
  await page.evaluateOnNewDocument(shim);

  // 3. 打开 fixture
  await page.goto(pathToFileURL(path.resolve("step3/fixture.html")).href, {
    waitUntil: "load",
  });

  // 4. 一步到位：拨表 → 手动重绘 → 读屏幕上的字
  const seek = (ms) =>
    page.evaluate((t) => {
      window.__vc.seekToTime(t);
      window.__fixtureRender();                       // 不等 setInterval，立刻刷
      return document.getElementById("out").textContent;
    }, ms);

  // 5. 四次来回跳：0 → 1.5s → 2.5s → 回到 0
  const cases = [
    { ms: 0,    want: "0.000s | 1970-01-01T00:00:00.000Z" },
    { ms: 1500, want: "1.500s | 1970-01-01T00:00:01.500Z" },
    { ms: 2500, want: "2.500s | 1970-01-01T00:00:02.500Z" },
    { ms: 0,    want: "0.000s | 1970-01-01T00:00:00.000Z" },   // ← 回到过去
  ];

  console.log("— 时间跳转 —");
  let allOk = true;
  for (const c of cases) {
    const got = await seek(c.ms);
    const ok = got === c.want;
    if (!ok) allOk = false;
    console.log(`${ok ? "✅" : "❌"} seekToTime(${String(c.ms).padStart(4)}) → ${got}`);
    if (!ok) console.log(`                        期望 → ${c.want}`);
  }

  // 6. 假 Date 的自检：双面人 + 真内部槽 + 静态方法透传
  console.log("\n— shim 自检 —");
  const self = await page.evaluate(() => [
    ["typeof Date()", typeof Date()],
    ["typeof new Date()", typeof new Date()],
    ["new Date() instanceof Date", new Date() instanceof Date],
    ["new Date(1234).getTime()", new Date(1234).getTime()],
    ['Date.parse("2020-01-01T00:00:00Z")', Date.parse("2020-01-01T00:00:00Z")],
    ["Date.UTC(2020, 0, 1)", Date.UTC(2020, 0, 1)],
  ]);
  for (const [k, v] of self) console.log(`  ${k.padEnd(32)} → ${v}`);

  if (!allOk) process.exitCode = 1;
} finally {
  await browser.close();
}