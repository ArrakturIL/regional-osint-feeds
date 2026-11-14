import { json } from '../api/json.js';
export async function get(url, format) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new Error("upstream unavailable");
  }
  if (!response.ok) throw new Error("upstream HTTP " + response.status);
  return format === "json" ? response.json() : response.text();
}

