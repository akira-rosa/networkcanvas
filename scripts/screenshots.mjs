// Renders the README screenshots from the built app into docs/screenshots/.
//   npm run build && npm run screenshots
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('dist/NetworkCanvas.html');
if (!existsSync(file)) { console.error('run `npm run build` first'); process.exit(1); }
mkdirSync('docs/screenshots', { recursive: true });
const url = 'file://' + file;
const browser = await chromium.launch();

async function shot(name, scheme, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(1200);
  if (name !== 'home') { await page.click('.start-example'); await page.waitForTimeout(800); }
  await fn(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
  await ctx.close();
  console.log('wrote docs/screenshots/' + name + '.png');
}

const zoomAt = async (page, x, y, steps) => { await page.mouse.move(x, y); for (let i = 0; i < steps; i++) { await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control'); await page.waitForTimeout(30); } };

await shot('home', 'dark', async (page) => {
  // two diagrams so the list has something to show
  await page.click('.start-example'); await page.waitForTimeout(600);
  await page.click('button[title="All diagrams"]'); await page.waitForTimeout(300);
  await page.keyboard.press('n'); await page.fill('#new-topo-name', 'Plant B — packaging line');
  await page.click('.style-choice:has-text("Detailed")'); await page.click('button:has-text("Create topology")'); await page.waitForTimeout(400);
  for (const n of ['Industrial Router', 'Switch', 'Firewall', 'Server']) { await page.click(`.lib-item:has-text("${n}") >> nth=0`); await page.waitForTimeout(600); }
  await page.click('button[title="All diagrams"]'); await page.waitForTimeout(900);
});
await shot('editor-dark', 'dark', async (page) => { await page.keyboard.press('Shift+Digit1'); });
await shot('editor-light', 'light', async (page) => {
  await page.click('.right-panel .seg button:has-text("Detailed")');
  await page.keyboard.press('Shift+Digit1');
});
await shot('detail-isometric', 'dark', async (page) => {
  await page.keyboard.press('Control+\\');
  await zoomAt(page, 720, 560, 6);
});
await shot('detail-detailed', 'dark', async (page) => {
  await page.click('.right-panel .seg button:has-text("Detailed")');
  await page.keyboard.press('Control+\\');
  await zoomAt(page, 720, 560, 6);
});
await shot('device-editor', 'dark', async (page) => {
  await page.click('.seg button:has-text("Detailed")');
  await page.click('.lib-item:has-text("PLC (modular)") .lib-more'); await page.click('.ctx-item:has-text("Edit in device editor")');
  await page.waitForTimeout(500);
});
await shot('checks-and-table', 'dark', async (page) => {
  await page.keyboard.press('Control+Shift+d');
  await page.waitForTimeout(400);
});
await shot('export-dialog', 'light', async (page) => {
  await page.keyboard.press('Control+e');
  await page.click('.export-format:has-text("Interactive HTML")');
});
await browser.close();
