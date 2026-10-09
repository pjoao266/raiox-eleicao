export type Candidate={id:string,sqcand:string,name:string,fullName:string,number:string,party:string,uf:string,election:string,cargo:string,status:string,destination:string};
export type Result={votes:number,percentage:number,counted:number,updatedAt:string,status:string,destination:string,cacheFetchedAt?:number};
export type City={code:string,ibge:string,name:string,uf:string,zones:string[]};
export type Row=City&Result;
export type Election={id:string,cycle:string,turn:string,name:string,cargos:{id:string,name:string}[],areas:string[],cargoAreas:Record<string,string[]>};
export const UFS:Record<string,{id:string,name:string}>={ac:{id:'12',name:'Acre'},al:{id:'27',name:'Alagoas'},ap:{id:'16',name:'Amapá'},am:{id:'13',name:'Amazonas'},ba:{id:'29',name:'Bahia'},ce:{id:'23',name:'Ceará'},df:{id:'53',name:'Distrito Federal'},es:{id:'32',name:'Espírito Santo'},go:{id:'52',name:'Goiás'},ma:{id:'21',name:'Maranhão'},mt:{id:'51',name:'Mato Grosso'},ms:{id:'50',name:'Mato Grosso do Sul'},mg:{id:'31',name:'Minas Gerais'},pa:{id:'15',name:'Pará'},pb:{id:'25',name:'Paraíba'},pr:{id:'41',name:'Paraná'},pe:{id:'26',name:'Pernambuco'},pi:{id:'22',name:'Piauí'},rj:{id:'33',name:'Rio de Janeiro'},rn:{id:'24',name:'Rio Grande do Norte'},rs:{id:'43',name:'Rio Grande do Sul'},ro:{id:'11',name:'Rondônia'},rr:{id:'14',name:'Roraima'},sc:{id:'42',name:'Santa Catarina'},sp:{id:'35',name:'São Paulo'},se:{id:'28',name:'Sergipe'},to:{id:'17',name:'Tocantins'}};
export function numeric(value:unknown):number|null{if(value===null||value===undefined||value==='')return null;const n=Number(String(value).replace(',','.'));return Number.isFinite(n)?n:null;}
function entries(json:any,cargo:string):{candidate:any,party:any}[]{const c=(json?.carg||[]).find((x:any)=>String(x.cd)===String(Number(cargo)));return (c?.agr||[]).flatMap((a:any)=>(a.par||[]).flatMap((p:any)=>(p.cand||[]).map((candidate:any)=>({candidate,party:p}))));}
export function parseCandidates(json:any,context:{election:string,cargo:string,uf:string}):Candidate[]{return entries(json,context.cargo).map(({candidate:c,party:p})=>({...context,id:`${context.election}:${context.cargo}:${context.uf}:${c.sqcand}`,sqcand:String(c.sqcand),name:c.nmu||c.nm,fullName:c.nm,number:String(c.n),party:p.sg,status:c.st,destination:c.dvt})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));}
export function parseResult(json:any,candidateId:string,cargo:string):Result|null{
 if(json?.f!=='o'||!(numeric(json?.s?.st)!>0))return null;
 const c=entries(json,cargo).find(x=>String(x.candidate.sqcand)===candidateId)?.candidate;if(!c)return null;
 const votes=numeric(c.vap),percentage=numeric(c.pvapn??c.pvap);if(votes===null||percentage===null)return null;
 return {votes,percentage,counted:numeric(json.s.pstn??json.s.pst)??0,updatedAt:`${json.dt||json.dg} ${json.ht||json.hg}`,status:c.st,destination:c.dvt,cacheFetchedAt:json.cacheFetchedAt};
}
export function parseElections(json:any):Election[]{return (json?.pl||[]).filter((p:any)=>p.c==='ele2026').flatMap((p:any)=>(p.e||[]).map((e:any)=>{
 const cargos=new Map<string,{id:string,name:string}>(),cargoAreas:Record<string,string[]>={};
 for(const a of e.abr||[])for(const c of a.cp||[]){const id=String(c.cd);cargos.set(id,{id,name:c.ds});cargoAreas[id]=[...new Set([...(cargoAreas[id]||[]),String(a.cd)])];}
 return {id:String(e.cd),cycle:p.c,turn:String(e.t),name:e.nm,cargos:[...cargos.values()],areas:(e.abr||[]).map((a:any)=>a.cd),cargoAreas};
 })).filter((e:Election)=>e.cargos.some(c=>['1','3','5','6','7','8'].includes(c.id)));}

