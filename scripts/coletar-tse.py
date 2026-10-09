#!/usr/bin/env python3
"""Coleta retomável de resultados oficiais municipais, 1º turno 2026."""
import asyncio,aiohttp,sqlite3,json,gzip,hashlib,time,argparse,csv,zipfile
from pathlib import Path
from datetime import datetime,timezone
BASE='https://resultados.tse.jus.br/oficial/'
CARGOS={'1':'Presidente','3':'Governador','5':'Senador','6':'Deputado Federal','7':'Deputado Estadual','8':'Deputado Distrital'}
def now(): return datetime.now(timezone.utc).isoformat()
def num(v):
 if v is None or v=='': return None
 try:return float(str(v).replace(',','.'))
 except ValueError:return None
def path_result(e,c,u,m=''):return f'ele2026/{e}/dados/{u}/{u}{m}-c{c.zfill(4)}-e{e.zfill(6)}-u.json'
def init_db(p):
 db=sqlite3.connect(p);db.executescript('''PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
 CREATE TABLE IF NOT EXISTS municipios(eleicao TEXT,uf TEXT,codigo_tse TEXT,codigo_ibge TEXT,nome TEXT,zonas_json TEXT,PRIMARY KEY(eleicao,uf,codigo_tse));
 CREATE TABLE IF NOT EXISTS candidatos(eleicao TEXT,cargo TEXT,uf_candidatura TEXT,sqcand TEXT,numero TEXT,nome TEXT,nome_completo TEXT,partido TEXT,situacao TEXT,destinacao TEXT,PRIMARY KEY(eleicao,cargo,uf_candidatura,sqcand));
 CREATE TABLE IF NOT EXISTS resultados(eleicao TEXT,turno INTEGER,cargo TEXT,uf TEXT,codigo_tse TEXT,nivel TEXT,uf_candidatura TEXT,sqcand TEXT,votos INTEGER,percentual REAL,secoes_totalizadas_percentual REAL,atualizado_tse TEXT,arquivo_origem TEXT,PRIMARY KEY(eleicao,cargo,uf,codigo_tse,sqcand));
 CREATE TABLE IF NOT EXISTS arquivos(caminho TEXT PRIMARY KEY,status TEXT,http_status INTEGER,bytes INTEGER,sha256 TEXT,coletado_em TEXT,erro TEXT);
 ''');return db
