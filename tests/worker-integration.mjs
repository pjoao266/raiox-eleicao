import {createRequire} from 'node:module';const req=createRequire(import.meta.url);const {Miniflare}=createRequire(req.resolve('wrangler/package.json'))('miniflare');import fs from 'node:fs';
const root=process.cwd()+'/dist/server';const files=fs.readdirSync(root,{recursive:true}).filter(p=>/\.(js|mjs)$/.test(p));const mf=new Miniflare({modules:[{type:'ESModule',path:root+'/index.js'},...files.filter(p=>p!=='index.js').map(p=>({type:'ESModule',path:root+'/'+p}))],modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],r2Buckets:['TSE_CACHE']});
try{
 const b=await mf.getR2Bucket('TSE_CACHE');const put=async(key,file)=>b.put('tse/'+key,JSON.stringify({at:Date.now(),value:JSON.parse(fs.readFileSync(file,'utf8'))}));
 await put('comum/config/ele-c.json','tests/elections.json');await put('ele2026/6257/dados/br/br-c0001-e006257-u.json','tests/president.json');await put('ele2026/6259/dados/mg/mg-c0005-e006259-u.json','tests/senator.json');

 const mun=JSON.parse(fs.readFileSync('tests/municipalities.json','utf8'));await put('ele2026/6257/config/mun-e006257-cm.json','tests/municipalities.json');
 const all=mun.abr.filter(a=>a.cd!=='zz').flatMap(a=>a.mu.map(m=>({...m,uf:a.cd})));
 for(const city of all.slice(0,20))await put(`ele2026/6257/dados/${city.uf}/${city.uf}${city.cd}-c0001-e006257-u.json`,'tests/president.json');
 for(const area of mun.abr.filter(a=>a.cd!=='zz'))await put(`ele2026/6257/dados/${area.cd}/${area.cd}-c0001-e006257-u.json`,'tests/president.json');
 const first=all[0];for(const zone of first.z)await put(`ele2026/6257/dados/${first.uf}/${first.uf}${first.cd}-z${zone}-c0001-e006257-u.json`,'tests/president.json');
 for(const path of ['/','/api/elections','/api/candidates?election=6257&cargo=1&uf=br','/api/candidates?election=6259&cargo=5&uf=mg']){const r=await mf.dispatchFetch('http://localhost'+path);const t=await r.text();console.log(path,r.status,t.length,t.slice(0,180));if(r.status!==200)throw new Error(t.slice(0,500));}

 const body={election:'6257',cargo:'1',uf:'br',candidateId:'6257:1:br:280002542548',cursor:0};
 for(const path of ['/api/preload','/api/analysis','/api/performances']){const r=await mf.dispatchFetch('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();console.log(path,r.status,'processed',data.processed,'rows',(data.cities||data.rows||[]).length);if(r.status!==200||data.processed!==20)throw new Error(JSON.stringify(data));}
 const q=new URLSearchParams({...body,uf:first.uf,municipality:first.cd,cursor:'0'});const zr=await mf.dispatchFetch('http://localhost/api/zones?'+q);const z=await zr.json();console.log('zones',zr.status,z.zones?.length);if(zr.status!==200||!z.zones.length)throw new Error(JSON.stringify(z));
}finally{await mf.dispose()}
