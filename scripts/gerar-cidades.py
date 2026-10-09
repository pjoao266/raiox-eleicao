#!/usr/bin/env python3
"""Indexa a base salva por município; nenhuma consulta externa."""
from pathlib import Path
import json
root=Path('public/data');meta=json.loads((root/'catalog.json').read_text());index={'version':meta['version'],'scopes':{}}
for scope,file in meta['scopes'].items():
 e,c,uf=scope.split(':');listing=json.loads((root/file).read_text())['candidates'];cities={}
 for packfile in dict.fromkeys(x['pack'] for x in listing):
  pack=json.loads((root/packfile).read_text())
  assert pack['version']==meta['version']
  for id,value in pack['candidates'].items():
   sqcand=value['candidate']['sqcand']
   for row in value['rows']:cities.setdefault(row[0],{'rows':[],'counted':row[3],'updatedAt':row[4]})['rows'].append([sqcand,row[1],row[2]])
 mapping={};keys=sorted(cities)
 for start in range(0,len(keys),100):
  name=f'city-results/{e}-{c}-{uf}-{start//100}.json';p=root/name;p.parent.mkdir(exist_ok=True)
  selected=keys[start:start+100];p.write_text(json.dumps({'version':meta['version'],'cities':{key:cities[key] for key in selected}},ensure_ascii=False,separators=(',',':')))
  for key in selected:mapping[key]=name
 index['scopes'][scope]=mapping
(root/'city-index.json').write_text(json.dumps(index,separators=(',',':')))
print(json.dumps({'scopes':len(index['scopes']),'version':meta['version']}))
