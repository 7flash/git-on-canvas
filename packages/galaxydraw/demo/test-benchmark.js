/**
 * Automated WebGL Benchmark Test
 * Uses Puppeteer to run benchmark and report FPS results
 */

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runBenchmark() {
  console.log("🚀 Starting WebGL Benchmark Test...\n");

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: ["--start-maximized"],
  });

  const page = await browser.newPage();

  // Capture console logs
  const logs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(text);
    console.log("  ", text);
  });

  // Load benchmark page
  const benchmarkPath = join(__dirname, "benchmark-auto.html");
  const fileUrl = `file://${benchmarkPath.replace(/\\/g, "/")}`;

  console.log(`📂 Opening: ${fileUrl}\n`);
  await page.goto(fileUrl, { waitUntil: "networkidle0" });

  // Wait for benchmark to complete (max 2 minutes)
  console.log("⏳ Running benchmark tests (this takes ~2 minutes)...\n");
  await page.waitForFunction(
    () => document.querySelector(".pass:last-child") !== null,
    { timeout: 120000 },
  );

  // Extract results from page
  const results = await page.evaluate(() => {
    const logDiv = document.getElementById("log");
    const lines = logDiv.innerText.split("\n");
    const results = [];

    // Parse summary table
    const summaryStart = lines.findIndex((l) => l.includes("SUMMARY"));
    if (summaryStart === -1) return null;

    for (let i = summaryStart + 5; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("|") && line.includes("FPS")) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 4) {
          const lines = parseInt(parts[0].replace(/,/g, ""));
          const pixiFPS = parseInt(parts[1]);
          const canvasFPS = parseInt(parts[2]);
          const improvement = parseInt(parts[3]);

          if (!isNaN(lines) && !isNaN(pixiFPS) && !isNaN(canvasFPS)) {
            results.push({ lines, pixiFPS, canvasFPS, improvement });
          }
        }
      }
    }

    return results;
  });

  await browser.close();

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 BENCHMARK RESULTS");
  console.log("=".repeat(60));

  if (!results || results.length === 0) {
    console.log("❌ No results extracted. Check browser console for errors.");
    return;
  }

  console.log("Lines      | Pixi.js | Canvas 2D | Improvement");
  console.log("-".repeat(50));

  results.forEach((r) => {
    const status =
      r.improvement > 50 ? "✅ WebGL Recommended" : "⚠️  Marginal gain";
    console.log(
      `${String(r.lines).padStart(9)} | ${String(r.pixiFPS).padStart(7)} | ${String(r.canvasFPS).padStart(9)} | ${String(r.improvement).padStart(11)}% ${status}`,
    );
  });

  const avgImprovement =
    results.reduce((s, r) => s + r.improvement, 0) / results.length;
  console.log("\n" + "=".repeat(60));
  console.log(`Average improvement: ${avgImprovement.toFixed(0)}%`);
  console.log("=".repeat(60));

  if (avgImprovement > 50) {
    console.log("\n✅ RECOMMENDATION: Migrate to Pixi.js (WebGL)");
    console.log("   Performance gain justifies integration effort\n");
    process.exit(0);
  } else {
    console.log("\n⚠️  RECOMMENDATION: Canvas 2D is sufficient for now");
    console.log("   WebGL migration can wait until larger scale needed\n");
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error("❌ Benchmark failed:", err.message);
  process.exit(1);
});
