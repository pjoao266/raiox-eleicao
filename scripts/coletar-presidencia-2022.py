#!/usr/bin/env python3
"""Preserva somente presidência 2022 dos recursos oficiais, nos dois turnos."""
import csv,gzip,hashlib,io,json,urllib.request,zipfile,collections,argparse
from pathlib import Path
from datetime import datetime,timezone
ROOT='https://cdn.tse.jus.br/estatistica/sead/odsele/'
SOURCES={'votacao_candidato_munzona':'presidencia_votos_zona.csv.gz','detalhe_votacao_munzona':'presidencia_apuracao_zona.csv.gz'}
p=argparse.ArgumentParser();p.add_argument('--output',default='data/2022');args=p.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);report={'year':2022,'cargo':'Presidente','turns':[1,2],'generated_at':datetime.now(timezone.utc).isoformat(),'sources':[]};municipal=collections.defaultdict(int);meta={}
for dataset,target in SOURCES.items():
 url=f'{ROOT}{dataset}/{dataset}_2022.zip';archive=out/f'{dataset}_2022.zip'
 if not archive.exists():
  print(json.dumps({'event':'download','url':url}),flush=True)
  with urllib.request.urlopen(url,timeout=180) as source,archive.open('wb') as dest:
   while chunk:=source.read(1024*1024):dest.write(chunk)
 totals=collections.Counter();cities=collections.defaultdict(set);zones=collections.defaultdict(set);count=0
 with zipfile.ZipFile(archive) as z:
  name=f'{dataset}_2022_BR.csv'
  with io.TextIOWrapper(z.open(name),encoding='latin-1',newline='') as f,gzip.open(out/target,'wt',encoding='utf-8',newline='') as dest:
   rows=csv.DictReader(f,delimiter=';');writer=csv.DictWriter(dest,fieldnames=rows.fieldnames,delimiter=';');writer.writeheader()
   for r in rows:
    if r['CD_CARGO']!='1' or r['CD_TIPO_ELEICAO']!='2' or r['NR_TURNO'] not in ['1','2']:continue
    writer.writerow(r);count+=1;t=r['NR_TURNO'];key=(r['SG_UF'],r['CD_MUNICIPIO'].zfill(5));cities[t].add(key);zones[t].add((*key,r['NR_ZONA']))
    if dataset=='votacao_candidato_munzona':
     votes=int(r['QT_VOTOS_NOMINAIS_VALIDOS']);totals[(t,r['NR_CANDIDATO'])]+=votes;k=(t,*key,r['SQ_CANDIDATO']);municipal[k]+=votes;meta[k]=r
 assert count>0 and set(cities)=={'1','2'}
 report['sources'].append({'url':url,'archive_sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'member':name,'output':target,'output_bytes':(out/target).stat().st_size,'rows':count,'coverage':{t:{'brazil_cities':len([x for x in v if x[0]!='ZZ']),'overseas_localities':len([x for x in v if x[0]=='ZZ']),'city_zones':len(zones[t])} for t,v in cities.items()},'candidate_totals':{f'{t}:{n}':v for (t,n),v in totals.items()}})
 if totals:
  assert totals['1','13']==57259504 and totals['1','22']==51072345 and totals['2','13']==60345999 and totals['2','22']==58206354,'Totais nacionais não conferem'
fields=['turno','uf','codigo_tse','municipio','sqcand','numero','candidato','partido','votos_validos','percentual_validos'];valid=collections.Counter()
for k,v in municipal.items():valid[k[:3]]+=v
with gzip.open(out/'presidencia_votos_municipio.csv.gz','wt',encoding='utf-8',newline='') as f:
 writer=csv.writer(f);writer.writerow(fields)
 for k,v in sorted(municipal.items()):
  r=meta[k];den=valid[k[:3]];writer.writerow([*k[:3],r['NM_MUNICIPIO'],k[3],r['NR_CANDIDATO'],r['NM_URNA_CANDIDATO'],r['SG_PARTIDO'],v,v/den*100 if den else ''])
report['municipal_rows']=len(municipal);report['validation']='Totais nacionais de Lula e Jair conferem nos dois turnos; votos em trânsito preservados nos dados por zona; exterior separado por UF ZZ.'
(out/'manifesto.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'event':'complete',**report},ensure_ascii=False),flush=True)
