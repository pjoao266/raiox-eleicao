'use client';
import {useEffect,useMemo,useState} from 'react';
import {MantineProvider,Alert,Badge,Group,Paper,Select,SegmentedControl,SimpleGrid,Stack,Table,Text,Title} from '@mantine/core';
import '@mantine/core/styles.css';
import {ComparacaoMapa,type UfResultado} from '@/components/comparacao-mapa';
import {UFS} from '@/lib/tse';
import {UFS} from '@/lib/tse';

type Metricas = {
  secoes: number; aptos: number; comparecimento: number; abstencao_pct: number; comparecimento_pct: number;
  lula_votos: number; flavio_votos: number; outros_votos: number; brancos: number; nulos: number;
  lula_pct_aptos: number; flavio_pct_aptos: number; outros_pct_aptos: number;
};
type Decomposicao = {delta_pp_total: number; efeito_troca_pp: number; efeito_comparecimento_pp: number} | null;
type Grupo = {turno1: Metricas; turno2: Metricas; delta_abstencao_pp: number; lula: Decomposicao; flavio: Decomposicao; outros: Decomposicao};
type Ano = {status: string; descricao: string; secoes_pareadas: number; candidatos: {lula: string; outro: string}; grupos: Record<string, Grupo>};
type Dados = {gerado_em: string; anos: Record<string, Ano>};

const CHAVE_BR = 'BR|Brasil (sem exterior)';
const CHAVE_EXT = 'EXT|Exterior (total)';

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-BR', {maximumFractionDigits: 2})}%`);
const pp = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', {maximumFractionDigits: 2})} p.p.`);
const limpa = (s: string) => s.replace(/�/g, '');

// Converte as métricas de um turno no formato que o mapa espera.
function paraMapa(m: Metricas): UfResultado {
  const tot = m.lula_votos + m.flavio_votos;
  return {
    secoes: m.secoes, aptos: m.aptos, comparecimento: m.comparecimento, abstencao_pct: m.abstencao_pct,
    lula_pct: (m.lula_votos / m.comparecimento) * 100, flavio_pct: (m.flavio_votos / m.comparecimento) * 100,
    lula_share: tot ? (m.lula_votos / tot) * 100 : null,
  };
}

