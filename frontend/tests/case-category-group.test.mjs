// 19.11: the CENTCOM–IDF–Mossad meeting dossier showed under "Авиация":
// /militar/ substring → aviation. Categories below are every category in
// CORE D1 monitor_events on 19.11.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src = readFileSync(new URL('../src/api/normalizeCase.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace(/^export function /gm, 'function ');
const {caseGroup} = vm.runInNewContext(src + '\n({caseGroup})', {});

const EXPECT = {
  maritime: ['maritime_security','maritime_claim_unverified','maritime_attack','maritime_suspicious_activity','maritime_infrastructure_strike','maritime_blockade_enforcement','carrier_force_posture'],
  aviation: ['aviation_logistics','official_aviation_advisory'],
  security: ['high_level_military_coordination','us_iran_military_planning','israel_security_preparation','us_forces_direct_attack_claim','unverified_airstrike_report','strategic_intelligence_reporting','sanctions_iran_proxy','regional_energy_infrastructure_security','regional_drone_attack','regional_defense_coordination','regional_campaign_planning','regional_air_defence','regional_air_campaign','air_defense_activity','protective_relocation','official_protective_warning','official_confirmation_security_plot','missile_interception','israel_defense_readiness','iran_proxy_iraq_internal_security','iran_linked_overseas_plot','iran_linked_overseas_assassination_plot','iran_claim_us_base_attack','intelligence_threat_and_protective_measures','intelligence_threat','intelligence_assessment','high_level_intelligence_diplomacy','gaza_diplomacy_security','direct_attack_us_facility','us_intelligence_communications_outage'],
  other: ['technology_outage_confirmed','emergency_communications_local_outage','regional_diplomacy','diplomacy','', null, 'repair_affairs'],
};

test('dossier group by whole words of the monitor category', () => {
  for (const [group, cats] of Object.entries(EXPECT))
    for (const c of cats) assert.equal(caseGroup(c), group, String(c));
});
