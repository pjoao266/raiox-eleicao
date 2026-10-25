'use client';
import {useEffect,useState} from 'react';
import {Alert,Badge,Group,Paper,Table,Text,Title} from '@mantine/core';
import {UFS} from '@/lib/tse';

// Arquivo publicado pelo coletor numa branch própria: não passa pelo deploy do site.
const URL_DADOS = 'https://raw.githubusercontent.com/pjoao266/raiox-eleicao/dados-ao-vivo/public/data/ao-vivo-2t.json';
const INTERVALO_MS = 120000;

type Agregado = {
  secoes_total: number; secoes_totalizadas: number; pct_totalizado: number | null;
  abstencao_pct: number | null; lula_share: number | null; flavio_share: number | null;
};
type Dados = {atualizado_em: string; brasil: Agregado; exterior: Agregado; ufs: Record<string, Agregado>};

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-BR', {maximumFractionDigits: 1})}%`);
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit', second: '2-digit'});

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

  const linhas = Object.entries(dados.ufs)
    .filter(([uf]) => uf !== 'ZZ')
    .sort(([a], [b]) => (UFS[a.toLowerCase()]?.name ?? a).localeCompare(UFS[b.toLowerCase()]?.name ?? b, 'pt-BR'));

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" wrap="wrap" gap="xs" mb="sm">
        <div>
          <Title order={4}>Apuração ao vivo · 2º turno</Title>
          <Text size="xs" c="dimmed">
            Atualizado às {hora(dados.atualizado_em)} · consulta a cada 2 min
            {buscadoEm ? ` · última consulta às ${hora(new Date(buscadoEm).toISOString())}` : ''}
          </Text>
        </div>
        {erro && <Badge color="yellow" variant="light">{erro}</Badge>}
      </Group>

      <Group grow mb="md" wrap="wrap">
        {[{nome: 'Brasil', a: dados.brasil}, {nome: 'Exterior', a: dados.exterior}].map(({nome, a}) => (
          <Paper key={nome} withBorder p="sm" radius="md" style={{background: 'rgba(15, 23, 42, 0.7)'}}>
            <Text size="sm" fw={600}>{nome}</Text>
            <Text size="xs" c="dimmed">{a.secoes_totalizadas.toLocaleString('pt-BR')} de {a.secoes_total.toLocaleString('pt-BR')} seções ({pct(a.pct_totalizado)})</Text>
            <Text size="sm" mt={4}>Lula {pct(a.lula_share)} · Flávio {pct(a.flavio_share)} <Text span c="dimmed" size="xs">(entre os dois)</Text></Text>
            <Text size="xs" c="dimmed">Abstenção {pct(a.abstencao_pct)}</Text>
          </Paper>
        ))}
      </Group>

      <Table.ScrollContainer minWidth={320}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Estado</Table.Th>
              <Table.Th>Seções apuradas</Table.Th>
              <Table.Th>Lula</Table.Th>
              <Table.Th>Flávio</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {linhas.map(([uf, a]) => (
              <Table.Tr key={uf}>
                <Table.Td>{UFS[uf.toLowerCase()]?.name ?? uf}</Table.Td>
                <Table.Td>{pct(a.pct_totalizado)} <Text span size="xs" c="dimmed">({a.secoes_totalizadas}/{a.secoes_total})</Text></Table.Td>
                <Table.Td>{pct(a.lula_share)}</Table.Td>
                <Table.Td>{pct(a.flavio_share)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}
