import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const output = resolve(process.argv[2]); await mkdir(output, { recursive: false });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage(); const checks = [];
try {
  await page.goto("http://127.0.0.1:1420"); await page.evaluate(() => document.fonts.ready);
  for (const [width,height] of [[1440,960],[960,760],[1960,530],[600,760],[400,640]]) {
    await page.setViewportSize({width,height}); await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: entry fits`);
    await page.screenshot({path:join(output,`entry-${width}x${height}.png`),fullPage:true});
    await page.getByText("Type",{exact:true}).click();
    await page.getByRole("textbox",{name:"Weather request"}).fill("Show me the weather");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: input fits`);
    await page.getByText("Type",{exact:true}).click();
    checks.push({width,height,entryAndInputOverflow:false});
  }
  await page.getByText("Type",{exact:true}).click(); await page.getByRole("button",{name:"Send",exact:true}).click();
  await page.getByTestId("weather-card").waitFor();
  await page.getByRole("button",{name:"Quiet mode"}).click();
  await page.waitForTimeout(200); const first = await page.locator("canvas").screenshot();
  await page.waitForTimeout(300); const second = await page.locator("canvas").screenshot();
  assert.ok(first.equals(second),"Quiet mode freezes the eye");
  checks.push("Typed request opens weather; quiet mode keeps identical canvas pixels");
  await writeFile(join(output,"results.json"),JSON.stringify({status:"passed",checks},null,2));
  console.log("Entry layouts, typed request and quiet mode passed.");
} finally { await browser.close(); }