async def main(args):
 out=Path(args.output);out.mkdir(parents=True,exist_ok=True);db=init_db(out/'tse_2026_1t.sqlite');started=time.time()
 async with aiohttp.ClientSession(trust_env=True,timeout=aiohttp.ClientTimeout(total=50),connector=aiohttp.TCPConnector(limit=args.workers),headers={'User-Agent':'RaioX2026-public-election-data/1.0'}) as session:
  async def get(path):
   error='';status=0
   for attempt in range(4):
    try:
     async with session.get(BASE+path) as response:
      status=response.status
      if status==404:return None,status,'Arquivo não publicado'
      response.raise_for_status();raw=await response.read();value=json.loads(raw)
      if '/dados/' in path and value.get('f')!='o':raise ValueError('Arquivo não oficial')
      return raw,status,''
    except Exception as e:
     error=f'{type(e).__name__}: {e}'
     if attempt<3:await asyncio.sleep(0.5*(2**attempt))
   return None,status,error
  raw,_,error=await get('comum/config/ele-c.json')
  if not raw:raise RuntimeError(error)
  (out/'eleicoes.json').write_bytes(raw);config=json.loads(raw);elections=[e for p in config.get('pl',[]) if p.get('c')=='ele2026' for e in p.get('e',[]) if str(e.get('t'))=='1' and any(str(c['cd']) in CARGOS for a in e.get('abr',[]) for c in a.get('cp',[]))]
  tasks=[];city_counts={}
  for e in elections:
   eid=str(e['cd']);configpath=f'ele2026/{eid}/config/mun-e{eid.zfill(6)}-cm.json';raw,_,error=await get(configpath)
   if not raw:raise RuntimeError(configpath+': '+error)
   (out/f'municipios_{eid}.json').write_bytes(raw);mun=json.loads(raw);areas={}
   for a in e.get('abr',[]):
    for c in a.get('cp',[]):
     if str(c['cd']) in CARGOS:areas.setdefault(str(c['cd']),set()).add(a['cd'])
   cities=[]
   for a in mun.get('abr',[]):
    if a['cd']=='zz':continue
    for m in a.get('mu',[]):
     city=(a['cd'],str(m['cd']).zfill(5));cities.append(city)
     db.execute('INSERT OR REPLACE INTO municipios VALUES(?,?,?,?,?,?)',(eid,*city,str(m['cdi']),m['nm'],json.dumps(m.get('z',[]))))
   city_counts[eid]=len(cities)
   for cargo,allowed in areas.items():
    scoped=[(u,m) for u,m in cities if ('br' in allowed or u in allowed) and (cargo!='8' or u=='df') and (cargo!='7' or u!='df')]
    for u,m in scoped:tasks.append((eid,cargo,u,m,'municipio',path_result(eid,cargo,u,m)))
    for u in sorted({u for u,m in scoped}):tasks.append((eid,cargo,u,'','uf',path_result(eid,cargo,u)))
    if cargo=='1':tasks.append((eid,cargo,'br','','brasil',path_result(eid,cargo,'br')))
  db.commit();expected=len(tasks);done=failed=downloaded=records=0;queue=asyncio.Queue()
  for item in tasks:queue.put_nowait(item)
  print(json.dumps({'event':'start','files':expected,'municipalities':city_counts,'workers':args.workers}),flush=True)
  def ingest(item,raw):
   nonlocal records
   e,c,u,m,level,path=item;j=json.loads(raw);scope='br' if c=='1' else u;counted=num(j.get('s',{}).get('pstn',j.get('s',{}).get('pst')));updated=f"{j.get('dt',j.get('dg',''))} {j.get('ht',j.get('hg',''))}";counted_sections=num(j.get('s',{}).get('st')) or 0
   for cargo in j.get('carg',[]):
    if str(cargo.get('cd'))!=c:continue
    candidates=[];results=[]
    for a in cargo.get('agr',[]):
     for party in a.get('par',[]):
      for cand in party.get('cand',[]):
       sid=str(cand['sqcand']);candidates.append((e,c,scope,sid,str(cand.get('n','')),cand.get('nmu') or cand.get('nm'),cand.get('nm'),party.get('sg'),cand.get('st'),cand.get('dvt')))
       votes=num(cand.get('vap'));pct=num(cand.get('pvapn',cand.get('pvap')))
       if counted_sections>0 and votes is not None and pct is not None:results.append((e,1,c,u,m,level,scope,sid,int(votes),pct,counted,updated,path))
    db.executemany('INSERT OR REPLACE INTO candidatos VALUES(?,?,?,?,?,?,?,?,?,?)',candidates);db.executemany('INSERT OR REPLACE INTO resultados VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',results);records+=len(results)
   return j.get('tf')
  async def worker():
   nonlocal done,failed,downloaded
   while not queue.empty():
    try:item=queue.get_nowait()
    except asyncio.QueueEmpty:return
    path=item[-1];previous=db.execute('SELECT status FROM arquivos WHERE caminho=?',(path,)).fetchone();dest=out/'originais'/f'{path}.gz'
    if previous and previous[0]=='ok' and dest.exists():done+=1;queue.task_done();continue
    raw,status,error=await get(path)
    if raw:
     try:
      ingest(item,raw);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(gzip.compress(raw,compresslevel=3,mtime=0));db.execute('INSERT OR REPLACE INTO arquivos VALUES(?,?,?,?,?,?,?)',(path,'ok',status,len(raw),hashlib.sha256(raw).hexdigest(),now(),None));downloaded+=1
     except Exception as e:raw=None;error=f'Parsing: {e}'
    if raw is None:
     failed+=1;db.execute('INSERT OR REPLACE INTO arquivos VALUES(?,?,?,?,?,?,?)',(path,'ausente' if status==404 else 'falha',status,0,None,now(),error))
    done+=1;queue.task_done()
    if done%50==0 or done==expected:
     db.commit();summary={'event':'progress','processed':done,'total':expected,'failed':failed,'downloaded':downloaded,'rows_inserted':records,'seconds':round(time.time()-started)};(out/'progresso.json').write_text(json.dumps(summary,ensure_ascii=False));print(json.dumps(summary),flush=True)
  await asyncio.gather(*(worker() for _ in range(args.workers)))
 db.commit();db.execute('CREATE INDEX IF NOT EXISTS idx_resultados_candidato ON resultados(eleicao,cargo,uf_candidatura,sqcand,uf)');db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
 sql='''SELECT r.*,m.codigo_ibge,m.nome AS municipio,c.numero,c.nome AS candidato,c.partido,c.situacao,c.destinacao FROM resultados r LEFT JOIN municipios m ON m.eleicao=r.eleicao AND m.uf=r.uf AND m.codigo_tse=r.codigo_tse LEFT JOIN candidatos c ON c.eleicao=r.eleicao AND c.cargo=r.cargo AND c.uf_candidatura=r.uf_candidatura AND c.sqcand=r.sqcand ORDER BY r.eleicao,r.cargo,r.uf,r.codigo_tse,r.sqcand'''
 cursor=db.execute(sql)
 with gzip.open(out/'resultados_2026_1t.csv.gz','wt',encoding='utf-8',newline='') as f:
  writer=csv.writer(f);writer.writerow([col[0] for col in cursor.description]);writer.writerows(cursor)
 coverage=db.execute('SELECT status,COUNT(*),SUM(bytes) FROM arquivos GROUP BY status').fetchall();counts={table:db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in ['municipios','candidatos','resultados','arquivos']};integrity=db.execute('PRAGMA integrity_check').fetchone()[0]
 report={'generated_at':now(),'source':BASE,'scope':'Somente 1º turno de 2026, cargos 1/3/5/6/7/8, municípios do Brasil (exterior excluído); sem coleta por zona','elections':[{'id':str(e['cd']),'name':e['nm']} for e in elections],'expected_files':expected,'coverage':[{'status':s,'files':n,'uncompressed_bytes':b} for s,n,b in coverage],'counts':counts,'integrity_check':integrity,'duration_seconds':round(time.time()-started)}
 (out/'manifesto.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));db.close();print(json.dumps({'event':'complete',**report},ensure_ascii=False),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(Path(__file__).parent));parser.add_argument('--workers',type=int,default=16);args=parser.parse_args();asyncio.run(main(args))
