import { aviation } from '../collectors/aviation/adsb.js';
import { airbridgeContext } from '../collectors/aviation/airbridge.js';
import { aviationAlternative } from '../collectors/aviation/alternatives.js';
import { militaryWithFallback } from '../collectors/aviation/military.js';
import { vessels } from '../collectors/maritime/ais.js';
import { gfwSarBaseline } from '../collectors/maritime/gfw-baseline.js';
import { gfwAuth, gfwSar } from '../collectors/maritime/gfw.js';
import { maradAdvisories } from '../collectors/maritime/marad.js';
import { seaBulletins } from '../collectors/maritime/mscio.js';
import { polymarketSnapshots } from '../collectors/markets/polymarket.js';
import { gdeltContext } from '../collectors/media/gdelt.js';
import { outages } from '../collectors/network/ioda.js';
import { centcomDvids } from '../collectors/official/centcom-dvids.js';
import { centcomRss } from '../collectors/official/centcom-rss.js';
import { dodOfficialRss } from '../collectors/official/dod.js';
import { airBulletins } from '../collectors/official/easa.js';
import { fcdoAdvice } from '../collectors/official/fcdo.js';
import { idfReleases } from '../collectors/official/idf.js';
import { stateTravelAdvisories } from '../collectors/official/state.js';
import { aerialArchive, sentinelCatalog } from '../collectors/satellite/catalog.js';
import { copernicusAnalysis } from '../collectors/satellite/copernicus.js';
import { hotspots } from '../collectors/satellite/firms.js';
import { satelliteContext } from '../collectors/satellite/github.js';
import { unosatAnalysis } from '../collectors/satellite/unosat.js';
export const sources = [
  {name:"gfw_sar_baseline",every:1440,secret:"GFW_API_TOKEN",read:gfwSarBaseline},
  {name:"unosat_analysis",every:720,read:unosatAnalysis},
  {name:"copernicus_ems",every:360,read:copernicusAnalysis},
  { name: "gfw_token", every: 1440, secret: "GFW_API_TOKEN", read: gfwAuth },
  { name: "gfw_sar", every: 1440, secret: "GFW_API_TOKEN", read: gfwSar },
  { name: "centcom_rss", every: 240, read: centcomRss },
  { name: "centcom_dvids", every: 30, read: centcomDvids },
  { name: "satellite_context", every: 720, read: satelliteContext },
  { name: "gdelt_context", every: 60, read: gdeltContext },
  { name: "sentinel_catalog", every: 180, read: sentinelCatalog },
  { name: "aerial_archive", every: 1440, read: aerialArchive },
  { name: "fcdo", every: 480, read: fcdoAdvice },
  { name: "marad_official", every: 360, read: maradAdvisories },
  { name: "us_dod_rss", every: 240, read: dodOfficialRss },
  { name: "idf_official", every: 120, read: idfReleases },
  { name: "polymarket", every: 360, read: polymarketSnapshots },
  { name: "state_dept", every: 480, read: stateTravelAdvisories },
  { name: "mil_lol", every: 60, read: militaryWithFallback }, // adsb.lol, else adsb.fi
  { name: "adsb", every: 15, read: aviation },
  { name: "adsb_alt", every: 30, read: aviationAlternative },
  { name: "airbridge_context", every: 60, read: airbridgeContext },
  { name: "easa", every: 15, read: airBulletins },
  { name: "mscio", every: 15, read: seaBulletins },
  { name: "ioda", every: 15, read: outages },
  { name: "ais", every: 5, secret: "AIS_KEY", read: vessels },
  { name: "firms", every: 60, secret: "FIRMS_KEY", read: hotspots },
];

