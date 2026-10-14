// Runs the report's Tabla 29 test cases (CP-01..CP-12) against a PlainChord URL in headless Chrome.
// Audio inputs are synthetic: a 110 Hz oscillator stands in for the mic (CP-08) and the
// app's own ?demo strum panel feeds synthesized chords into the real detector (CP-09/10).
// CP-03 and CP-06 are unit tests (node --test lib/*.test.ts). CP-04 and CP-07 need a local
// .gp5: Guitar Pro files are git-ignored, so pass one with GP_FILE if the default isn't there.
//
//   npm i --no-save puppeteer-core
//   node scripts/casos-prueba.mjs [url]          (default: production)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const BASE = process.argv[2] || "https://plainchord.vercel.app";
const GP = process.env.GP_FILE || fileURLToPath(new URL("../public/GP5/Barrios Mangore, Augustin - Estudio De Concierto.gp5", import.meta.url));
const INVALID = path.join(os.tmpdir(), "invalido.gp5");
fs.writeFileSync(INVALID, "esto es texto plano, no un archivo Guitar Pro\n");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });
const out = [];
const log = (id, ok, detail) => { out.push({ id, ok, detail }); console.log(id, ok ? "PASA" : "FALLA", "-", detail); };
async function fresh(path, init) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  if (init) await page.evaluateOnNewDocument(init);
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  return { ctx, page, errors };
}
const typeProgression = async (page, text) => { await page.click("#progression"); await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); await page.type("#progression", text); await wait(2500); };
const counts = (page) => page.evaluate(() => ({
  diagrams: document.querySelectorAll('svg[role=img][aria-label^="Diagrama del acorde"]').length,
  badges: [...document.querySelectorAll("[role=img]")].filter((e) => /Fácil|Media|Difícil/.test(e.getAttribute("aria-label") || "")).length,
  notFound: (document.body.innerText.match(/no encontrado/g) || []).length,
}));

// CP-01 / CP-02
{ const { ctx, page } = await fresh("/acordes");
  await typeProgression(page, "G D Em C"); const a = await counts(page);
  log("CP-01", a.diagrams === 4 && a.badges === 3, `«G D Em C» → ${a.diagrams} diagramas, ${a.badges} etiquetas de dificultad`);
  await typeProgression(page, "G Xm C"); const b = await counts(page);
  log("CP-02", b.diagrams === 2 && b.notFound >= 1, `«G Xm C» → ${b.diagrams} diagramas (G y C) y ${b.notFound} aviso «no encontrado»`);
  await ctx.close(); }

// CP-04 / CP-05 (+ history count from IndexedDB)
const historyCount = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open("plainchord"); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains("tabHistory")) return res(0); const c = db.transaction("tabHistory").objectStore("tabHistory").count(); c.onsuccess = () => res(c.result); }; r.onerror = () => res(-1); }));
{ const { ctx, page } = await fresh("/tablatura");
  const input = await page.$('input[type=file]');
  await input.uploadFile(GP); await wait(4000);
  const txt = await page.evaluate(() => document.body.innerText);
  const hasTab = await page.$('[aria-label*="eproducir"]');
  const head = txt.split("\n").filter((l) => /Estudio|Barrios|BPM|afinaci|E A D G B E|Estándar/i.test(l)).slice(0, 4).join(" | ");
  log("CP-04", !!hasTab && /Estudio/i.test(txt), `.gp5 importado; encabezado: ${head}`);
  await ctx.close(); }
{ const { ctx, page } = await fresh("/tablatura");
  const before = await historyCount(page);
  await (await page.$('input[type=file]')).uploadFile(INVALID); await wait(2500);
  const txt2 = await page.evaluate(() => document.body.innerText);
  const after = await historyCount(page);
  const msg = /No se pudo leer este archivo/.test(txt2);
  log("CP-05", msg && after === before, `aviso «No se pudo leer este archivo…»: ${msg}; historial antes ${before}, después ${after}`);
  await ctx.close(); }

