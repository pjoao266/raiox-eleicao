import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'raiox-city-'));const original=globalThis.fetch;const requests=[];
try{
 for(const name of ['analysis-state','local-data']){const source=fs.readFileSync(`lib/${name}.ts`,'utf8').replaceAll("from './analysis-state'","from './analysis-state.mjs'");fs.writeFileSync(path.join(temp,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText)}
 globalThis.fetch=async url=>{const p=new URL(url,'http://localhost').pathname;assert.ok(p.startsWith('/data/')||p.startsWith('/maps/'));requests.push(p);const f=path.join(process.cwd(),'public',p);return fs.existsSync(f)?new Response(fs.readFileSync(f)):new Response('',{status:404})};
 const data=await import(pathToFileURL(path.join(temp,'local-data.mjs')));const meta=await data.catalog();
 for(const cargo of ['1','3','5']){
  const e=meta.elections.find(e=>e.cargos.some(c=>c.id===cargo));const candidates=await data.localCandidates(e.id,cargo,'mg');const a=await data.localAnalysis(candidates[0],'mg');const city=a.rows.find(c=>c.name.toUpperCase().includes('BELO HORIZONTE'))||a.rows[0];
  const before=requests.length;const all=await data.localCityResults(e.id,cargo,city);const requested=requests.slice(before);assert.equal(all.length,candidates.length);assert.equal(new Set(all.map(x=>x.candidate.id)).size,candidates.length);assert.ok(!requested.some(p=>p.includes('/packs/')),'city results must not download all candidate packs');assert.ok(requested.some(p=>p.includes('/city-results/')));
  for(const c of candidates){const analysis=await data.localAnalysis(c,'mg');const row=analysis.rows.find(r=>r.code===city.code&&r.uf===city.uf);const actual=all.find(r=>r.candidate.id===c.id).result;assert.equal(actual?.votes,row?.votes);assert.equal(actual?.percentage,row?.percentage);if(!row)assert.equal(actual,null)}
  for(let i=1;i<all.length;i++)assert.ok((all[i-1].result?.percentage??-1)>=(all[i].result?.percentage??-1));
  const cached=requests.length;await data.localCityResults(e.id,cargo,city);assert.equal(requests.length,cached);console.log(JSON.stringify({cargo,city:city.name,candidates:all.length,complete:true}));
 }
}finally{globalThis.fetch=original;fs.rmSync(temp,{recursive:true,force:true})}
