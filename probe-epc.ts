import type { Analysis } from './src/lib/types';
declare const a: Analysis;
export const b: Analysis = { ...a, mode: 'deterministic', warning: 'w' };
