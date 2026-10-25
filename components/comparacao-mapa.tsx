'use client';
import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {defaultViewport,boundViewport,zoomAt,pinchViewport,type Viewport,type Point} from '@/lib/map-viewport';
import {UFS} from '@/lib/tse';

export type UfResultado = {
  secoes: number; aptos: number; comparecimento: number; abstencao_pct: number;
  lula_pct: number; flavio_pct: number; lula_share: number | null;
};

// Mesma projeção e enquadramento do mapa de territórios do site (viewBox 640x430).
function project(p: number[]) {
  return [p[0], -Math.log(Math.tan(Math.PI / 4 + p[1] * Math.PI / 360)) * 180 / Math.PI];
}

const IBGE_PARA_UF: Record<string, string> = Object.fromEntries(Object.entries(UFS).map(([uf, v]) => [v.id, uf]));

// Cor pelo vencedor entre Lula e Flávio; intensidade cresce conforme a % do vencedor (50% = tom claro, 70% = tom forte).
function corDoEstado(r: UfResultado | undefined) {
  if (!r || r.lula_share === null) return '#172533';
  const lulaGanhou = r.lula_share > 50;
  const pctVencedor = lulaGanhou ? r.lula_share : 100 - r.lula_share;
  const t = Math.min(Math.max((pctVencedor - 50) / 20, 0.15), 1);
  // vermelho para Lula, azul para Flávio (Bolsonaro em 2022)
  const base = lulaGanhou ? [220, 38, 38] : [37, 99, 235];
  const mistura = (c: number) => Math.round(255 * (1 - t) + c * t);
  return `rgb(${mistura(base[0])} ${mistura(base[1])} ${mistura(base[2])})`;
}

