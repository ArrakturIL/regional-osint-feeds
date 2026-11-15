import test from 'node:test';
import assert from 'node:assert/strict';
import * as scheduler from '../src/schedule/runner.js';
import {sources} from '../src/schedule/sources.js';

test('Monitor scheduler exports a pure source eligibility contract',()=>{
  assert.equal(typeof scheduler.scheduledSourceNames,'function',
    'scheduler selection must be testable independently of network, D1, and cron');
});

test('every registered source preserves exact cadence across a UTC day, without extra calls',()=>{
  if(typeof scheduler.scheduledSourceNames!=='function')return; // First RED names missing export.
  const registered=new Map(sources.map(s=>[s.name,s.every]));
  assert.equal(registered.size,sources.length,'source registry must not duplicate keys');
  assert.equal(sources.length,26,'check new sources and their intended free-tier budgets deliberately');
  const actual=new Map([...registered].map(([name])=>[name,[]]));
  for(let minute=0;minute<1440;minute++){
    const due=scheduler.scheduledSourceNames(minute);
    assert.ok(Array.isArray(due),'slot='+minute);
    assert.equal(new Set(due).size,due.length,'duplicate collector in slot '+minute);
    for(const name of due){
      assert.ok(registered.has(name),'unknown automatic source '+name);
      actual.get(name).push(minute);
    }
    assert.deepEqual(scheduler.scheduledSourceNames(minute+1440),due,
      'one-day offset cannot alter source budget at minute '+minute);
  }
  for(const [name,every] of registered){
    assert.ok(Number.isInteger(every)&&every>=1&&1440%every===0, name+' invalid cadence');
    const slots=actual.get(name);
    assert.equal(slots.length,1440/every,name+' daily eligibility count drifted');
    for(let i=0;i<slots.length;i++){
      const next=slots[(i+1)%slots.length];
      const gap=(next+1440-slots[i])%1440||1440;
      assert.equal(gap,every,name+' cadence drifted at UTC minute '+slots[i]);
    }
  }
});

test('automatic eligibility is data-only and never skips the real high-priority collector slot',()=>{
  if(typeof scheduler.scheduledSourceNames!=='function')return;
  assert.ok(scheduler.scheduledSourceNames(0).includes('adsb'),'ADS-B 15min focus cadence');
  assert.ok(scheduler.scheduledSourceNames(1).includes('ais'),'AIS cadence remains 5min');
  assert.ok(scheduler.scheduledSourceNames(2).includes('easa'),'EASA and MSCIO remain paired');
  assert.ok(scheduler.scheduledSourceNames(2).includes('mscio'));
  assert.ok(scheduler.scheduledSourceNames(2).includes('ioda'));
  assert.deepEqual(scheduler.scheduledSourceNames(-1+1440),scheduler.scheduledSourceNames(1439));
});
