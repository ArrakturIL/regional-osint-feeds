import { aviation } from '../collectors/aviation/adsb.js';
import { airbridgeContext } from '../collectors/aviation/airbridge.js';
import { aviationAlternative } from '../collectors/aviation/alternatives.js';
import { militaryFromCache } from '../collectors/aviation/military.js';
import { vessels } from '../collectors/maritime/ais.js';
import { gfwSarBaseline } from '../collectors/maritime/gfw-baseline.js';
import { gfwAuth, gfwSar } from '../collectors/maritime/gfw.js';
import { maradAdvisories } from '../collectors/maritime/marad.js';
import { seaBulletins } from '../collectors/maritime/mscio.js';
import { polymarketSnapshots } from '../collectors/markets/polymarket.js';
import { gdeltContext } from '../collectors/media/gdelt.js';
import { outages } from '../collectors/network/ioda.js';
import { centcomDvids } from '../collectors/official/centcom-dvids.js';
import { dodOfficialRss } from '../collectors/official/dod.js';
import { airBulletins } from '../collectors/official/easa.js';
import { fcdoAdvice } from '../collectors/official/fcdo.js';
import { idfReleases } from '../collectors/official/idf.js';
import { stateTravelAdvisories } from '../collectors/official/state.js';
import { copernicusAnalysis } from '../collectors/satellite/copernicus.js';
import { hotspots } from '../collectors/satellite/firms.js';
import { satelliteContext } from '../collectors/satellite/github.js';
import { unosatAnalysis } from '../collectors/satellite/unosat.js';
export const sources = [
  { name: 'gfw_sar_baseline', every: 1440, secret: 'GFW_API_TOKEN', read: gfwSarBaseline },
  { name: 'unosat_analysis', every: 720, read: unosatAnalysis },
  { name: 'copernicus_ems', every: 360, read: copernicusAnalysis },
  { name: 'gfw_token', every: 1440, secret: 'GFW_API_TOKEN', read: gfwAuth },
  { name: 'gfw_sar', every: 1440, secret: 'GFW_API_TOKEN', read: gfwSar },
  { name: 'centcom_dvids', every: 30, read: centcomDvids },
  { name: 'satellite_context', every: 720, read: satelliteContext },
  { name: 'gdelt_context', every: 60, read: gdeltContext },
  { name: 'fcdo', every: 480, read: fcdoAdvice },
  { name: 'marad_official', every: 360, read: maradAdvisories },
  { name: 'us_dod_rss', every: 240, read: dodOfficialRss },
  { name: 'idf_official', every: 120, read: idfReleases },
  { name: 'polymarket', every: 360, read: polymarketSnapshots },
  { name: 'state_dept', every: 480, read: stateTravelAdvisories },
  // Q12: both read the D1 cache filled by adsb-mil.yml / adsb.yml on GitHub.
  { name: 'mil_lol', every: 60, read: militaryFromCache },
  { name: 'adsb', every: 15, read: aviation },
  { name: 'adsb_alt', every: 30, read: aviationAlternative },
  { name: 'airbridge_context', every: 60, read: airbridgeContext },
  { name: 'easa', every: 15, read: airBulletins },
  { name: 'mscio', every: 15, read: seaBulletins },
  { name: 'ioda', every: 15, read: outages },
  { name: 'ais', every: 5, secret: 'AIS_KEY', read: vessels },
  { name: 'firms', every: 60, secret: 'FIRMS_KEY', read: hotspots },
];
