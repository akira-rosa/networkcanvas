// Writes the reference projects used by the review, the performance budgets and regression tests.
//   npm run fixtures            → tests/fixtures/{cell,plant}.networkcanvas.json (committed)
//   npm run fixtures -- site    → tests/fixtures/site.networkcanvas.json (2,000 devices; not committed)
import { writeFileSync } from 'node:fs';
import { createCell, createPlant, createSite, countDevices } from '../tests/fixtures/reference';
import { stableStringify } from '../src/model/util';

const want = process.argv.slice(2);
const all: Record<string, () => ReturnType<typeof createCell>> = { cell: createCell, plant: createPlant, site: () => createSite() };
for (const k of want.length ? want : ['cell', 'plant']) {
  const doc = all[k]();
  const path = `tests/fixtures/${k}.networkcanvas.json`;
  writeFileSync(path, stableStringify(doc));
  const links = doc.pages.reduce((s, p) => s + Object.keys(p.links).length, 0);
  console.log(`${path}: ${countDevices(doc)} devices, ${links} links, ${doc.pages.length} pages, ${doc.vlans.length} VLANs`);
}
