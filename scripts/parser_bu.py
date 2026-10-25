#!/usr/bin/env python3
"""Parser do BU (bu.dat) do TSE, presidência 1º turno de 2026 (eleição 6257).

Uso:
  python parser_bu.py <arquivo-bu.dat> [eleicao]   (eleicao: 6257 = 1º turno, padrão; 6258 = 2º turno)

Formato (ASN.1/DER, validado em 3 seções de AC e CE contra o boletim web):
  - Envelope: SEQUENCE; o conteúdo útil está num OCTET STRING que começa com 30.
  - Cabeçalho: data/hora do BU (STR), código do pleito, local de votação (STR),
    município/zona/seção, horários de abertura/encerramento, comparecimento (INT após [a0]).
  - Bloco de cargo: SEQUENCE que começa com INT da eleição (6257 = presidente 1º turno).
  - Registros dentro do bloco, cada um um SEQUENCE com:
      [81] tipo: 1 = nominal (candidato), 2 = branco, 3 = nulo
      [82] quantidade de votos
      [a3] (só nominal) número do candidato repetido duas vezes
  - Assinatura: OCTET STRING de 64 bytes no fim do bloco (não usada aqui).
"""
import json
import sys


def _rd(b, i):
    tag = b[i]
    i += 1
    ln = b[i]
    i += 1
    if ln & 0x80:
        n = ln & 0x7F
        ln = int.from_bytes(b[i:i + n], 'big')
        i += n
    return tag, ln, i


def _filhos(b):
    i, out = 0, []
    while i < len(b):
        t, ln, j = _rd(b, i)
        if j + ln > len(b):
            raise ValueError(f'TLV passa do fim do arquivo na posição {i}')
        out.append((t, b[j:j + ln]))
        i = j + ln
    return out


def _inteiro(b):
    return int.from_bytes(b, 'big', signed=True)


def _procura_envelope(b):
    """Acha o OCTET STRING com o conteúdo DER do BU (começa com 0x30). Retorna None se não achar."""
    for t, v in _filhos(b):
        if t == 0x04 and v[:1] == b'\x30':
            return v
        if t & 0x20:
            r = _procura_envelope(v)
            if r is not None:
                return r
    return None


def _envelope(b):
    r = _procura_envelope(b)
    if r is None:
        raise ValueError('conteúdo DER do BU não encontrado')
    return r


def _registros(b, acc):
    for t, v in _filhos(b):
        if t == 0x30:
            ch = _filhos(v)
            tipos = [x for tt, x in ch if tt == 0x81]
            votos = [x for tt, x in ch if tt == 0x82]
            if tipos and votos:
                nums = []
                for tt, x in ch:
                    if tt == 0xA3:
                        nums = [_inteiro(y) for t2, y in _filhos(x) if t2 == 0x02]
                acc.append({'tipo': _inteiro(tipos[0]), 'votos': _inteiro(votos[0]), 'numero': nums[0] if nums else None})
            else:
                _registros(v, acc)
        elif t & 0x20:
            _registros(v, acc)
    return acc


def _bloco_presidencia(root, eleicao=6257):
    achados = []

    def walk(b):
        for t, v in _filhos(b):
            if t == 0x30:
                ch = _filhos(v)
                if ch and ch[0][0] == 0x02 and _inteiro(ch[0][1]) == eleicao:
                    achados.append(v)
                else:
                    walk(v)
            elif t & 0x20:
                walk(v)

    walk(root)
    return achados[0] if achados else None


def _data(s):
    """'20261004T150245' -> '2026-10-04 15:02:45'"""
    return f'{s[0:4]}-{s[4:6]}-{s[6:8]} {s[9:11]}:{s[11:13]}:{s[13:15]}'


def _cabecalho(root):
    """Lê emissão, abertura, encerramento, comparecimento e local do nível superior do BU."""
    ch = _filhos(root)
    emissao = None
    for t, v in ch:
        if t == 0x1B:
            emissao = _data(v.decode('latin-1'))
            break
    abertura = encerramento = None
    comparecimento = None
    for i, (t, v) in enumerate(ch):
        if t == 0xA0:
            datas = [_data(x.decode('latin-1')) for tt, x in _filhos(v) if tt == 0x1B]
            if len(datas) == 2:
                abertura, encerramento = datas
            if i + 1 < len(ch) and ch[i + 1][0] == 0x02:
                comparecimento = _inteiro(ch[i + 1][1])
            break
    local_votacao = None
    for t, v in ch:
        if t == 0x30:
            filhos = _filhos(v)
            # cabeçalho do local: [30](município, zona) seguido de INT (local) e INT (seção)
            if len(filhos) >= 3 and filhos[0][0] == 0x30 and filhos[1][0] == 0x02 and filhos[2][0] == 0x02:
                local_votacao = _inteiro(filhos[1][1])
                break
    return {'emissao': emissao, 'abertura': abertura, 'encerramento': encerramento,
            'comparecimento': comparecimento, 'local_votacao': local_votacao}


def parse_bu(caminho, eleicao=6257):
    dados = open(caminho, 'rb').read()
    env = _envelope(dados)
    filhos = _filhos(env)
    # o conteúdo do envelope é um SEQUENCE único que contém o BU inteiro
    root = filhos[0][1] if len(filhos) == 1 and filhos[0][0] == 0x30 else env
    cab = _cabecalho(root)
    bloco = _bloco_presidencia(root, eleicao)
    if bloco is None:
        return {'erro': 'bloco de presidência 1º turno não encontrado'}
    regs = _registros(bloco, [])
    nominais = {}
    for r in regs:
        if r['tipo'] == 1 and r['numero'] is not None:
            nominais[r['numero']] = nominais.get(r['numero'], 0) + r['votos']
    brancos = sum(r['votos'] for r in regs if r['tipo'] == 2)
    nulos = sum(r['votos'] for r in regs if r['tipo'] == 3)
    soma = sum(nominais.values()) + brancos + nulos
    filhos_bloco = _filhos(bloco)
    aptos = _inteiro(filhos_bloco[1][1]) if len(filhos_bloco) > 1 and filhos_bloco[1][0] == 0x02 else None
    return {
        'eleicao': eleicao,
        'local_votacao': cab['local_votacao'],
        'aptos': aptos,
        'comparecimento': cab['comparecimento'],
        'emissao_bu': cab['emissao'],
        'abertura': cab['abertura'],
        'encerramento': cab['encerramento'],
        'votos_nominais': nominais,
        'brancos': brancos,
        'nulos': nulos,
        'soma_conferida': soma == cab['comparecimento'],
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    eleicao = int(sys.argv[2]) if len(sys.argv) > 2 else 6257   # 6257 = 1º turno, 6258 = 2º turno
    print(json.dumps(parse_bu(sys.argv[1], eleicao), ensure_ascii=False, indent=2))