export function parseCities(json:any):City[]{return (json?.abr||[]).flatMap((a:any)=>(a.mu||[]).map((m:any)=>({code:String(m.cd).padStart(5,'0'),ibge:String(m.cdi),name:m.nm,uf:a.cd,zones:(m.z||[]).map((z:any)=>String(z).padStart(4,'0'))})));}
export function rankCities<T extends {name:string,uf:string,percentage:number,votes:number}>(rows:T[],limit=10):{top:T[],bottom:T[]}{const valid=rows.filter(r=>r.uf!=='zz'&&Number.isFinite(r.percentage));const tie=(a:T,b:T)=>b.votes-a.votes||a.name.localeCompare(b.name,'pt-BR');return {top:[...valid].sort((a,b)=>b.percentage-a.percentage||tie(a,b)).slice(0,limit),bottom:[...valid].sort((a,b)=>a.percentage-b.percentage||tie(a,b)).slice(0,limit)};}
export function resultPath(election:string,cargo:string,uf:string,city?:string,zone?:string):string{if(!/^\d{1,6}$/.test(election)||!/^\d{1,4}$/.test(cargo)||!['br','zz',...Object.keys(UFS)].includes(uf)||city&&!/^\d{5}$/.test(city)||zone&&!/^\d{4}$/.test(zone))throw new Error('Parâmetros inválidos.');return `ele2026/${election}/dados/${uf}/${uf}${city||''}${zone?`-z${zone}`:''}-c${cargo.padStart(4,'0')}-e${election.padStart(6,'0')}-u.json`;}
export type Performance=Row&{candidate:Candidate};
export function rankPerformances(rows:Performance[]):Performance[]{return [...rows].filter(r=>r.uf!=='zz'&&Number.isFinite(r.percentage)).sort((a,b)=>b.percentage-a.percentage||b.votes-a.votes||a.name.localeCompare(b.name,'pt-BR')||a.candidate.name.localeCompare(b.candidate.name,'pt-BR')).slice(0,10);}
export function cityPerformances(json:any,city:City,election:string,cargo:string):Performance[]{
 if(json?.f!=='o'||!(numeric(json?.s?.st)!>0))return [];
 const context={election,cargo,uf:cargo==='1'?'br':city.uf};
 return rankPerformances(entries(json,cargo).flatMap(({candidate:c,party:p})=>{const votes=numeric(c.vap),percentage=numeric(c.pvapn??c.pvap);if(votes===null||percentage===null||c.dvt!=='Válido')return [];return [{...city,votes,percentage,counted:numeric(json.s.pstn??json.s.pst)??0,updatedAt:`${json.dt||json.dg} ${json.ht||json.hg}`,cacheFetchedAt:json.cacheFetchedAt,status:c.st,destination:c.dvt,candidate:{...context,id:`${election}:${cargo}:${context.uf}:${c.sqcand}`,sqcand:String(c.sqcand),name:c.nmu||c.nm,fullName:c.nm,number:String(c.n),party:p.sg,status:c.st,destination:c.dvt}}]}));
}
export function scopedCities(cities:City[],cargo:string,uf:string):City[]{return cities.filter(c=>c.uf!=='zz'&&(uf==='br'||c.uf===uf)&&(cargo!=='8'||c.uf==='df')&&(cargo!=='7'||c.uf!=='df'));}
