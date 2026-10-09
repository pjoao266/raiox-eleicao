import urllib.request,json,gzip,time
from pathlib import Path
ufs={'ac':12,'al':27,'am':13,'ap':16,'ba':29,'ce':23,'df':53,'es':32,'go':52,'ma':21,'mg':31,'ms':50,'mt':51,'pa':15,'pb':25,'pe':26,'pi':22,'pr':41,'rj':33,'rn':24,'ro':11,'rr':14,'rs':43,'sc':42,'se':28,'sp':35,'to':17}
p=Path('public/maps');p.mkdir(parents=True,exist_ok=True)
for uf,code in [('br',None),*ufs.items()]:
 if (p/(uf+'.json')).exists():continue
 url=('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF' if uf=='br' else f'https://servicodados.ibge.gov.br/api/v3/malhas/estados/{code}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio')
 for retry in range(4):
  try:
   raw=urllib.request.urlopen(url,timeout=120).read()
   if raw[:2]==b'\x1f\x8b':raw=gzip.decompress(raw)
   data=json.loads(raw);assert data.get('features');(p/(uf+'.json')).write_text(json.dumps(data,separators=(',',':')));break
  except Exception:
   if retry==3:raise
   time.sleep(2**retry)
