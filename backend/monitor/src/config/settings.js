import { DEFAULT_REGION } from './constants.js';
export function settings(env) {
  return env.REGION ? { ...DEFAULT_REGION, ...JSON.parse(env.REGION) } : DEFAULT_REGION;
}

