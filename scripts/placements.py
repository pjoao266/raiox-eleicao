"""Posições por votos nominais válidos, com empates compartilhados (1, 1, 3)."""
from math import isfinite

def city_positions(rows,valid_candidates):
 ranked=sorted((r for r in rows if r[0] in valid_candidates and isfinite(r[1]) and r[1]>0),key=lambda r:-r[1])
 positions={};previous=None;position=0
 for i,row in enumerate(ranked,1):
  if row[1]!=previous:position=i
  positions[row[0]]=position;previous=row[1]
 return positions

def placement_counts(cities,valid_candidates):
 regions={'br',*(key[:2] for key in cities)}
 result={candidate:{region:{'counts':[0]*10,'loaded':0} for region in sorted(regions)} for candidate in sorted(valid_candidates)}
 for key,city in cities.items():
  positions=city_positions(city['rows'],valid_candidates)
  for row in city['rows']:
   sid=row[0]
   if sid not in result or not isfinite(row[1]) or row[1]<0:continue
   position=positions.get(sid)
   for region in ('br',key[:2]):
    item=result[sid][region];item['loaded']+=1
    if position and position<=10:item['counts'][position-1]+=1
 return result