export function ComparacaoMapa({resultados, selecionado, onSelect}: {
  resultados: Record<string, UfResultado>;
  selecionado: string | null;           // sigla da UF selecionada, ou null = Brasil
  onSelect: (uf: string | null) => void;
}) {
  const [geo, setGeo] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [hover, setHover] = useState<{nome: string; uf: string; x: number; y: number} | null>(null);
  const [viewport, setViewport] = useState<Viewport>(defaultViewport);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const pointers = useRef(new Map<number, Point>());
  const moved = useRef(false);
  const gesture = useRef<{start: Viewport; point: Point; distance: number} | null>(null);

  useEffect(() => {
    const a = new AbortController();
    fetch('/maps/br.json', {signal: a.signal})
      .then(r => r.json())
      .then(setGeo)
      .catch(e => { if (!a.signal.aborted) setErro('Não foi possível carregar o mapa.'); });
    return () => a.abort();
  }, []);

  function point(e: ReactPointerEvent<SVGSVGElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = Math.min(r.width / 640, r.height / 430);
    return {x: (e.clientX - r.left - (r.width - 640 * scale) / 2) / scale, y: (e.clientY - r.top - (r.height - 430 * scale) / 2) / scale};
  }
  function beginGesture() {
    const ps = [...pointers.current.values()];
    if (ps.length === 2) {
      const [a, b] = ps;
      gesture.current = {start: viewportRef.current, point: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, distance: Math.hypot(a.x - b.x, a.y - b.y)};
      moved.current = true;
    } else if (ps.length === 1) gesture.current = {start: viewportRef.current, point: ps[0], distance: 0};
    else gesture.current = null;
  }
  function pointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!pointers.current.size) moved.current = false;
    pointers.current.set(e.pointerId, point(e));
    beginGesture();
  }
  function pointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    const p = point(e);
    pointers.current.set(e.pointerId, p);
    const ps = [...pointers.current.values()], g = gesture.current;
    if (ps.length === 2) {
      const [a, b] = ps, mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      setViewport(pinchViewport(g.start, g.point, mid, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(g.distance, 1)));
      moved.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setHover(null);
    } else if (ps.length === 1 && g.start.zoom > 1) {
      const dx = p.x - g.point.x, dy = p.y - g.point.y;
      if (Math.hypot(dx, dy) > 4 || moved.current) {
        moved.current = true;
        setViewport(boundViewport({...g.start, x: g.start.x + dx, y: g.start.y + dy}));
        e.currentTarget.setPointerCapture(e.pointerId);
        setHover(null);
      }
    }
  }
  function pointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    beginGesture();
  }

  function clicaEstado(uf: string) {
    if (moved.current) return;
    onSelect(selecionado === uf ? null : uf);
  }

  const formas = useMemo(() => {
    if (!geo?.features) return [];
    const pontos = geo.features.flatMap((f: any) =>
      (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()).flat()
    ).filter((p: number[]) => p[0] > -80 && p[0] < -30);
    const proj = pontos.map(project);
    const xs = proj.map((p: number[]) => p[0]), ys = proj.map((p: number[]) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const largura = Math.max(...xs) - minX, altura = Math.max(...ys) - minY;
    const escala = Math.min(590 / largura, 390 / altura);
    const pt = (p: number[]) => {
      const [x, y] = project(p);
      return [(x - minX) * escala + (640 - largura * escala) / 2, (y - minY) * escala + (430 - altura * escala) / 2];
    };
    return geo.features.map((f: any) => {
      const ibge = String(f.properties.codarea);
      const uf = IBGE_PARA_UF[ibge] ?? '';
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const path = polys.map((poly: any) => poly.map((ring: any) =>
        ring.filter((p: number[]) => p[0] > -80 && p[0] < -30)
          .map((p: number[], i: number) => {const [x, y] = pt(p); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;})
          .join(' ') + 'Z'
      ).join(' ')).join(' ');
      return {uf, path, nome: uf ? UFS[uf].name : ibge};
    });
  }, [geo]);

  if (erro) return <p className="text-sm text-amber-200">{erro}</p>;
  if (!geo) return <p role="status" className="text-sm text-slate-400">Carregando mapa…</p>;

  return (
    <div className="relative">
      <svg
        style={{touchAction: 'none', cursor: viewport.zoom > 1 ? 'grab' : undefined}}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
        viewBox="0 0 640 430" className="max-h-[420px] w-full" role="img"
        aria-label="Mapa do Brasil por estado. Clique em um estado para filtrar."
      >
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {formas.map((d: any) => {
            const r = resultados[d.uf];
            const ativo = selecionado === d.uf;
            return (
              <path key={d.uf || d.nome} d={d.path}
                fill={corDoEstado(r)}
                stroke={ativo ? '#fde047' : '#0b1421'}
                strokeWidth={ativo ? 3 : 1.4}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer transition-colors hover:brightness-125 focus:brightness-125"
                tabIndex={d.uf ? 0 : -1} role={d.uf ? 'button' : undefined}
                aria-label={`${d.nome}${r ? `: Lula ${r.lula_pct.toFixed(1)}%, Flávio ${r.flavio_pct.toFixed(1)}%` : ''}`}
                onMouseEnter={e => {
                  const box = e.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
                  if (box) setHover({nome: d.nome, uf: d.uf, x: Math.max(8, Math.min(e.clientX - box.left + 12, box.width - 220)), y: Math.max(8, Math.min(e.clientY - box.top + 12, box.height - 64))});
                }}
                onMouseMove={e => {
                  const box = e.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
                  if (box) setHover({nome: d.nome, uf: d.uf, x: Math.max(8, Math.min(e.clientX - box.left + 12, box.width - 220)), y: Math.max(8, Math.min(e.clientY - box.top + 12, box.height - 64))});
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => d.uf && clicaEstado(d.uf)}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && d.uf) { e.preventDefault(); moved.current = false; clicaEstado(d.uf); } }}
              >
                <title>{d.nome}</title>
              </path>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div role="tooltip" style={{left: hover.x, top: hover.y}}
          className="pointer-events-none absolute z-10 max-w-[240px] rounded-xl border border-white/10 bg-slate-950/95 px-4 py-2 text-xs shadow-xl">
          <strong>{hover.nome}</strong>
          {resultados[hover.uf] && (
            <div className="mt-1 text-slate-300">
              Lula {resultados[hover.uf].lula_pct.toFixed(1)}% · Flávio {resultados[hover.uf].flavio_pct.toFixed(1)}%<br/>
              Abstenção {resultados[hover.uf].abstencao_pct.toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}
