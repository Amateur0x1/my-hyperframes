// step1/render.mjs
import puppeteer from "puppeteer";
import { mkdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const FPS = 30;

// 1. 拿到要渲染的 HTML 路径
const entry = process.argv[2];
if (!entry) {
  console.error("用法: node step1/render.mjs step0/index.html");
  process.exit(1);
}

// 2. 清空并重建输出目录
const outDir = path.resolve("step1/frames");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// 3. 起浏览器
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// 4. viewport 决定截图像素尺寸 —— 必须等于 #stage
await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });

try {
  // 5. 打开页面
  await page.goto(pathToFileURL(path.resolve(entry)).href, { waitUntil: "load" });

  // 6. 等页面举手："我能被 seek 了"
  try {
    await page.waitForFunction(
      () => window.__hf && typeof window.__hf.seek === "function" && window.__hf.duration > 0,
      { timeout: 10_000 },
    );
  } catch {
    throw new Error(
      "等不到 window.__hf（duration > 0）。\n" +
        "检查页面是否定义了：window.__hf = { duration, seek }",
    );
  }

  // 7. 算总帧数
  const duration = await page.evaluate(() => window.__hf.duration);
  const total = Math.round(duration * FPS);
  console.log(`duration=${duration}s  fps=${FPS}  frames=${total}`);

  // 8. 逐帧 seek + 截图
  for (let i = 0; i < total; i++) {
    const t = i / FPS;

    await page.evaluate((time) => window.__hf.seek(time), t);

    const name = String(i).padStart(5, "0");
    await page.screenshot({ path: path.join(outDir, `frame_${name}.png`) });

    if (i % 10 === 0) console.log(`  ${i}/${total}  t=${t.toFixed(3)}s`);
  }

  console.log(`done → ${outDir}`);
} finally {
  await browser.close();
}