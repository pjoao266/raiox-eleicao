import {cities,tse,validate} from '@/lib/tse-fetch';
import {scopedCities,resultPath} from '@/lib/tse';
import {collectBatch} from '@/lib/collection';
export async function POST(request:Request){try{const b:any=await request.json();await validate(b.election,b.cargo,b.uf);const all=scopedCities(await cities(b.election),b.cargo,b.uf);const batch=await collectBatch(all,b.cursor??0,city=>tse(resultPath(b.election,b.cargo,city.uf,city.code)));return Response.json({processed:batch.processed,total:all.length,failed:batch.failed,nextCursor:batch.nextCursor})}catch(e){return Response.json({error:(e as Error).message},{status:400})}}
