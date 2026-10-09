#!/usr/bin/env python3
"""Gera ativos compactos do site a partir da base completa, sem chamadas ao TSE."""
import sqlite3,json,argparse,unicodedata
from pathlib import Path
from datetime import datetime,timezone
UFS={'ac':'Acre','al':'Alagoas','ap':'Amapá','am':'Amazonas','ba':'Bahia','ce':'Ceará','df':'Distrito Federal','es':'Espírito Santo','go':'Goiás','ma':'Maranhão','mt':'Mato Grosso','ms':'Mato Grosso do Sul','mg':'Minas Gerais','pa':'Pará','pb':'Paraíba','pr':'Paraná','pe':'Pernambuco','pi':'Piauí','rj':'Rio de Janeiro','rn':'Rio Grande do Norte','rs':'Rio Grande do Sul','ro':'Rondônia','rr':'Roraima','sc':'Santa Catarina','sp':'São Paulo','se':'Sergipe','to':'Tocantins'}
parser=argparse.ArgumentParser();parser.add_argument('--database',required=True);parser.add_argument('--output',required=True);args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
db=sqlite3.connect(args.database);db.row_factory=sqlite3.Row
manifest=json.load(open(Path(args.database).parent/'manifesto.json'));assert manifest['integrity_check']=='ok';assert all(x['status']=='ok' for x in manifest['coverage']), 'A coleta precisa estar completa antes de gerar a base do site.'
result_files={f"ele2026/{r['eleicao']}/dados/{r['uf']}/{r['uf']}{r['codigo_tse']}-c{r['cargo'].zfill(4)}-e{r['eleicao'].zfill(6)}-u.json" for r in db.execute('SELECT DISTINCT eleicao,cargo,uf,codigo_tse FROM resultados')};expected_files={r[0] for r in db.execute("SELECT caminho FROM arquivos WHERE status='ok'")};assert expected_files==result_files, f'Arquivos sem resultados processados: {len(expected_files-result_files)}';
version='2026-1t-'+manifest['generated_at'].replace(':','').replace('+','').replace('.','')
def dump(file,value):
 p=out/file;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def candidate(r):return {'id':f"{r['eleicao']}:{r['cargo']}:{r['uf_candidatura']}:{r['sqcand']}",'election':r['eleicao'],'cargo':r['cargo'],'uf':r['uf_candidatura'],'sqcand':r['sqcand'],'number':r['numero'],'name':r['nome'],'fullName':r['nome_completo'],'party':r['partido'],'status':r['situacao'],'destination':r['destinacao']}
def result(r):return {'votes':r['votos'],'percentage':r['percentual'],'counted':r['secoes_totalizadas_percentual'],'updatedAt':r['atualizado_tse'],'status':r['situacao'],'destination':r['destinacao']}
# Join once to get candidate status/destination; primary key index serves each candidate.
SELECT='''SELECT r.*,c.situacao,c.destinacao FROM resultados r INDEXED BY idx_resultados_candidato JOIN candidatos c ON c.eleicao=r.eleicao AND c.cargo=r.cargo AND c.uf_candidatura=r.uf_candidatura AND c.sqcand=r.sqcand'''
cities={};citycounts={}
for r in db.execute('SELECT * FROM municipios'):
 e=r['eleicao'];cities.setdefault(e,{})[r['uf']+r['codigo_tse']]={'uf':r['uf'],'code':r['codigo_tse'],'ibge':r['codigo_ibge'],'name':r['nome'],'zones':json.loads(r['zonas_json'])};citycounts.setdefault(e,{})[r['uf']]=citycounts.setdefault(e,{}).get(r['uf'],0)+1
dump('cities.json',{'version':version,'cities':cities})
config=json.load(open(Path(args.database).parent/'eleicoes.json'));elections=[]
for p in config['pl']:
 if p['c']!='ele2026':continue
 for e in p['e']:
  if str(e['t'])!='1' or str(e['cd']) not in cities:continue
  cargos={};areas={}
  for a in e['abr']:
   for c in a['cp']:
    if str(c['cd']) not in ['1','3','5','6','7','8']:continue
    cargos[str(c['cd'])]={'id':str(c['cd']),'name':c['ds']};areas.setdefault(str(c['cd']),[]).append(a['cd'])
  elections.append({'id':str(e['cd']),'cycle':'ele2026','turn':'1','name':e['nm'],'cargos':list(cargos.values()),'areas':[a['cd'] for a in e['abr']],'cargoAreas':areas})
