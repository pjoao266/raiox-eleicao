#!/usr/bin/env python3
"""Apuração ao vivo da presidência por UF, a partir do arquivo-urna do TSE.

A cada ciclo:
  1. pede o índice de cada UF com ETag: se não mudou (304), pula a UF;
  2. para as seções totalizadas que ainda não estão no estado local, baixa o aux e o bu.dat e faz o parse;
  3. recalcula o agregado por UF (Brasil e exterior) e grava public/data/ao-vivo-{turno}t.json;
  4. com --publicar, faz commit e push só se o agregado mudou (o push dispara o deploy do site).

Uso:
  python scripts/ao_vivo.py --turno 2                  # loop a cada 10 min, sem publicar
  python scripts/ao_vivo.py --turno 2 --publicar       # loop, publica no git quando mudar
  python scripts/ao_vivo.py --turno 2 --uma-vez        # um ciclo
"""
import argparse
import json
import os
import subprocess
import sys
import time
import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor

import requests
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parser_bu import parse_bu  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
BASE = 'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna'
UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr',
       'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to', 'zz']
PLEITO = {1: '3220', 2: '3221'}
ELEICAO = {1: 6257, 2: 6258}
WORKERS = int(os.environ.get('AO_VIVO_WORKERS', '16'))


def pl6(turno):
    """Código do pleito com 6 dígitos, como aparece nos nomes de arquivo do TSE (p003221)."""
    return f'{int(PLEITO[turno]):06d}'
BRANCH_DADOS = 'dados-ao-vivo'
ESTADO_DIR = os.path.join(RAIZ, 'ao_vivo_estado')   # fora do git: guarda o que já foi baixado


_local = threading.local()


def _sessao():
    if not hasattr(_local, 's'):
        _local.s = requests.Session()
        _local.s.headers.update({'User-Agent': 'raiox2026-ao-vivo/1.0'})
    return _local.s


def pede(url, headers=None, tentativas=3):
    """Devolve (status, corpo, headers). 304 quando o ETag não mudou. 404 vira status 404."""
    ultimo = None
    for i in range(tentativas):
        try:
            r = _sessao().get(url, headers=headers or {}, timeout=60)
            if r.status_code == 304:
                return 304, None, dict(r.headers)
            if r.status_code == 404:
                return 404, None, {}
            if r.status_code == 200:
                return 200, r.content, dict(r.headers)
            ultimo = f'HTTP {r.status_code}'
        except requests.RequestException as e:
            ultimo = e
        time.sleep(2 * (i + 1))
    raise RuntimeError(f'falha em {url}: {ultimo}')


def carrega_estado(turno):
    os.makedirs(ESTADO_DIR, exist_ok=True)
    arq = os.path.join(ESTADO_DIR, f'estado_{turno}t.json')
    # versão 2: candidatos como inteiros. Estado de versão antiga é descartado e refeito.
    if os.path.exists(arq):
        est = json.load(open(arq, encoding='utf-8'))
        if est.get('versao') == 2:
            return arq, est
    return arq, {'etags': {}, 'secoes': {}, 'versao': 2}


def salva_estado(arq, estado):
    with open(arq, 'w', encoding='utf-8') as f:
        json.dump(estado, f, ensure_ascii=False)


def totalizadas(uf, turno, corpo):
    """Chaves (mun, zona, secao) das seções totalizadas e não agregadas, e o total de seções."""
    cs = json.loads(corpo.decode('utf-8', errors='replace'))
    tot = 0; feitas = []
    for a in cs.get('abr', []):
        for m in a.get('mu', []):
            for z in m.get('zon', []):
                for s in z.get('sec', []):
                    if s.get('nsp'):
                        continue
                    tot += 1
                    if s.get('ha'):
                        feitas.append(f"{uf}|{m['cd'].zfill(5)}|{z['cd'].zfill(4)}|{s['ns'].zfill(4)}")
    return tot, feitas


def coleta_secao(chave, turno, pasta_tmp):
    uf, mun, zona, secao = chave.split('|')
    base = f'{BASE}/{PLEITO[turno]}/dados/{uf}/{mun}/{zona}/{secao}'
    st, corpo, _ = pede(f'{base}/p{pl6(turno)}-{uf}-m{mun}-z{zona}-s{secao}-aux.json')
    if st != 200:
        return chave, None, 'sem aux'
    aux = json.loads(corpo.decode('utf-8', errors='replace'))
    if not aux.get('hashes'):
        return chave, None, 'sem hashes'
    h = aux['hashes'][0]
    nome = next((a['nm'] for a in h.get('arq', []) if a.get('tp') == 'bu'), None)
    if not nome:
        return chave, None, 'sem bu'
    st, bu, _ = pede(f"{base}/{h['hash']}/{nome}")
    if st != 200:
        return chave, None, f'bu status {st}'
    caminho = os.path.join(pasta_tmp, f"{uf}_{mun}_{zona}_{secao}.dat")
    open(caminho, 'wb').write(bu)
    try:
        return chave, parse_bu(caminho, ELEICAO[turno]), None
    finally:
        os.remove(caminho)


