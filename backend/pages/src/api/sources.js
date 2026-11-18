// Source states describe polling outcomes, not proof of events.
export const SOURCE_LABELS = Object.freeze({
  adsb: 'ADS-B',
  adsb_alt: 'ADS-B резерв',
  ais: 'AIS',
  centcom_dvids: 'CENTCOM / DVIDS',
  easa: 'EASA',
  fcdo: 'FCDO',
  firms: 'NASA FIRMS',
  idf_official: 'ЦАХАЛ',
  marad_official: 'MARAD',
  mscio: 'UKMTO',
  polymarket: 'Polymarket',
  sentinel_catalog: 'Sentinel',
  state_dept: 'Госдеп США',
  mil_lol: 'Военный ADS-B',
});

// B4: Hebrew labels; the HE page never shows the Russian label.
export const SOURCE_LABELS_HE = Object.freeze({
  adsb: 'ADS-B',
  adsb_alt: 'ADS-B גיבוי',
  ais: 'AIS',
  centcom_dvids: 'CENTCOM / DVIDS',
  easa: 'EASA',
  fcdo: 'FCDO',
  firms: 'NASA FIRMS',
  idf_official: 'צה״ל',
  marad_official: 'MARAD',
  mscio: 'UKMTO',
  polymarket: 'Polymarket',
  sentinel_catalog: 'Sentinel',
  state_dept: 'משרד החוץ האמריקאי',
  mil_lol: 'ADS-B צבאי',
});

// Data providers whose terms require a citation with a link (adsb.fi:
// "cite adsb.fi and include a link to our home page"; AvioADSB CC BY-NC 4.0).
export const SOURCE_ATTRIBUTION = Object.freeze({
  adsb: [['adsb.lol', 'https://adsb.lol']],
  mil_lol: [
    ['adsb.lol', 'https://adsb.lol'],
    ['adsb.fi', 'https://adsb.fi'],
  ],
  adsb_alt: [['AvioADSB', 'https://avioadsb.org']],
  airbridge_context: [['AvioADSB', 'https://avioadsb.org']],
});

export const ISO = ms =>
  Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null;
const text = x => (typeof x === 'string' ? x.trim() : '');
const validStatus = new Set(['ok', 'partial', 'empty', 'error', 'retired', 'key_missing']);
export function assembleSources(statusRows = []) {
  return statusRows
    .filter(row => text(row.source) && row.state !== 'retired')
    .map(row => ({
      id: row.source,
      label: SOURCE_LABELS[row.source] || row.source,
      label_he: SOURCE_LABELS_HE[row.source] || row.source,
      attribution: (SOURCE_ATTRIBUTION[row.source] || []).map(([name, url]) => ({ name, url })),
      state: validStatus.has(row.state) ? row.state : 'unknown',
      checkedAt: ISO(row.attempted_at),
      attemptedAt: ISO(row.attempted_at),
      succeededAt: ISO(row.succeeded_at),
      description: text(row.detail),
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