function ComparacaoTurnosConteudo() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [ano, setAno] = useState('2022');
  const [regiao, setRegiao] = useState<'br' | 'ext'>('br');
  const [uf, setUf] = useState<string | null>(null);
  const [cidade, setCidade] = useState<string | null>(null);

  useEffect(() => {
    const a = new AbortController();
    fetch('/data/comparacao-turnos.json', {signal: a.signal})
      .then(r => { if (!r.ok) throw new Error('Não foi possível abrir a comparação.'); return r.json(); })
      .then(setDados)
      .catch(e => { if (!a.signal.aborted) setErro(e.message); });
    return () => a.abort();
  }, []);

  const info = dados?.anos[ano];
  const exteriorCidades = useMemo(() => {
    if (!info) return [];
    return Object.keys(info.grupos)
      .filter(k => k.startsWith('ZZ|'))
      .map(k => ({value: k, label: limpa(k.slice(3))}))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [info]);

  // grupo selecionado na tabela
  const chave = regiao === 'ext' ? (cidade ?? CHAVE_EXT) : uf ? `UF|${uf}` : CHAVE_BR;
  const grupo = info?.grupos[chave];

  // resultados por estado para o mapa, no 1º e no 2º turno
  const porEstado = useMemo(() => {
    const t1: Record<string, UfResultado> = {}, t2: Record<string, UfResultado> = {};
    if (!info) return {t1, t2};
    for (const [k, g] of Object.entries(info.grupos)) {
      if (!k.startsWith('UF|')) continue;
      const sigla = k.slice(3);
      t1[sigla] = paraMapa(g.turno1);
      t2[sigla] = paraMapa(g.turno2);
    }
    return {t1, t2};
  }, [info]);

  const [turnoMapa, setTurnoMapa] = useState<'t1' | 't2'>('t2');
  const estadosDisponiveis = Object.keys(porEstado[turnoMapa]).length > 0;

  if (erro) return <Alert color="red">{erro}</Alert>;
  if (!dados || !info) return <Text size="sm" c="dimmed">Carregando comparação…</Text>;

  const nomeLula = info.candidatos.lula;
  const nomeOutro = info.candidatos.outro;

  return (
    <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Title order={2} size="h3">Comparar turnos</Title>
            <Text size="sm" c="dimmed">Mesmas seções, 1º × 2º turno. {info.descricao}</Text>
          </div>
          <Badge color={info.status === 'completo' ? 'teal' : 'yellow'} variant="light">
            {info.status === 'completo' ? 'Completo' : 'Parcial'} · {info.secoes_pareadas.toLocaleString('pt-BR')} seções
          </Badge>
        </Group>

        <Group grow align="flex-end" wrap="wrap">
          <Select label="Ano" data={['2022', '2026']} value={ano}
            onChange={v => { if (v) { setAno(v); setUf(null); setCidade(null); } }} allowDeselect={false} />
          <Stack gap={4}>
            <Text size="sm" fw={500}>Região</Text>
            <SegmentedControl value={regiao} onChange={v => { setRegiao(v as 'br' | 'ext'); setUf(null); setCidade(null); }}
              data={[{label: 'Brasil (estados)', value: 'br'}, {label: 'Exterior', value: 'ext'}]} />
          </Stack>
          {regiao === 'ext' && (
            <Select label="País ou cidade no exterior" placeholder="Exterior inteiro" data={exteriorCidades}
              value={cidade} onChange={setCidade} searchable clearable />
          )}
          <Stack gap={4}>
            <Text size="sm" fw={500}>Turno no mapa</Text>
            <SegmentedControl value={turnoMapa} onChange={v => setTurnoMapa(v as 't1' | 't2')}
              data={[{label: '1º turno', value: 't1'}, {label: '2º turno', value: 't2'}]} />
          </Stack>
        </Group>

        {grupo && (
          <SimpleGrid cols={{base: 1, sm: 3}}>
            {[
              {titulo: nomeLula, cor: '#dc2626', valor: grupo.turno2.lula_pct_aptos, antes: grupo.turno1.lula_pct_aptos, delta: grupo.lula?.delta_pp_total, bom: true},
              {titulo: nomeOutro, cor: '#2563eb', valor: grupo.turno2.flavio_pct_aptos, antes: grupo.turno1.flavio_pct_aptos, delta: grupo.flavio?.delta_pp_total, bom: true},
              {titulo: 'Abstenção', cor: '#64748b', valor: grupo.turno2.abstencao_pct, antes: grupo.turno1.abstencao_pct, delta: grupo.delta_abstencao_pp, bom: false},
            ].map(c => (
              <Paper key={c.titulo} withBorder p="md" radius="md" style={{borderLeft: `4px solid ${c.cor}`, background: 'rgba(15, 23, 42, 0.7)'}}>
                <Text size="sm" fw={600}>{c.titulo}</Text>
                <Text size="xs" c="dimmed">1º turno {pct(c.antes)} → 2º turno</Text>
                <Text size="xl" fw={700}>{pct(c.valor)}</Text>
                <Badge color={c.delta === null || c.delta === undefined || c.delta === 0 ? 'gray' : (c.delta > 0) === c.bom ? 'teal' : 'red'} variant="light">
                  {pp(c.delta)}
                </Badge>
              </Paper>
            ))}
          </SimpleGrid>
        )}

        {regiao === 'br' && (
          <Paper withBorder p="md" radius="md">
            {estadosDisponiveis
              ? <ComparacaoMapa resultados={porEstado[turnoMapa]} selecionado={uf} onSelect={setUf} />
              : <Alert color="yellow">Os estados ainda não têm 2º turno publicado para {ano}.</Alert>}
            <Text size="xs" c="dimmed" mt="xs">Clique em um estado para filtrar a tabela. Clique de novo para voltar ao Brasil.</Text>
            <Group gap="md" mt="xs" align="center">
              <Group gap={6}><span style={{width: 14, height: 14, borderRadius: 3, background: '#dc2626', display: 'inline-block'}} /><Text size="xs">Lula venceu</Text></Group>
              <Group gap={6}><span style={{width: 14, height: 14, borderRadius: 3, background: '#2563eb', display: 'inline-block'}} /><Text size="xs">Flávio venceu</Text></Group>
              <Text size="xs" c="dimmed">Cor mais forte = vencedor com mais porcentagem</Text>
            </Group>
          </Paper>
        )}

        {!grupo ? (
          <Alert color="yellow">Sem dados de 2º turno para esta seleção em {ano}.</Alert>
        ) : (
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="sm">
              {chave === CHAVE_BR ? 'Brasil (sem exterior)' : chave === CHAVE_EXT ? 'Exterior (total)' : chave.startsWith('UF|') ? (UFS[chave.slice(3).toLowerCase()]?.name ?? chave.slice(3)) : limpa(chave.replace(/^ZZ\|/, ''))}
            </Title>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Indicador (% dos aptos)</Table.Th>
                  <Table.Th>1º turno</Table.Th>
                  <Table.Th>2º turno</Table.Th>
                  <Table.Th>Variação</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>Abstenção</Table.Td>
                  <Table.Td>{pct(grupo.turno1.abstencao_pct)}</Table.Td>
                  <Table.Td>{pct(grupo.turno2.abstencao_pct)}</Table.Td>
                  <Table.Td>{pp(grupo.delta_abstencao_pp)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{nomeLula}</Table.Td>
                  <Table.Td>{pct(grupo.turno1.lula_pct_aptos)}</Table.Td>
                  <Table.Td>{pct(grupo.turno2.lula_pct_aptos)}</Table.Td>
                  <Table.Td>{pp(grupo.lula?.delta_pp_total)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{nomeOutro}</Table.Td>
                  <Table.Td>{pct(grupo.turno1.flavio_pct_aptos)}</Table.Td>
                  <Table.Td>{pct(grupo.turno2.flavio_pct_aptos)}</Table.Td>
                  <Table.Td>{pp(grupo.flavio?.delta_pp_total)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Outros candidatos</Table.Td>
                  <Table.Td>{pct(grupo.turno1.outros_pct_aptos)}</Table.Td>
                  <Table.Td>{pct(grupo.turno2.outros_pct_aptos)}</Table.Td>
                  <Table.Td>{pp(grupo.outros?.delta_pp_total)}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>

            <Text size="sm" fw={600} mt="md">De onde veio a variação de {nomeLula}</Text>
            <Text size="sm" c="dimmed">
              Troca de voto: {pp(grupo.lula?.efeito_troca_pp)} · Comparecimento (abstenção): {pp(grupo.lula?.efeito_comparecimento_pp)}
            </Text>
            <Text size="sm" fw={600} mt="xs">De onde veio a variação de {nomeOutro}</Text>
            <Text size="sm" c="dimmed">
              Troca de voto: {pp(grupo.flavio?.efeito_troca_pp)} · Comparecimento (abstenção): {pp(grupo.flavio?.efeito_comparecimento_pp)}
            </Text>
            <Text size="xs" c="dimmed" mt="sm">
              Valores em pontos percentuais do eleitorado. A troca de voto é a mudança de voto entre quem compareceu nos dois turnos.
            </Text>
          </Paper>
        )}
    </Stack>
  );
}

// O MantineProvider fica por fora, para que também funcione enquanto os dados carregam.
export function ComparacaoTurnos() {
  return (
    <MantineProvider forceColorScheme="dark">
      <ComparacaoTurnosConteudo />
    </MantineProvider>
  );
}
