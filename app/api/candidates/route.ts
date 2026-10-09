import {candidates} from '@/lib/tse-fetch';
export async function GET(r:Request){try{const q=new URL(r.url).searchParams;return Response.json({candidates:await candidates(q.get('election')||'',q.get('cargo')||'',q.get('uf')||'',q.get('refresh')==='true')})}catch(e){return Response.json({error:(e as Error).message},{status:400})}}
