import { outages } from '../collectors/network/ioda.js';
export const EASA = "https://www.easa.europa.eu/en/taxonomy/term/2518/all/feed.xml";
export const MSCIO = "https://mscio.eu/folder/documents/UKMTO%20Advisories/";
export const IODA = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events";
export const AIS = "wss://stream.aisstream.io/v0/stream";
export const HOUR = 3_600_000;
export const MINUTE = 60_000;
export const DEFAULT_REGION = {
  air_focus: ["tehran", 35.7, 51.4, 100],
  air: [
    ["northern_iran", 35.7, 51.4, 220],
    ["western_iran", 33.1, 48.4, 190],
    ["eastern_iran", 33.6, 58.4, 260],
    ["persian_gulf", 26.6, 51.8, 195],
    ["hormuz", 26.5, 56.4, 85],
    ["gulf_of_oman", 24.5, 59.0, 150],
  ],
  marine: [55.4, 25.4, 58.1, 27.5],
  country: "IR",
  firms: [44, 24, 64, 40],
};

// D1 coordinates both collectors and overlapping scheduled/manual invocations.
// A lease prevents concurrent requests; cooldown survives isolate restarts.
