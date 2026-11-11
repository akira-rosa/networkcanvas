// Shared helpers for Playwright scripts (e2e, review, performance).
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const APP = resolve('dist/NetworkCanvas.html');
export const appUrl = () => {
  if (!existsSync(APP)) throw new Error('dist/NetworkCanvas.html not found — run `npm run build` first');
  return 'file://' + APP;
};

/** A browser page on the start screen. `errors` collects page errors and console errors. */
export async function openApp({ width = 1600, height = 950, colorScheme = 'dark', browser } = {}) {
  const b = browser ?? (await chromium.launch());
  const ctx = await b.newContext({ viewport: { width, height }, colorScheme, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(appUrl());
  await page.waitForSelector('.home');
  return { browser: b, ctx, page, errors };
}

/** Open a .networkcanvas.json from disk through the normal Open file flow (download fallback, no FS Access API). */
export async function openFixture(page, path) {
  await page.evaluate(() => { delete window.showOpenFilePicker; });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+o')]);
  await fc.setFiles(resolve(path));
  await page.waitForSelector('.canvas-area');
  await page.waitForTimeout(300);
}

/** Go to a page of the open diagram by its name in the Pages panel. */
export async function gotoPage(page, name) {
  await page.click(`.page-row:has-text("${name}")`).catch(() => page.click(`text=${name}`));
  await page.waitForTimeout(200);
}

/** Median frame time (ms) while panning with the wheel for `frames` steps. */
export async function panFrameTime(page, frames = 60) {
  const box = await (await page.$('.canvas-area')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return page.evaluate(async (n) => {
    const svg = document.querySelector('.canvas-area svg');
    const times = [];
    let last = performance.now();
    for (let i = 0; i < n; i++) {
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 20 < 10 ? 30 : -30, deltaX: 10, bubbles: true, cancelable: true }));
      await new Promise((r) => requestAnimationFrame(() => r()));
      const t = performance.now(); times.push(t - last); last = t;
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }, frames);
}
