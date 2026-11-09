// End-to-end smoke test for the built single-file app (dist/NetworkCanvas.html).
// Run `npm run build` first. Needs Playwright with Chromium: `npx playwright install chromium`.
import { chromium } from 'playwright';
import { existsSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const file = resolve('dist/NetworkCanvas.html');
if (!existsSync(file)) { console.error('dist/NetworkCanvas.html not found — run `npm run build` first'); process.exit(1); }
const url = 'file://' + file;
const tmp = mkdtempSync(join(tmpdir(), 'networkcanvas-e2e-'));

let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, colorScheme: 'dark', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());

await page.goto(url);
await page.waitForTimeout(1200);
check('sample diagram loads', (await page.$$('[data-id]')).length > 40);
check('theme follows prefers-color-scheme (dark)', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');

// linking two free ethernet ports
await page.keyboard.press('Control+0');
await page.keyboard.press('p');
await page.waitForTimeout(200);
const free = await page.$$eval('[data-port]', (els) => els.map((g) => {
  const c = g.querySelectorAll('circle')[1]; const b = c.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, used: c.getAttribute('fill') !== '#2b2b2b', stroke: c.getAttribute('stroke'), node: g.getAttribute('data-port').split('|')[0] };
}).filter((p) => !p.used && p.stroke === '#1a8fd8' && p.x > 280 && p.x < 1290 && p.y > 70 && p.y < 920));
const before = (await page.$$('[data-link-id]')).length;
const a = free[0];
const b = free.find((p) => p.node !== a.node && Math.hypot(p.x - a.x, p.y - a.y) > 200);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x + 20, b.y + 20, { steps: 6 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(200);
check('port-to-port link is created', (await page.$$('[data-link-id]')).length === before + 1);
await page.keyboard.press('Control+z');
check('undo removes the link', (await page.$$('[data-link-id]')).length === before);
await page.keyboard.press('p');

// icon style switch keeps links
await page.click('.right-panel .seg button:has-text("Detailed")');
await page.waitForTimeout(300);
check('switching to detailed icons keeps links', (await page.$$('[data-link-id]')).length === before);
await page.click('.right-panel .seg button:has-text("Isometric")');

// checks panel
check('checks panel renders', !!(await page.$('.check-counts')));

// find
await page.keyboard.press('Control+f'); await page.keyboard.type('rtEng'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
check('find selects a device', (await page.$eval('.right-panel .insp-title', (e) => e.textContent)) === 'rtEngineering');
await page.keyboard.press('Escape');

// exports
const dl = async (fn) => { const [d] = await Promise.all([page.waitForEvent('download'), fn()]); const p = join(tmp, d.suggestedFilename()); await d.saveAs(p); return { name: d.suggestedFilename(), size: statSync(p).size, path: p }; };
const svg = await dl(() => page.keyboard.press('Control+e').then(() => page.click('.export-format:has-text("SVG")')).then(() => page.click('.modal-foot .btn.primary')));
check('SVG export', svg.name.endsWith('.svg') && svg.size > 10000, `${svg.name} ${svg.size} B`);
const png = await dl(() => page.keyboard.press('Control+e').then(() => page.click('.export-format:has-text("PNG")')).then(() => page.click('.modal-foot .btn.primary')));
check('PNG export', png.name.endsWith('.png') && png.size > 50000, `${png.size} B`);
const html = await dl(() => page.keyboard.press('Control+e').then(() => page.click('.export-format:has-text("Interactive HTML")')).then(() => page.click('.modal-foot .btn.primary')));
check('interactive HTML export', html.name.endsWith('.html') && html.size > 500000, `${html.size} B`);
const csv = await dl(() => page.keyboard.press('Control+e').then(() => page.click('.export-format:has-text("Cable schedule")')).then(() => page.click('.modal-foot .btn.primary')));
check('cable schedule CSV', csv.name.endsWith('.csv') && csv.size > 500);

// viewer opens the exported html
const v = await ctx.newPage();
const verrors = [];
v.on('pageerror', (e) => verrors.push(e.message));
await v.goto('file://' + html.path); await v.waitForTimeout(1200);
check('viewer renders the embedded diagram', (await v.$$('[data-id]')).length > 40 && !!(await v.$('.editor-badge')));
check('viewer has no errors', verrors.length === 0, verrors.join(' | '));
await v.close();

// device editor: new device, draw, add port, save
await page.click('button:has-text("New device")'); await page.waitForTimeout(300);
await page.locator('.editor .right-panel .insp-section').nth(0).locator('input').nth(0).fill('E2E Device');
await page.keyboard.press('Enter');
await page.keyboard.press('b'); await page.mouse.move(600, 300); await page.mouse.down(); await page.mouse.move(800, 480, { steps: 4 }); await page.mouse.up();
await page.keyboard.press('n'); await page.mouse.click(700, 300);
await page.click('button:has-text("Save to library")'); await page.waitForTimeout(300);
check('custom device saved to library', await page.$$eval('.lib-item', (els) => els.some((e) => e.textContent.includes('E2E Device'))));

// persistence across reload
await page.fill('.doc-name input', 'E2E persisted'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
await page.reload(); await page.waitForTimeout(1200);
check('document and library persist after reload', (await page.inputValue('.doc-name input')) === 'E2E persisted' && (await page.$$eval('.lib-item', (els) => els.some((e) => e.textContent.includes('E2E Device')))));

// the page must survive a host that injects a script before the app (chat preview panes do this)
const injected = (await (await import('node:fs/promises')).readFile(file, 'utf8')).replace(/<head[^>]*>/, (m) => m + '<script>window.__x=1</script>');
const injPath = join(tmp, 'injected.html'); writeFileSync(injPath, injected);
const ip = await ctx.newPage(); const ierr = []; ip.on('pageerror', (e) => ierr.push(e.message));
await ip.goto('file://' + injPath); await ip.waitForTimeout(1000);
check('survives injected scripts', (await ip.$$('[data-id]')).length > 40 && ierr.length === 0, ierr.join(' | '));
await ip.close();

check('no console errors in the editor', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