// CP-07: AudioContext blocked → cursor still advances on the silent clock
{ const { ctx, page } = await fresh("/tablatura", () => { window.AudioContext = function () { throw new Error("AudioContext bloqueado (prueba)"); }; window.webkitAudioContext = window.AudioContext; });
  await (await page.$('input[type=file]')).uploadFile(GP); await wait(4000);
  const snap = () => page.evaluate(() => [...document.querySelectorAll("[style]")].map((e) => e.getAttribute("style")).join("|"));
  const s0 = await snap();
  await page.click('[aria-label="Reproducir"]'); await wait(2500);
  const s1 = await snap(); await wait(1500); const s2 = await snap();
  log("CP-07", s1 !== s0 && s2 !== s1, `con AudioContext bloqueado, el cursor ${s2 !== s1 ? "sigue avanzando" : "no avanza"} (temporizador silencioso)`);
  await ctx.close(); }

// CP-08: tuner with a synthetic 110 Hz input (the open A string, A2)
{ const { ctx, page } = await fresh("/acordes", () => {
    navigator.mediaDevices.getUserMedia = async () => { const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value = 110; const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; };
  });
  await page.click('[aria-label="Abrir menú de navegación"]'); await wait(400);
  await page.evaluate(() => [...document.querySelectorAll("button,a")].find((b) => b.textContent.trim() === "Afinador")?.click()); await wait(600);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Activar micrófono"))?.click()); await wait(3000);
  const m = await page.evaluate(() => { const e = document.querySelector("[role=meter]"); return { v: e?.getAttribute("aria-valuenow"), t: e?.getAttribute("aria-valuetext"), vis: document.querySelector("dialog[open]")?.innerText.replace(/\s+/g, " ").slice(0, 160) }; });
  log("CP-08", /A2/.test(m.t || "") && Math.abs(+m.v) <= 5 && /Afinado/.test(m.vis || ""), `entrada 110 Hz (cuerda La, A2) → «${m.t}», desviación ${m.v} cents; pantalla: ${m.vis}`);
  await ctx.close(); }

// CP-09 / CP-10: ?demo panel strums synthesized chords into the real detector
{ const { ctx, page } = await fresh("/acordes?demo");
  await typeProgression(page, "C G Am F");
  const now = () => page.evaluate(() => document.querySelector("p.sr-only[aria-live=polite]")?.textContent || "");
  const strum = (name) => page.evaluate((n) => [...document.querySelectorAll("div.fixed button")].find((b) => b.textContent.trim() === n)?.click(), name);
  await strum("G"); await wait(400);   // first strum also starts play-along (target C)
  await wait(2200);
  const afterWrong = await now();
  log("CP-10", /Ahora: C/.test(afterWrong), `esperado C, se rasgueó G → sigue en «${afterWrong}» (no avanza)`);
  await wait(1200);
  const t0 = Date.now(); await strum("C");
  let t = -1; for (let i = 0; i < 40; i++) { if (/Ahora: G/.test(await now())) { t = Date.now() - t0; break; } await wait(50); }
  log("CP-09", t > 0 && t <= 1000, `esperado C, se rasgueó C → avanza a G en ${t} ms`);
  await ctx.close(); }

// CP-11: microphone permission denied
{ const { ctx, page, errors } = await fresh("/acordes", () => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denegado (prueba)", "NotAllowedError"));
  });
  await typeProgression(page, "G D Em C");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Tocar")?.click()); await wait(1500);
  const txt = await page.evaluate(() => document.body.innerText);
  const msg = /No se pudo acceder al micrófono/.test(txt);
  log("CP-11", msg && errors.length === 0, `mensaje de permisos: ${msg}; errores en consola: ${errors.length}${errors.length ? " — " + errors[0] : ""}`);
  await ctx.close(); }

// CP-12: dark mode + salmon palette survive a reload
{ const { ctx, page } = await fresh("/acordes", () => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("theme", "light"); localStorage.removeItem("palette"); sessionStorage.setItem("seeded", "1"); } });
  await page.click('[aria-label="Cambiar tema claro/oscuro"]'); await wait(300);
  await page.click('[aria-label="Cambiar paleta de color"]'); await wait(300);
  await page.click('[aria-label="Paleta salmón"]'); await wait(300);
  await page.reload({ waitUntil: "networkidle0" });
  const st = await page.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), p: document.documentElement.getAttribute("data-theme") }));
  log("CP-12", st.dark && st.p === "salmon", `tras recargar: modo ${st.dark ? "oscuro" : "claro"}, paleta ${st.p}`);
  await ctx.close(); }

await browser.close();
console.log(`\n${out.filter((o) => o.ok).length}/${out.length} casos cumplen (${BASE}, ${new Date().toLocaleString("es-CL")})`);
