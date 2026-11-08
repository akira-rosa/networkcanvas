import type { DeviceDef } from '../model/types';
import { DETAILED_IT_DEFS } from './detailed-it';
import { DETAILED_OT_DEFS } from './detailed-ot';

// Detailed (front-view illustration) generic devices.
export const DETAILED_DEFS: DeviceDef[] = [...DETAILED_IT_DEFS, ...DETAILED_OT_DEFS];
