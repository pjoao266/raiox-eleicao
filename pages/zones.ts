import {parseResult,resultPath} from '../lib/tse';
export async function zones(url:string,fetcher:typeof fetch,base:string,signal?:AbortSignal){
 const q=new URL(url,location.origin).searchParams,e=q.get('election')!,cargo=q.get('cargo')!,uf=q.get('uf')!,code=q.get('municipality')!,id=q.get('candidateId')!,cursor=Number(q.get('cursor')||0);
 const meta=await (await fetcher(base+'data/cities.json',{signal})).json();const city=meta.cities[e]?.[uf+code];if(!city)throw Error('Município ausente da base.');
 const sqcand=id.split(':').at(-1)!;let failed=0;const selected=city.zones.slice(cursor,cursor+6);
 const rows=await Promise.all(selected.map(async(zone:string)=>{try{const r=await fetcher('https://resultados.tse.jus.br/oficial/'+resultPath(e,cargo,uf,code,zone),{signal});if(r.status===404)return {zone,available:false};if(!r.ok)throw Error('Falha no TSE');const result=parseResult(await r.json(),sqcand,cargo);return {zone,...result,available:!!result};}catch(err){if(signal?.aborted)throw err;failed++;return null;}}));
 return Response.json({city,zones:rows.filter(Boolean),failed,nextCursor:cursor+selected.length>=city.zones.length?null:cursor+selected.length,total:city.zones.length});
}