scopes={};packs=0
for group in db.execute('SELECT DISTINCT eleicao,cargo,uf_candidatura FROM candidatos ORDER BY eleicao,cargo,uf_candidatura').fetchall():
 e,c,u=tuple(group);cat=[];groupcands=db.execute('SELECT * FROM candidatos WHERE eleicao=? AND cargo=? AND uf_candidatura=? ORDER BY sqcand',(e,c,u)).fetchall()
 for offset in range(0,len(groupcands),40):
  filename=f'packs/{e}-{c}-{u}-{offset//40}.json';pack={}
  for r in groupcands[offset:offset+40]:
   cand=candidate(r);sid=cand['sqcand'];records=db.execute(SELECT+' WHERE r.eleicao=? AND r.cargo=? AND r.uf_candidatura=? AND r.sqcand=? ORDER BY r.uf,r.codigo_tse',(e,c,u,sid)).fetchall();municipal=[];summary=None;states=[]
   for record in records:
    if record['nivel']=='municipio':municipal.append([record['uf']+record['codigo_tse'],record['votos'],record['percentual'],record['secoes_totalizadas_percentual'],record['atualizado_tse']])
    elif record['nivel']=='brasil' or (c!='1' and record['uf']==u):summary=result(record)
    elif c=='1' and record['nivel']=='uf':states.append({**result(record),'uf':record['uf'],'name':UFS[record['uf']]})
   pack[cand['id']]={'candidate':cand,'summary':summary,'states':states,'rows':municipal};cat.append({**cand,'pack':filename})
  dump(filename,{'version':version,'candidates':pack});packs+=1
 scope=e+':'+c+':'+u;file=f'candidates/{e}-{c}-{u}.json';dump(file,{'version':version,'candidates':cat});scopes[scope]=file
print(json.dumps({'event':'candidate_packs','packs':packs,'scopes':len(scopes)}),flush=True)
def normalized(s):return ''.join(ch for ch in unicodedata.normalize('NFD',s or '').casefold() if not unicodedata.combining(ch))
db.create_collation('PT_BR',lambda a,b:(normalized(a)>normalized(b))-(normalized(a)<normalized(b)))
performance_scopes={}
for election in elections:
 e=election['id']
 for cargo in election['cargos']:
  c=cargo['id'];ufs=[u for u in citycounts[e] if (c!='8' or u=='df') and (c!='7' or u!='df')]
  for u in ['br',*ufs]:
   clause='' if u=='br' else ' AND r.uf=?';params=(e,c) if u=='br' else (e,c,u)
   query='''SELECT r.*,c.numero,c.nome,c.nome_completo,c.partido,c.situacao,c.destinacao FROM resultados r JOIN candidatos c ON c.eleicao=r.eleicao AND c.cargo=r.cargo AND c.uf_candidatura=r.uf_candidatura AND c.sqcand=r.sqcand JOIN municipios m ON m.eleicao=r.eleicao AND m.uf=r.uf AND m.codigo_tse=r.codigo_tse WHERE r.eleicao=? AND r.cargo=? AND r.nivel='municipio' AND c.destinacao='Válido' '''+clause+''' ORDER BY r.percentual DESC,r.votos DESC,m.nome COLLATE PT_BR ASC,c.nome COLLATE PT_BR ASC LIMIT 10'''
   rows=[]
   for r in db.execute(query,params):rows.append({**cities[e][r['uf']+r['codigo_tse']],**result(r),'candidate':candidate(r)})
   total=sum(citycounts[e][k] for k in ufs) if u=='br' else citycounts[e][u];loaded=db.execute("SELECT COUNT(DISTINCT r.uf||r.codigo_tse) FROM resultados r JOIN candidatos c ON c.eleicao=r.eleicao AND c.cargo=r.cargo AND c.uf_candidatura=r.uf_candidatura AND c.sqcand=r.sqcand WHERE r.eleicao=? AND r.cargo=? AND r.nivel='municipio' AND c.destinacao='Válido'"+clause,params).fetchone()[0];filename=f'performances/{e}-{c}-{u}.json';dump(filename,{'version':version,'rows':rows,'processed':total,'total':total,'failed':0,'unavailable':max(0,total-loaded),'nextCursor':None,'expiresAt':None});performance_scopes[e+':'+c+':'+u]=filename
catalog={'version':version,'generatedAt':manifest['generated_at'],'elections':elections,'scopes':scopes,'performanceScopes':performance_scopes,'cityCounts':citycounts,'coverage':manifest['coverage']};dump('catalog.json',catalog);db.close();print(json.dumps({'event':'done','packs':packs,'files':len(list(out.rglob('*.json'))),'bytes':sum(p.stat().st_size for p in out.rglob('*.json'))}),flush=True)
