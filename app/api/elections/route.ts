import {elections} from '@/lib/tse-fetch';
export async function GET(){try{return Response.json({elections:await elections()})}catch(e){return Response.json({error:(e as Error).message},{status:503})}}
