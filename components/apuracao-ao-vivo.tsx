'use client';
import {useEffect,useState} from 'react';
import {Alert,Badge,Group,Paper,SimpleGrid,Text,Title} from '@mantine/core';

// Worker que lê o arquivo do R2 (sem cache): o dado chega em até 2 minutos da coleta.
const URL_DADOS = 'https://raiox-ao-vivo.pjoao266cefetmgdiv.workers.dev/ao-vivo-2t.json';
const INTERVALO_MS = 120000;

type Turno = {abstencao_pct: number | null; lula_share: number | null; flavio_share: number | null};
type Grupo = {secoes_pareadas: number; turno1: Turno; turno2: Turno};
type Ponto = {n: number; emissao: string | null; lula2: number | null; flavio2: number | null; lula1: number | null; flavio1: number | null};
type Agregado = {secoes_total: number; secoes_totalizadas: number};
type Dados = {
  atualizado_em: string;
  brasil: Agregado; exterior: Agregado;
  comparacao?: {brasil: Grupo; exterior: Grupo};
  serie?: Ponto[];
};

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-BR', {maximumFractionDigits: 1})}%`);
const pp = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || a === undefined || b === null || b === undefined ? '—' : `${b - a > 0 ? '+' : ''}${(b - a).toLocaleString('pt-BR', {maximumFractionDigits: 1})} p.p.`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

// Gráfico de linhas: % acumulado por seção apurada. 2º turno contínuo; 1º turno nas mesmas seções, tracejado.
function GraficoSerie({serie}: {serie: Ponto[]}) {
  const W = 640, H = 300, pad = {l: 40, r: 12, t: 12, b: 28};
  const n = serie.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const linha = (campo: 'lula1' | 'lula2' | 'flavio1' | 'flavio2') => serie
    .map((p, i) => (p[campo] === null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[campo] as number).toFixed(1)}`))
    .filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico: percentual de Lula e Flávio por seção apurada, 1º e 2º turno" className="w-full">
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 50 ? '#94a3b8' : '#1e293b'} strokeDasharray={v === 50 ? '4 4' : undefined} />
          <text x={pad.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#94a3b8">{v}%</text>
        </g>
      ))}
      <path d={linha('lula1')} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="6 4" opacity="0.7" />
      <path d={linha('flavio1')} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="6 4" opacity="0.7" />
      <path d={linha('lula2')} fill="none" stroke="#dc2626" strokeWidth="2.5" />
      <path d={linha('flavio2')} fill="none" stroke="#2563eb" strokeWidth="2.5" />
      <text x={pad.l} y={H - 8} fontSize="11" fill="#94a3b8">seções apuradas (na ordem de chegada) →</text>
      {n > 0 && <text x={W - pad.r} y={H - 8} fontSize="11" textAnchor="end" fill="#94a3b8">{serie[n - 1].n} seções</text>}
    </svg>
  );
}

export function ApuracaoAoVivo() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [buscadoEm, setBuscadoEm] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    async function busca() {
      try {
        // o parâmetro de tempo evita o cache: cada busca pede o arquivo mais novo
        const r = await fetch(`${URL_DADOS}?t=${Date.now()}`, {cache: 'no-store'});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j: Dados = await r.json();
        if (ativo) { setDados(j); setErro(''); setBuscadoEm(Date.now()); }
      } catch (e) {
        if (ativo) setErro('Não foi possível atualizar agora. Tentando de novo em 2 minutos.');
      }
    }
    busca();
    const id = setInterval(busca, INTERVALO_MS);
    return () => { ativo = false; clearInterval(id); };
  }, []);

  if (!dados) return erro ? <Alert color="yellow">{erro}</Alert> : <Text size="sm" c="dimmed">Carregando apuração ao vivo…</Text>;

  const cmp = dados.comparacao;
  const grupos: {nome: string; g: Grupo}[] = cmp
    ? [{nome: 'Brasil', g: cmp.brasil}, {nome: 'Exterior', g: cmp.exterior}].filter(x => x.g.secoes_pareadas > 0)
    : [];

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" wrap="wrap" gap="xs" mb="sm">
        <div>
          <Title order={4}>Apuração ao vivo · 2º turno × 1º turno</Title>
          <Text size="xs" c="dimmed">
            Atualizado às {hora(dados.atualizado_em)} · consulta a cada 2 min
            {buscadoEm ? ` · última consulta às ${hora(new Date(buscadoEm).toISOString())}` : ''}
          </Text>
        </div>
        {erro && <Badge color="yellow" variant="light">{erro}</Badge>}
      </Group>

      <Text size="sm" mb="sm">
        Brasil: <b>{dados.brasil.secoes_totalizadas.toLocaleString('pt-BR')}</b> de {dados.brasil.secoes_total.toLocaleString('pt-BR')} seções apuradas ·
        Exterior: <b>{dados.exterior.secoes_totalizadas.toLocaleString('pt-BR')}</b> de {dados.exterior.secoes_total.toLocaleString('pt-BR')}
      </Text>

      {grupos.length === 0 && (
        <Alert color="yellow">Ainda não há seções apuradas nos dois turnos.</Alert>
      )}

      {grupos.map(({nome, g}) => (
        <Paper key={nome} withBorder p="sm" radius="md" mb="sm" style={{background: 'rgba(15, 23, 42, 0.7)'}}>
          <Text size="sm" fw={600} mb={6}>{nome} · mesmas {g.secoes_pareadas.toLocaleString('pt-BR')} seções nos dois turnos</Text>
          <SimpleGrid cols={{base: 1, sm: 3}}>
            {[
              {titulo: 'Lula (entre os dois)', cor: '#dc2626', a: g.turno1.lula_share, b: g.turno2.lula_share},
              {titulo: 'Flávio (entre os dois)', cor: '#2563eb', a: g.turno1.flavio_share, b: g.turno2.flavio_share},
              {titulo: 'Abstenção (% dos aptos)', cor: '#64748b', a: g.turno1.abstencao_pct, b: g.turno2.abstencao_pct},
            ].map(c => (
              <Paper key={c.titulo} withBorder p="sm" radius="md" style={{borderLeft: `4px solid ${c.cor}`}}>
                <Text size="xs" c="dimmed">{c.titulo}</Text>
                <Text size="sm">1º turno {pct(c.a)} → <b>2º turno {pct(c.b)}</b></Text>
                <Text size="sm" fw={600}>{pp(c.a, c.b)}</Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Paper>
      ))}

      {dados.serie && dados.serie.length > 1 && (
        <Paper withBorder p="sm" radius="md">
          <Text size="sm" fw={600} mb={4}>Como a porcentagem evoluiu (mesmas seções)</Text>
          <Group gap="md" mb={4}>
            <Text size="xs"><span style={{color: '#dc2626'}}>━━</span> Lula 2º turno · <span style={{color: '#dc2626'}}>╌╌</span> Lula 1º turno</Text>
            <Text size="xs"><span style={{color: '#2563eb'}}>━━</span> Flávio 2º turno · <span style={{color: '#2563eb'}}>╌╌</span> Flávio 1º turno</Text>
          </Group>
          <GraficoSerie serie={dados.serie} />
        </Paper>
      )}
    </Paper>
  );
}
