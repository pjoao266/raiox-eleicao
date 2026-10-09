import {candidates,cities,tse,validate} from '@/lib/tse-fetch';import {parseResult,resultPath,UFS,scopedCities} from '@/lib/tse';import {collectBatch} from '@/lib/collection';
export async function POST(request:Request){try{
 const b=await request.json() as any;const {election,cargo,uf,candidateId}=b;await validate(election,cargo,uf);const candidate=(await candidates(election,cargo,uf)).find(c=>c.id===candidateId);if(!candidate)throw new Error('Candidato inválido.');
 const all=scopedCities(await cities(election),cargo,uf);const cursor=b.cursor??0;if(!Number.isInteger(cursor)||cursor<0||cursor>all.length)throw new Error('Cursor inválido.');
 const refresh=b.refresh===true;const batchPromise=collectBatch(all,cursor,async city=>{const json=await tse(resultPath(election,cargo,city.uf,city.code),refresh);const value=parseResult(json,candidate.sqcand,cargo);return {...city,...value,available:!!value}});
 let summary=null,states:any[]=[];let stateFailures=0;
 if(cursor===0){const scope=uf;summary=parseResult(await tse(resultPath(election,cargo,scope),refresh),candidate.sqcand,cargo);if(cargo==='1'&&uf==='br'){for(let i=0,ufs=Object.keys(UFS);i<ufs.length;i+=4){const outcomes=await Promise.allSettled(ufs.slice(i,i+4).map(async state=>{const v=parseResult(await tse(resultPath(election,cargo,state),refresh),candidate.sqcand,cargo);return v?{...v,uf:state,name:UFS[state].name}:null}));for(const o of outcomes){if(o.status==='fulfilled'&&o.value)states.push(o.value);else stateFailures++;}}}}
 const batch=await batchPromise;
 return Response.json({summary,states,stateFailures,cities:batch.results.filter(x=>x.available),unavailable:batch.results.filter(x=>!x.available).length,failed:batch.failed,processed:batch.processed,total:all.length,nextCursor:batch.nextCursor,candidate,expiresAt:null});
}catch(e){return Response.json({error:(e as Error).message},{status:400})}}
