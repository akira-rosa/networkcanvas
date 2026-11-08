// Renders a contact sheet of built-in icons to a PNG for visual review.
//   node scripts/sheet.mjs <iso|detailed|all|id1,id2> <out.png> [width]
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const [filter = 'all', out = 'sheet.png', width = '1300', dpr = '1'] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'nc-sheet-'));
execSync(`npx vite build --outDir ${dir} --emptyOutDir --logLevel error`, { stdio: 'inherit' });
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: 800 }, deviceScaleFactor: +dpr });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + join(dir, 'index.html') + '?sheet=' + encodeURIComponent(filter));
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(out), fullPage: true });
await browser.close();
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'sheet written: ' + resolve(out));
