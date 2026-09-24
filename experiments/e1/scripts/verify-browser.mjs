// Supplementary browser checks; these do NOT establish OS pass-through.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.E1_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href : "playwright");
if (!process.argv[2]) throw new Error("Supply a fresh evidence output directory.");
const out = resolve(process.argv[2]);
await mkdir(out); // A fresh path preserves earlier reviewable runs.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
const page = await context.newPage();
const result = { kind: "browser-only", startedAt: new Date().toISOString(), checks: [], pageErrors: [] };
page.on("pageerror", (error) => result.pageErrors.push(error.message));
const check = (name, condition) => { assert.ok(condition, name); result.checks.push(name); };
const state = () => page.evaluate(() => window.__E1_TEST__.getSnapshot());
const stats = () => page.evaluate(() => window.__E1_TEST__.getStats());
const settle = () => page.waitForFunction(() => window.__E1_TEST__.getSnapshot().transition.status !== "active");
const capture = (name) => page.screenshot({ path: resolve(out, `${name}.png`), omitBackground: true });
const anchor = (time) => page.locator(`.e1-anchor[data-time="${time}"]`);
const openControls = async () => {
  if (!(await page.locator(".e1-menu").getAttribute("open")) && !(await page.locator(".e1-menu").evaluate((e) => e.open))) {
    await page.getByLabel("EVA response controls", { exact: true }).click();
  }
};

