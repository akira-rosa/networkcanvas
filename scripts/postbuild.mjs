// Finishes the single-file build: writes dist/index.html and dist/NetCanvas.html.
// Hardens the single-file build so it survives hosts that inject scripts into
// the page (e.g. preview panes): the app script is moved to the end of <body>,
// and tag-like text inside it ("<head", "</script", ...) is escaped.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const file = 'dist/index.html';
let html = readFileSync(file, 'utf8');
const re = /<script type="module" crossorigin>([\s\S]*?)<\/script>/;
const m = html.match(re);
if (!m) throw new Error('inline module script not found');
const js = m[1].replace(/<(\/?)(script|head|body|html|!--)/gi, (_s, slash, tag) => `\\x3C${slash}${tag}`);
html = html.replace(m[0], '');
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
writeFileSync(file, html);
copyFileSync(file, 'dist/NetCanvas.html');
const left = html.slice(0, html.indexOf('<script type="module">'));
console.log('postbuild ok:', (html.length / 1024).toFixed(0) + ' KB', '| tag strings before script:', (left.match(/<(head|body|html)\b/g) || []).length);
