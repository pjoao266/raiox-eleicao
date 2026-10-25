"""Junta as comparações 1º x 2º turno (por seção pareada) num único arquivo para a página 'Comparar turnos'.

Uso:
  python scripts/comparacao_turnos.py <comparacao_2022.json> <comparacao_2026.json> <saida.json>

Os dois arquivos são gerados por comparacao_dados.py (a partir dos CSVs de seções).
O status de cada ano diz se o 2º turno já está completo ou parcial.
"""
import json
import sys
from datetime import datetime

entrada_2022, entrada_2026, saida = sys.argv[1], sys.argv[2], sys.argv[3]
c22 = json.load(open(entrada_2022, encoding='utf-8'))['comparacoes'][0]
c26 = json.load(open(entrada_2026, encoding='utf-8'))['comparacoes'][0]

total_secoes_2t_2026 = 1351  # seções do exterior no 2º turno (índice do TSE, 25/10/2026)
anos = {
    '2022': {
        'status': 'completo',
        'descricao': 'Mesmas 472.028 seções nos dois turnos.',
        'secoes_pareadas': c22['secoes_pareadas'],
        'candidatos': {'lula': 'Lula', 'outro': 'Bolsonaro'},
        'grupos': c22['grupos'],
    },
    '2026': {
        'status': 'parcial',
        'descricao': (f"Só o exterior tem 2º turno até agora: {c26['secoes_pareadas']} de "
                      f"{total_secoes_2t_2026} seções totalizadas. Brasil e estados aparecem quando o 2º turno for publicado."),
        'secoes_pareadas': c26['secoes_pareadas'],
        'candidatos': {'lula': 'Lula', 'outro': 'Flávio Bolsonaro'},
        'grupos': c26['grupos'],
    },
}
json.dump({'gerado_em': datetime.now().isoformat(timespec='seconds'), 'anos': anos},
          open(saida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('gravado', saida, 'grupos 2022:', len(anos['2022']['grupos']), 'grupos 2026:', len(anos['2026']['grupos']))
