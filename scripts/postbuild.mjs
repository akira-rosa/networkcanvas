// Finishes the single-file build: writes dist/index.html and dist/NetworkCanvas.html.
// Hardens the single-file build so it survives hosts that inject scripts into
// the page (e.g. preview panes): the app script is moved to the end of <body>,
// and tag-like text inside it ("<head", "</script", ...) is escaped.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const file = 'dist/index.html';
let html = readFileSync(file, 'utf8');
const re = /<script type="module" crossorigin>([\s\S]*?)<\/script>/;
const m = html.match(re);
if (!m) throw new Error('inline module script not found');
const js = m[1].replace(/<(\/?)(script|head|body|html|!--)/gi, (_s, slash, tag) => `\\x3C${slash}${tag}`);
html = html.replace(m[0], '');
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
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
