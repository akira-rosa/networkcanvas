// Finishes the single-file build: writes dist/index.html and dist/NetworkCanvas.html.
// Hardens the single-file build so it survives hosts that inject scripts into
// the page (e.g. preview panes): the app script is moved to the end of <body>,
// and tag-like text inside it ("<head", "</script", ...) is escaped.
import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const file = 'dist/index.html';

// Third-party licence notices for everything bundled into the file (production dependencies,
// recursively; type-only packages are not shipped). Written next to the build and embedded in it.
function notices() {
  const seen = new Map();
  const visit = (name) => {
    if (seen.has(name) || name.startsWith('@types/') || name === 'csstype') return;
    const dir = join('node_modules', name);
    if (!existsSync(join(dir, 'package.json'))) return;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const lic = readdirSync(dir).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
    seen.set(name, { name, version: pkg.version, license: pkg.license ?? 'see text', url: pkg.homepage ?? (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url) ?? '', text: lic ? readFileSync(join(dir, lic), 'utf8').trim() : '' });
    for (const d of Object.keys(pkg.dependencies ?? {})) visit(d);
  };
  for (const d of Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {})) visit(d);
  const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return 'Network Canvas includes the following open-source components.\n\n' + list.map((p) =>
    `${'='.repeat(72)}\n${p.name} ${p.version} — ${p.license}\n${p.url}\n${'='.repeat(72)}\n\n${p.text || '(no licence file in the package; licence: ' + p.license + ')'}\n`).join('\n');
}
const noticeText = notices();
writeFileSync('dist/THIRD_PARTY_NOTICES.txt', noticeText);
let html = readFileSync(file, 'utf8');
const re = /<script type="module" crossorigin>([\s\S]*?)<\/script>/;
const m = html.match(re);
if (!m) throw new Error('inline module script not found');
const js = m[1].replace(/<(\/?)(script|head|body|html|!--)/gi, (_s, slash, tag) => `\\x3C${slash}${tag}`);
html = html.replace(m[0], '');
html = html.replace('</body>', () => `<script type="text/plain" id="third-party-notices">${noticeText.replace(/<\//g, '<\\/')}</script>\n<script type="module">${js}</script>\n</body>`);
// Content-Security-Policy: only this exact script may run, and nothing may be fetched from the network.
// (Inline styles stay allowed: React sets style attributes. Images, fonts and exports use data:/blob: URLs.)
const hash = createHash('sha256').update(js, 'utf8').digest('base64');
const csp = [
  "default-src 'none'", `script-src 'sha256-${hash}'`, "style-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:',
  'connect-src data: blob:', "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');
html = html.replace(/<head>/i, (h) => `${h}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
writeFileSync(file, html);
copyFileSync(file, 'dist/NetworkCanvas.html');
const left = html.slice(0, html.indexOf('<script type="module">'));
console.log('postbuild ok:', (html.length / 1024).toFixed(0) + ' KB', '| tag strings before script:', (left.match(/<(head|body|html)\b/g) || []).length, '| CSP script hash', hash.slice(0, 12) + '…');
