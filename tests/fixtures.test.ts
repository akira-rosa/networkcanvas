import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCell, createPlant, countDevices } from './fixtures/reference';
import { runChecks } from '../src/model/checks';
import { buildDefMap, styledDefMap } from '../src/store/store';
import { stableStringify } from '../src/model/util';

const defs = styledDefMap(buildDefMap([]), 'iso');

describe('reference projects', () => {
  for (const [name, make, min] of [['cell', createCell, 40], ['plant', createPlant, 400]] as const) {
    it(`${name}: committed file matches the generator`, () => {
      expect(readFileSync(`tests/fixtures/${name}.networkcanvas.json`, 'utf8')).toBe(stableStringify(make()));
    });
    it(`${name}: is a clean drawing (no errors or warnings) of the intended size`, () => {
      const doc = make();
      expect(countDevices(doc)).toBeGreaterThanOrEqual(min);
      expect(runChecks(doc, defs).filter((i) => i.severity !== 'info').map((i) => i.message)).toEqual([]);
    });
  }
});
