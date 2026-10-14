// axe-core WCAG 2.x A/AA sweep: 4 palettes × light/dark × /acordes, /glosario, /tablatura
// (24 combinations), counting color-contrast failures in each.
//
//   npm i --no-save playwright-core @axe-core/playwright
//   node scripts/axe-contraste.mjs [url]         (default: production)
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.argv[2] || "https://plainchord.vercel.app";
const PALETTES = ["azul", "salmon", "pink", "green"];
const PAGES = ["/acordes", "/glosario", "/tablatura"];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const rows = [];
for (const palette of PALETTES) for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([p, t]) => {
    localStorage.setItem("theme", t);
    if (p !== "azul") localStorage.setItem("palette", p); else localStorage.removeItem("palette");
    localStorage.setItem("progression", "G D Em C");
  }, [palette, theme]);
  for (const path of PAGES) {
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const applied = await page.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), p: document.documentElement.getAttribute("data-theme") }));
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const contrast = r.violations.find((v) => v.id === "color-contrast");
    const other = r.violations.filter((v) => v.id !== "color-contrast").map((v) => `${v.id}(${v.nodes.length})`);
    const review = r.incomplete.find((v) => v.id === "color-contrast");
    rows.push({ palette, theme, path, applied: `${applied.dark ? "dark" : "light"}/${applied.p || "azul"}`,
      contrastErrors: contrast ? contrast.nodes.length : 0, contrastToReview: review ? review.nodes.length : 0, otherViolations: other.join(" ") || "-",
      contrastDetail: contrast ? contrast.nodes.map((n) => `${n.target.join(" ")} :: ${n.any[0]?.message?.slice(0, 140)}`) : [] });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.table(rows.map(({ contrastDetail, ...r }) => r));
for (const r of rows) for (const d of r.contrastDetail) console.log(`${r.palette}/${r.theme} ${r.path}: ${d}`);
console.log("TOTAL contrast errors:", rows.reduce((s, r) => s + r.contrastErrors, 0));
