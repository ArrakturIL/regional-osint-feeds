import { json } from '../../api/json.js';
import { HOUR, IODA } from '../../config/constants.js';
import { settings } from '../../config/settings.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
export async function outages(env, slot) {
  const country = settings(env).country;
  const url = new URL(IODA);
  url.search = new URLSearchParams({
    entityType: "country", entityCode: country,
    from: String(Math.floor((slot - 24 * HOUR) / 1000)), until: String(Math.floor(slot / 1000)),
  });
  const data = await get(url, "json");
  if (data.error || !Array.isArray(data.data)) throw new Error("unexpected IODA response");
  return data.data.flatMap(event => {
    if (!Number.isFinite(event.start) || !event.datasource) return [];
    return [item(country + "/" + event.datasource + "/" + event.start, {
      url: "https://ioda.inetintel.cc.gatech.edu/country/" + country,
      area: country, signal: event.datasource, start: event.start,
      duration: event.duration ?? null, severity: event.severity ?? event.score ?? null,
    })];
  });
}

