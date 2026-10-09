import sys,sqlite3,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent/'tse2026-deps'))
import pyarrow as pa
import pyarrow.parquet as pq
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).parent;db=sqlite3.connect(root/'tse_2026_1t.sqlite');db.row_factory=sqlite3.Row
sql="""SELECT r.*,m.codigo_ibge,m.nome AS municipio,c.numero,c.nome AS candidato,c.partido,c.situacao,c.destinacao FROM resultados r LEFT JOIN municipios m ON m.eleicao=r.eleicao AND m.uf=r.uf AND m.codigo_tse=r.codigo_tse LEFT JOIN candidatos c ON c.eleicao=r.eleicao AND c.cargo=r.cargo AND c.uf_candidatura=r.uf_candidatura AND c.sqcand=r.sqcand ORDER BY r.eleicao,r.cargo,r.uf,r.codigo_tse,r.sqcand"""
cols=[('eleicao',pa.string()),('turno',pa.int64()),('cargo',pa.string()),('uf',pa.string()),('codigo_tse',pa.string()),('nivel',pa.string()),('uf_candidatura',pa.string()),('sqcand',pa.string()),('votos',pa.int64()),('percentual',pa.float64()),('secoes_totalizadas_percentual',pa.float64()),('atualizado_tse',pa.string()),('arquivo_origem',pa.string()),('codigo_ibge',pa.string()),('municipio',pa.string()),('numero',pa.string()),('candidato',pa.string()),('partido',pa.string()),('situacao',pa.string()),('destinacao',pa.string())]
schema=pa.schema(cols,metadata={b'source':b'https://resultados.tse.jus.br/oficial/',b'election_scope':b'2026 first round only',b'percent_scale':b'0-100 official TSE percentage'})
output=root/'resultados_2026_1t.parquet';count=0;cursor=db.execute(sql)
with pq.ParquetWriter(output,schema,compression='zstd',compression_level=3) as writer:
 while True:
  rows=cursor.fetchmany(100000)
  if not rows:break
  table=pa.Table.from_pylist([dict(r) for r in rows],schema=schema);writer.write_table(table);count+=len(rows)
  if count%1000000==0:print(json.dumps({'parquet_rows':count}),flush=True)
assert pq.ParquetFile(output).metadata.num_rows==db.execute('select count(*) from resultados').fetchone()[0]
print(json.dumps({'file':str(output),'rows':count,'bytes':output.stat().st_size,'verified':True}),flush=True);db.close()
