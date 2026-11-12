// step4/render.mjs —— 端到端：HTML → 逐帧 PNG
import puppeteer from "puppeteer";
import { mkdir, rm, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const FPS = 30;

const entry = process.argv[2] ?? "step4/animation.html";

// ① 复用 step3 的虚拟时钟
const shim = await readFile(path.resolve("step3/virtual-clock.js"), "utf8");

const outDir = path.resolve("step4/frames");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });

try {
  await page.evaluateOnNewDocument(shim);

  // 对照实验：NO_RAF=1 时，用逃生通道把 rAF 换回原生
  if (process.env.NO_RAF === "1") {
    await page.evaluateOnNewDocument(`
      window.requestAnimationFrame = window.__vc.realRaf;
      window.cancelAnimationFrame = window.__vc.realCancelRaf;
    `);
  }

  // ② 打开页面（shim 已经在最前面跑过了）
  await page.goto(pathToFileURL(path.resolve(entry)).href, { waitUntil: "load" });

  await page.waitForFunction(
    () => window.__hf && typeof window.__hf.seek === "function" && window.__hf.duration > 0,
    { timeout: 10_000 },
  );

  const duration = await page.evaluate(() => window.__hf.duration);
  const total = Math.round(duration * FPS);
  console.log(`duration=${duration}s  fps=${FPS}  frames=${total}`);

  for (let i = 0; i < total; i++) {
    const t = i / FPS;

    await page.evaluate((time) => window.__hf.seek(time), t);

    const name = String(i).padStart(5, "0");
    await page.screenshot({ path: path.join(outDir, `frame_${name}.png`) });

    if (i % 15 === 0) console.log(`  ${i}/${total}  t=${t.toFixed(3)}s`);
  }

  console.log(`done → ${outDir}`);
} finally {
  await browser.close();
}