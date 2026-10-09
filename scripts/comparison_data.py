"""Build a small, immutable first-round presidential comparison from official data."""
import csv, gzip, json, pathlib, time, urllib.request
from collections import defaultdict
ROOT=pathlib.Path(__file__).resolve().parents[1]
FIELDS=['eligible','turnout','abstention','cast','valid','blank','null','otherInvalid']
def number(value): return int(value or 0)
def normalize_2026(raw):
 e,v=raw['e'],raw['v'];cast=number(v['tv']);valid=number(v['vvc']);blank=number(v['vb']);null=number(v['tvn'])
 return dict(zip(FIELDS,[number(e['te']),number(e['c']),number(e['a']),cast,valid,blank,null,max(0,cast-valid-blank-null)]))
def normalize_2022(row):
 cast=number(row['QT_VOTOS']);valid=number(row['QT_TOTAL_VOTOS_VALIDOS']);blank=number(row['QT_VOTOS_BRANCOS']);null=number(row['QT_TOTAL_VOTOS_NULOS'])
 return dict(zip(FIELDS,[number(row['QT_APTOS']),number(row['QT_COMPARECIMENTO']),number(row['QT_ABSTENCOES']),cast,valid,blank,null,max(0,cast-valid-blank-null)]))
def add_totals(rows): return {k:sum(r.get(k,0) for r in rows) for k in FIELDS}
def vote_data(raw):
 out={}
 for cargo in raw.get('carg',[]):
  for group in cargo.get('agr',[]):
   for party in group.get('par',[]):
    for c in party.get('cand',[]):
     if c.get('dvt')=='Válido':out[str(c['n'])]=number(c['vap'])
 return out

def main():
 source=ROOT/'data/2022'
 cities=json.loads((ROOT/'public/data/cities.json').read_text())['cities']['6257']
 old_votes=defaultdict(dict);old_stats=defaultdict(list);old_names={};names={'2022':{},'2026':{}}
 with gzip.open(source/'presidencia_votos_municipio.csv.gz','rt',encoding='utf-8') as stream:
  for r in csv.DictReader(stream):
   if r['turno']!='1':continue
   key=r['uf'].lower()+r['codigo_tse'];old_votes[key][r['numero']]=int(r['votos_validos']);old_names[key]=r['municipio'];names['2022'][r['numero']]=r['candidato']
 with gzip.open(source/'presidencia_apuracao_zona.csv.gz','rt',encoding='utf-8') as stream:
  for r in csv.DictReader(stream,delimiter=';'):
   if r['NR_TURNO']=='1':old_stats[r['SG_UF'].lower()+r['CD_MUNICIPIO'].zfill(5)].append(normalize_2022(r))
 candidates=json.loads((ROOT/'public/data/candidates/6257-1-br.json').read_text())['candidates']
 names['2026']={c['number']:c['name'] for c in candidates}
 # Metadata comes from the consolidated official CSV; nominal votes reuse the saved JSON snapshot.
 new_stats=defaultdict(list)
 archive=ROOT/'data/2026-detail.zip'
 url='https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip'
 if not archive.exists():
  with urllib.request.urlopen(url,timeout=60) as response,archive.open('wb') as stream:
   while chunk:=response.read(1024*1024):stream.write(chunk)
 import zipfile,io
 with zipfile.ZipFile(archive) as zipped:
  member=next(n for n in zipped.namelist() if n.endswith('_BR.csv'))
  with io.TextIOWrapper(zipped.open(member),encoding='latin1') as stream:
   for r in csv.DictReader(stream,delimiter=';'):
    if r['NR_TURNO']=='1' and r['CD_CARGO']=='1' and r['CD_TIPO_ELEICAO']=='2':
     new_stats[r['SG_UF'].lower()+r['CD_MUNICIPIO'].zfill(5)].append(normalize_2022(r))
 new={key:{**add_totals(rows),'votes':{}} for key,rows in new_stats.items()}
 ufs=sorted({c['uf'] for c in cities.values()})
 for uf in ufs:new[uf]={**add_totals([r for k,r in new.items() if k.startswith(uf) and len(k)==7]),'votes':{}}
 new['br']={**add_totals([r for k,r in new.items() if len(k)==7]),'votes':{}}
 packs={}
 for c in candidates:
  if c['destination']!='Válido':continue
  if c['pack'] not in packs:packs[c['pack']]=json.loads((ROOT/'public/data'/c['pack']).read_text())
  result=packs[c['pack']]['candidates'][c['id']]
  for row in result['rows']:
   key=row[0]
   if key not in new:raise ValueError(f'Apuração ausente para {key}')
   new[key]['votes'][c['number']]=row[1]
  for row in result['states']:new[row['uf']]['votes'][c['number']]=row['votes']
  new['br']['votes'][c['number']]=result['summary']['votes']
 for key,row in new.items():
  # The snapshot omits overseas city rows; the national total still includes the exterior.
  if key.startswith('zz') and len(key)==7:continue
  if sum(row['votes'].values())!=row['valid']:raise ValueError(f'Votos válidos divergentes em {key}: CSV={row["valid"]}, snapshot={sum(row["votes"].values())}')
 def previous(keys):
  votes=defaultdict(int)
  for key in keys:
   for num,total in old_votes.get(key,{}).items():votes[num]+=total
  stats=add_totals([x for k in keys for x in old_stats.get(k,[])])
  return {**stats,'votes':dict(votes)} if keys else None
 rows=[]
 for key,c in cities.items():rows.append({**c,'id':key,'before':previous([key]) if key in old_votes and key in old_stats else None,'after':new[key]})
 for key in sorted(set(old_votes)-set(cities)):
  if key.startswith('zz'):continue
  rows.append({'id':key,'uf':key[:2],'code':key[2:],'name':old_names[key],'before':previous([key]),'after':None})
 states=[{'id':uf,'uf':uf,'name':uf.upper(),'before':previous([k for k in old_votes if k.startswith(uf)]),'after':new[uf]} for uf in sorted({c['uf'] for c in cities.values()})]
 result={'version':'2022-2026-1t-v1','years':[2022,2026],'turn':1,'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'names':names,'cities':rows,'states':states,'national':{'id':'br','uf':'br','name':'Brasil','before':previous(list(old_votes)),'after':new['br']},'sources':['https://dadosabertos.tse.jus.br/dataset/resultados-2022',url]}
 output=ROOT/'public/data/comparison.json';output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
 print(json.dumps({'complete':True,'cities':len(rows),'matched':sum(r['before'] is not None and r['after'] is not None for r in rows),'bytes':output.stat().st_size}),flush=True)
if __name__=='__main__':main()
