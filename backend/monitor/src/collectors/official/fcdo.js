import { json } from '../../api/json.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
import { textOnly } from '../../utils/text.js';
export const FCDO_COUNTRIES = [
  'israel',
  'iran',
  'lebanon',
  'syria',
  'iraq',
  'jordan',
  'saudi-arabia',
  'united-arab-emirates',
];
export async function fcdoAdvice() {
  const results = await Promise.allSettled(
    FCDO_COUNTRIES.map(async country => {
      const data = await get('https://www.gov.uk/api/content/foreign-travel-advice/' + country, 'json');
      if (!data || typeof data !== 'object' || !data.title || !data.details)
        throw new Error('unexpected FCDO country response');
      const d = data.details;
      const sections = Array.isArray(d.parts) ? d.parts : [];
      const alerts = Array.isArray(d.alert_status)
        ? d.alert_status.map(x => textOnly(String(x))).slice(0, 6)
        : d.alert_status
          ? [textOnly(String(d.alert_status))]
          : [];
      const security = sections
        .filter(x => /safety|security|terror|political|regional|entry|summary/i.test(x.title || ''))
        .slice(0, 3)
        .map(x => ({ heading: String(x.title || '').slice(0, 80), summary: textOnly(String(x.body || '')) }));
      return item(country, {
        url: 'https://www.gov.uk/foreign-travel-advice/' + country,
        country,
        title: String(data.title).slice(0, 180),
        published_at: data.first_published_at || null,
        updated_at: data.public_updated_at || null,
        change_description: textOnly(String(d.change_description || '')),
        alert_status: alerts,
        security_sections: security,
        caveat: 'Travel guidance can lag security actions; not real-time confirmation.',
      });
    }),
  );
  const entries = results.flatMap(x => (x.status === 'fulfilled' ? [x.value] : []));
  const missing = FCDO_COUNTRIES.filter((_, i) => results[i].status === 'rejected');
  if (!entries.length) throw new Error('upstream FCDO country responses unavailable');
  return { entries, missing };
}
