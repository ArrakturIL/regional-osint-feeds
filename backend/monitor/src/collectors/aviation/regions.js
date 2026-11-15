import { settings } from '../../config/settings.js';
export function airSamplingRegions(env) {
  const config = settings(env);
  const focus = config.air_focus, regions = config.air;
  if (!Array.isArray(focus) || focus.length !== 4 || typeof focus[0] !== "string"
    || ![focus[1],focus[2],focus[3]].every(Number.isFinite)
    || Math.abs(focus[1]) > 90 || Math.abs(focus[2]) > 180 || focus[3] <= 0
    || !Array.isArray(regions) || !regions.length || regions.length > 6) {
    throw new Error("invalid aviation focus or context regions");
  }
  const others = regions.filter(r => Array.isArray(r)
    && (Math.abs(r[1] - focus[1]) > 0.25 || Math.abs(r[2] - focus[2]) > 0.25));
  return { focus, context: others.length ? others : regions };
}

