import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCandidates,parseResult,parseElections,rankCities} from '../lib/tse.ts';
const fixture=JSON.parse(fs.readFileSync('tests/president.json','utf8'));
test('official candidate identities include election cargo and UF',()=>{
 const a=parseCandidates(fixture,{election:'6257',cargo:'1',uf:'br'});
 assert.equal(a.length,12);assert.equal(a.find(x=>x.number==='13')?.name,'LULA');
 assert.notEqual(a[0].id,parseCandidates(fixture,{election:'6259',cargo:'1',uf:'mg'})[0].id);
});
test('uses official high precision percent and votes',()=>{
 const r=parseResult(fixture,'280002542548','1');assert.equal(r?.votes,53879538);assert.equal(r?.percentage,45.162767911);assert.equal(r?.counted,100);
});
test('explicit zero is retained and absent candidates are not zero',()=>{
 const j=structuredClone(fixture);const c=j.carg[0].agr[0].par[0].cand[0];c.vap='0';c.pvapn='0';
 assert.equal(parseResult(j,c.sqcand,'1')?.votes,0);assert.equal(parseResult(j,'missing','1'),null);
 j.s.st='0';assert.equal(parseResult(j,c.sqcand,'1'),null);
});
test('excludes exterior and missing rows, deterministic ties',()=>{
 const rows=[{name:'B',uf:'mg',percentage:10,votes:5},{name:'A',uf:'mg',percentage:10,votes:5},{name:'Z',uf:'zz',percentage:99,votes:5},{name:'C',uf:'mg',percentage:0,votes:0}];
 const r=rankCities(rows);assert.deepEqual(r.top.map(x=>x.name),['A','B','C']);assert.equal(r.bottom[0].name,'C');
});
test('only exposes available 2026 cargos and turns from config',()=>{
 const j=JSON.parse(fs.readFileSync('tests/elections.json','utf8'));const e=parseElections(j);assert.ok(e.length);assert.ok(e.every(x=>x.cycle==='ele2026'));assert.ok(e.some(x=>x.id==='6257'&&x.cargos.some(c=>c.id==='1')));
});