try {
  await page.goto("http://127.0.0.1:1431/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("button[type=submit]").click();
  await settle();
  check("three independent fact anchors", await page.locator(".e1-anchor").count() === 3);
  check("controls collapse after request", !(await page.locator(".e1-menu").evaluate((e) => e.open)));
  check("no enclosing DOM background", await page.evaluate(() => [document.documentElement, document.body, document.querySelector(".e1-root")]
    .every((e) => getComputedStyle(e).backgroundColor === "rgba(0, 0, 0, 0)")));
  check("Canvas2D undrawn pixels have zero alpha", await page.evaluate(() => document.querySelector("canvas").getContext("2d").getImageData(0, 0, 1, 1).data[3] === 0));
  await capture("noon");
  let draws = (await stats()).drawCount;
  await page.waitForTimeout(150);
  check("settled renderer is idle", (await stats()).drawCount === draws);

  await anchor("15:00").locator(".e1-anchor__handle").click();
  await settle();
  check("pointer selection reaches afternoon", (await state()).selected === "15:00");
  const before = (await state()).anchors["15:00"];
  const handle = await anchor("15:00").locator(".e1-anchor__handle").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 90, handle.y + handle.height / 2 - 100, { steps: 12 });
  await page.mouse.up();
  const moved = (await state()).anchors["15:00"];
  check("drag applies local geometry", moved.x > before.x && moved.y < before.y && moved.userMoved);
  await anchor("15:00").locator(".e1-anchor__pin").click();
  const pinned = (await state()).anchors["15:00"];
  check("pin control updates host state", pinned.pinned);
  await openControls();
  await page.locator(".e1-controls__more > summary").click();
  await page.getByRole("button", { name: "Compare with noon", exact: true }).click();
  await settle();
  assert.deepEqual((await state()).anchors["15:00"], pinned);
  result.checks.push("comparison preserves the exact pin");
  await capture("part-and-relate");

  await anchor("15:00").locator(".e1-anchor__handle").focus();
  await page.keyboard.press("ArrowRight");
  check("keyboard manipulation and focus survive revision", await anchor("15:00").locator(".e1-anchor__handle").evaluate((e) => e === document.activeElement));
  await page.evaluate(() => window.__E1_TEST__.controller.setRecipe("withdraw-and-reanchor"));
  await settle();
  await capture("withdraw-and-reanchor");

  await page.evaluate(() => { window.__E1_TEST__.controller.setReducedMotion(false); window.__E1_TEST__.benchmark.start(5000); });
  await page.waitForFunction(() => window.__E1_TEST__.benchmark.isRunning());
  await page.keyboard.press("s");
  check("Stop cancels forced sampling and interrupts expression", await page.evaluate(() => !window.__E1_TEST__.benchmark.isRunning() && window.__E1_TEST__.getSnapshot().transition.status === "interrupted"));
  draws = (await stats()).drawCount;
  await page.waitForTimeout(150);
  check("Stop does not resume an old transition", (await stats()).drawCount === draws);
  await capture("interrupted");

  await page.keyboard.press("p");
  check("plain mode retains focus scope", (await state()).plain && (await state()).selected === "15:00");
  check("plain mode hides material and comparison link", !(await page.locator(".e1-field-canvas").isVisible()) && await page.locator(".e1-link").count() === 0);
  check("plain answer exposes exact values and context", (await page.locator(".e1-reading").innerText()).includes("18 °C") &&
    (await page.locator(".e1-reading").innerText()).includes("22 °C") && (await page.locator(".e1-reading").innerText()).includes("21 °C"));
  await capture("plain-answer");
  await page.evaluate(() => { window.__E1_TEST__.controller.setPlain(false); window.__E1_TEST__.controller.setReducedMotion(true); });
  await page.evaluate(() => window.__E1_TEST__.benchmark.start(1000));
  check("reduced motion refuses forced rendering", await page.evaluate(() => !window.__E1_TEST__.benchmark.isRunning()));

  await page.evaluate(() => window.__E1_TEST__.controller.request("NYC", "missing-cloud"));
  await anchor("15:00").locator(".e1-anchor__more > summary").click();
  check("missing cloud is explicitly readable", (await anchor("15:00").innerText()).includes("Not provided"));
  await capture("missing-cloud");
  await page.evaluate(() => window.__E1_TEST__.controller.request("Boston"));
  check("unavailable location never relabels NYC facts", (await state()).fixture.location.label === "New York City" &&
    (await page.locator(".e1-unavailable").innerText()).includes("Boston"));
  await capture("unavailable-location");

  await page.evaluate(() => { const h = window.__E1_TEST__; h.controller.request(); h.controller.setReducedMotion(false); h.setRenderer("webgl"); });
  await page.waitForFunction(() => window.__E1_TEST__.getStats().renderer === "webgl");
  await settle();
  check("WebGL retains alpha composition", await page.evaluate(() => document.querySelector("canvas").getContext("webgl").getContextAttributes().alpha));
  await capture("webgl-alpha");
  await page.evaluate(() => window.__E1_TEST__.simulateRendererFailure("webgl-unavailable"));
  await page.waitForFunction(() => window.__E1_TEST__.getStats().renderer === "canvas2d");
  check("real fallback backend is Canvas2D", (await stats()).renderer === "canvas2d");
  await capture("renderer-fallback");
  await page.evaluate(() => { const h = window.__E1_TEST__; h.setCount(NaN); h.setCount(Infinity); h.setCount(900000); });
  check("nonfinite and oversized point counts rejected", await page.evaluate(() => window.__E1_TEST__.getCount() <= 8000 && Number.isFinite(window.__E1_TEST__.getCount())));

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.evaluate(() => { const c = window.__E1_TEST__.controller; c.move("15:00", { x: 1, y: 1 }); });
  await settle();
  const edge = await anchor("15:00").boundingBox();
  check("edge anchor stays entirely reachable", edge.x >= 0 && edge.y >= 0 && edge.x + edge.width <= 2560 && edge.y + edge.height <= 1440);
  await capture("edge-2560x1440");
  await page.setViewportSize({ width: 420, height: 900 });
  check("narrow viewport does not scroll horizontally", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture("narrow-420");

  const late = await page.evaluate(() => {
    const h = window.__E1_TEST__, patch = h.controller.createDelayedPatch();
    h.controller.dismiss();
    return { accepted: h.controller.deliverDelayedPatch(patch).accepted, status: h.getSnapshot().status };
  });
  check("dismiss rejects late output", !late.accepted && late.status === "dismissed");
  check("dismiss removes interactive surfaces", await page.locator(".e1-anchor,.e1-shell").count() === 0);
  check("no uncaught page errors", result.pageErrors.length === 0);
  result.completed = true;
} catch (error) {
  result.failure = String(error);
  await capture("failure");
  process.exitCode = 1;
} finally {
  await writeFile(resolve(out, "checks.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
