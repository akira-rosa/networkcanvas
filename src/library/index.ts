import type { DeviceDef } from '../model/types';
import { ISO_DEFS } from './iso';
import { DETAILED_DEFS } from './detailed';
import { MODEL_DEFS } from './models';
import { solidify } from './draw';
import { ISO_MORE_IT_DEFS } from './iso-more-it';
import { ISO_MORE_OT_DEFS } from './iso-more-ot';
import { DETAILED_MORE_IT_DEFS } from './detailed-more-it';
import { DETAILED_MORE_OT_DEFS } from './detailed-more-ot';

export { DEFAULT_ACCENT } from './draw';

/** Every built-in device: the isometric set, the detailed set and vendor models. */
/** Detailed devices are normalised to solid blocks: square corners, no outlines, flat fills. */
export const ALL_BUILTIN: DeviceDef[] = [
  ...ISO_DEFS, ...ISO_MORE_IT_DEFS, ...ISO_MORE_OT_DEFS,
  ...[...DETAILED_DEFS, ...DETAILED_MORE_IT_DEFS, ...DETAILED_MORE_OT_DEFS, ...MODEL_DEFS].map(solidify),
];

export const CATEGORY_ORDER = ['Network', 'Security', 'Wireless', 'Compute', 'Endpoints', 'Power', 'Industrial', 'Machines', 'IoT', 'Basic'];