def registro(p):
    return {'aptos': p['aptos'], 'comparecimento': p['comparecimento'], 'brancos': p['brancos'],
            'nulos': p['nulos'], 'lula': p['votos_nominais'].get(13, 0),
            'flavio': p['votos_nominais'].get(22, 0),
            'outros': sum(v for k, v in p['votos_nominais'].items() if k not in (13, 22)),
            'emissao': p.get('emissao_bu')}


def agrega(linhas):
    a = {'secoes_total': 0, 'secoes_totalizadas': 0, 'aptos': 0, 'comparecimento': 0, 'brancos': 0,
         'nulos': 0, 'lula': 0, 'flavio': 0, 'outros': 0}
    for k, v in linhas:
        for c in ('aptos', 'comparecimento', 'brancos', 'nulos', 'lula', 'flavio', 'outros'):
            a[c] += v.get(c, 0)
    return a


def fecha(a):
    A = a['aptos']; C = a['comparecimento']; tot = a['lula'] + a['flavio']
    out = dict(a)
    out['pct_totalizado'] = round(a['secoes_totalizadas'] / a['secoes_total'] * 100, 2) if a['secoes_total'] else None
    out['abstencao_pct'] = round((A - C) / A * 100, 2) if A else None
    out['lula_share'] = round(a['lula'] / tot * 100, 2) if tot else None
    out['flavio_share'] = round(a['flavio'] / tot * 100, 2) if tot else None
    return out


def _busca_indice(uf, turno, etag):
    url = f'{BASE}/{PLEITO[turno]}/config/{uf}/{uf}-p{pl6(turno)}-cs.json'
    # sempre lê o índice: só baixa seções que ainda não estão no estado (o ETag pulava UFs e deixava lacunas)
    cab = {}
    try:
        return uf, pede(url, cab)
    except RuntimeError as e:
        return uf, ('erro', str(e), None)


def ciclo(turno, estado, pasta_saida, limite=0):
    tmp = os.path.join(ESTADO_DIR, 'tmp'); os.makedirs(tmp, exist_ok=True)
    novas = []
    # os 28 índices vêm em paralelo; só processa as UFs que mudaram (ETag)
    with ThreadPoolExecutor(max_workers=12) as ex:
        resultados = list(ex.map(lambda u: _busca_indice(u, turno, estado['etags'].get(u)), UFS))
    for uf, r in resultados:
        if r[0] == 'erro':
            print(f'  aviso {uf}: {r[1]}', flush=True)
            continue
        st, corpo, h = r
        if st != 200:
            continue
        if h.get('ETag'):
            estado['etags'][uf] = h['ETag']
        tot, feitas = totalizadas(uf, turno, corpo)
        estado.setdefault('totais', {})[uf.upper()] = tot
        for chave in feitas:
            if chave not in estado['secoes']:
                novas.append(chave)
    if limite:
        novas = novas[:limite]
    print(f'[{datetime.now():%H:%M:%S}] seções novas para baixar: {len(novas)}', flush=True)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for chave, p, motivo in ex.map(lambda c: _seguro(c, turno, tmp), novas):
            if p is None:
                if motivo not in ('sem aux',):
                    print(f'  {chave}: {motivo}', flush=True)
                continue
            estado['secoes'][chave] = registro(p)
    salva_estado(os.path.join(ESTADO_DIR, f'estado_{turno}t.json'), estado)
    return monta_saida(turno, estado)


def _seguro(chave, turno, tmp):
    try:
        return coleta_secao(chave, turno, tmp)
    except Exception as e:
        return chave, None, str(e)


def monta_saida(turno, estado):
    por_uf = {}
    for chave, reg in estado['secoes'].items():
        uf = chave.split('|')[0].upper()
        por_uf.setdefault(uf, []).append((chave, reg))
    ufs = {}
    for uf, lst in por_uf.items():
        a = agrega(lst)
        a['secoes_total'] = estado.get('totais', {}).get(uf, 0)
        a['secoes_totalizadas'] = len(lst)
        ufs[uf] = fecha(a)
    for uf, tot in estado.get('totais', {}).items():
        if uf not in ufs:
            ufs[uf] = fecha({'secoes_total': tot, 'secoes_totalizadas': 0, 'aptos': 0, 'comparecimento': 0,
                             'brancos': 0, 'nulos': 0, 'lula': 0, 'flavio': 0, 'outros': 0})
    brasil = {'secoes_total': 0, 'secoes_totalizadas': 0, 'aptos': 0, 'comparecimento': 0, 'brancos': 0,
              'nulos': 0, 'lula': 0, 'flavio': 0, 'outros': 0}
    exterior = dict(brasil)
    for uf, a in ufs.items():
        alvo = exterior if uf == 'ZZ' else brasil
        for c in ('secoes_total', 'secoes_totalizadas', 'aptos', 'comparecimento', 'brancos', 'nulos', 'lula', 'flavio', 'outros'):
            alvo[c] += a.get(c, 0)
    return {'ano': 2026, 'turno': turno, 'fonte': 'arquivo-urna do TSE (boletins de urna processados)',
            'brasil': fecha(brasil), 'exterior': fecha(exterior), 'ufs': ufs}


