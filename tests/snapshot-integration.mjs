import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'raiox-snapshot-'));
const originalFetch=globalThis.fetch;
try{
 for(const name of ['analysis-state','local-data']){
  const source=fs.readFileSync(`lib/${name}.ts`,'utf8').replaceAll("from './analysis-state'","from './analysis-state.mjs'");
  const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
  fs.writeFileSync(path.join(temp,name+'.mjs'),result.outputText);
 }
 const paths=[];
 globalThis.fetch=async url=>{const pathname=new URL(url,'http://localhost').pathname;assert.ok(pathname.startsWith('/data/')||pathname.startsWith('/maps/'),'all municipal queries must use saved data');paths.push(pathname);const file=path.join(process.cwd(),'public',pathname);return fs.existsSync(file)?new Response(fs.readFileSync(file),{headers:{'Content-Type':'application/json'}}):new Response('',{status:404});};
 const data=await import(pathToFileURL(path.join(temp,'local-data.mjs')));
 const catalog=await data.catalog();assert.ok(catalog.elections.length);assert.ok(catalog.elections.every(e=>e.turn==='1'));
 const presidency=catalog.elections.find(e=>e.cargos.some(c=>c.id==='1'));
 const presidents=await data.localCandidates(presidency.id,'1','br');assert.ok(presidents.length>1);
 const national=await data.localAnalysis(presidents[0],'br');assert.equal(national.complete,true);assert.equal(national.nextCursor,null);assert.equal(national.total,Object.values(catalog.cityCounts[presidency.id]).reduce((a,b)=>a+b,0));assert.equal(national.rows.length+national.unavailable,national.total);
 const mg=await data.localAnalysis(presidents[0],'mg');assert.equal(mg.total,catalog.cityCounts[presidency.id].mg);assert.ok(mg.rows.every(r=>r.uf==='mg'));assert.equal(mg.key,presidents[0].id+':mg');assert.equal(mg.summary.votes,national.states.find(s=>s.uf==='mg').votes);
 const election=catalog.elections.find(e=>e.cargos.some(c=>c.id==='3'));
 const governors=await data.localCandidates(election.id,'3','mg');assert.ok(governors.length);assert.ok(governors.every(c=>c.uf==='mg'&&c.cargo==='3'));
 const governor=await data.localAnalysis(governors[0],'mg');assert.equal(governor.complete,true);assert.equal(governor.rows.length+governor.unavailable,governor.total);
 const performances=await data.localPerformances(election.id,'3','mg');assert.equal(performances.rows.length,10);assert.ok(performances.rows.every(r=>r.uf==='mg'&&r.candidate.cargo==='3'));assert.ok(performances.rows.every((r,i,arr)=>i===0||r.percentage<=arr[i-1].percentage));
 assert.equal(national.placements.counts.length,10);assert.equal(national.placements.loaded,national.rows.length);assert.equal(mg.placements.loaded,mg.rows.length);assert.ok(mg.placements.counts.every((n,i)=>n<=national.placements.counts[i]));assert.ok(national.placements.counts.reduce((a,b)=>a+b,0)<=national.total);
 const before=paths.length;await data.localAnalysis(presidents[0],'mg');assert.equal(paths.length,before,'repeat analysis reuses the loaded snapshot');
 console.log(JSON.stringify({snapshot:catalog.version,nationalMunicipalities:national.total,mgMunicipalities:mg.total,governorRows:governor.rows.length,performanceRows:performances.rows.length,requests:paths.length,passed:true}));
}finally{globalThis.fetch=originalFetch;fs.rmSync(temp,{recursive:true,force:true});}