def digest(saida):
    return hashlib.sha256(json.dumps(saida, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()


def grava(caminho, saida, estado):
    """Grava o agregado e informa se ele mudou desde a última gravação (guardada no estado)."""
    dg = digest(saida)
    mudou = dg != estado.get('digest_gravado')
    saida = {'atualizado_em': datetime.now(timezone.utc).isoformat(timespec='seconds'), **saida}
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
    if mudou:
        estado['digest_gravado'] = dg
    return mudou


def publica(caminho, turno):
    """Publica o agregado numa branch própria (dados-ao-vivo), sem passar pelo deploy do site.

    A página lê o arquivo pelo raw.githubusercontent.com, então cada publicação aparece em segundos.
    A branch é reescrita a cada publicação: guarda só o estado mais recente, não o histórico.
    """
    msg = f'Atualiza apuração ao vivo 2026 {turno}º turno'
    subprocess.run(['git', 'add', '-f', caminho], cwd=RAIZ, check=True)
    subprocess.run(['git', '-c', 'user.name=ao-vivo-bot', '-c', 'user.email=contato@melhorpreco.lat',
                    'commit', '-q', '-m', msg], cwd=RAIZ, check=True)
    subprocess.run(['git', 'push', '-q', '-f', 'origin', f'HEAD:refs/heads/{BRANCH_DADOS}'], cwd=RAIZ, check=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--turno', type=int, choices=[1, 2], default=2)
    p.add_argument('--intervalo', type=int, default=600, help='segundos entre ciclos (padrão 600)')
    p.add_argument('--publicar', action='store_true', help='commit e push quando o agregado mudar')
    p.add_argument('--publicar-intervalo', type=int, default=600,
                   help='no mínimo estes segundos entre publicações (evita fila de deploys)')
    p.add_argument('--uma-vez', action='store_true')
    p.add_argument('--limite', type=int, default=0, help='máximo de seções novas por ciclo (teste)')
    p.add_argument('--dura', type=int, default=0, help='para depois de N segundos (0 = não para)')
    p.add_argument('--ate', default='', help='para no horário UTC ISO, ex.: 2026-10-26T03:00:00Z')
    a = p.parse_args()
    caminho = os.path.join(RAIZ, 'public', 'data', f'ao-vivo-{a.turno}t.json')
    arq, estado = carrega_estado(a.turno)
    inicio = time.time()
    fim_ate = datetime.fromisoformat(a.ate.replace('Z', '+00:00')).timestamp() if a.ate else None
    if fim_ate and time.time() >= fim_ate:
        print('horário limite já passou; nada a fazer', flush=True)
        return
    flag = os.path.join(ESTADO_DIR, 'publicou.flag')
    if os.path.exists(flag):
        os.remove(flag)
    while True:
        saida = ciclo(a.turno, estado, os.path.dirname(caminho), a.limite)
        mudou = grava(caminho, saida, estado)
        print(f"[{datetime.now():%H:%M:%S}] {saida['brasil']['secoes_totalizadas']} seções BR, "
              f"{saida['exterior']['secoes_totalizadas']} exterior · {'mudou' if mudou else 'sem mudança'}", flush=True)
        agora = time.time()
        ultima = estado.get('ultima_publicacao', 0)
        pendente = estado.get('digest_gravado') != estado.get('digest_publicado')
        if pendente and a.publicar and agora - ultima >= a.publicar_intervalo:
            publica(caminho, a.turno)
            estado['digest_publicado'] = estado.get('digest_gravado')
            estado['ultima_publicacao'] = agora
            print('  publicado', flush=True)
        salva_estado(arq, estado)
        if a.uma_vez:
            break
        if fim_ate and agora >= fim_ate:
            print('  horário limite atingido', flush=True)
            break
        if a.dura and agora - inicio >= a.dura:
            break
        espera = a.intervalo
        if fim_ate:
            espera = min(espera, max(0, fim_ate - agora))
        time.sleep(espera)


if __name__ == '__main__':
    main()
