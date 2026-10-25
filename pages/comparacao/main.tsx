import React from 'react';
import {createRoot} from 'react-dom/client';
import {ComparacaoTurnos} from '../../components/comparacao-turnos';
import '../../app/globals.css';
const nativeFetch = window.fetch.bind(window);
// os dados ficam em public/data; no build estático o caminho ganha o BASE_URL do site
window.fetch = (input, init) => {
  if (typeof input === 'string' && (input.startsWith('/data/') || input.startsWith('/maps/'))) input = import.meta.env.BASE_URL + input.slice(1);
  return nativeFetch(input, init);
};
createRoot(document.getElementById('root')!).render(
  <main className="mx-auto min-h-screen max-w-3xl bg-[#0b1421] p-4 text-slate-100 sm:p-8">
    <header className="mb-6">
      <a href={import.meta.env.BASE_URL} className="text-xs text-blue-300">← Raio-X Eleitoral 2026</a>
      <h1 className="mt-2 text-2xl font-semibold">Diferença entre os turnos</h1>
      <p className="mt-1 text-sm text-slate-400">Mesmas seções nos dois turnos. Compare votos, abstenção e quem ganhou e perdeu eleitores.</p>
    </header>
    <ComparacaoTurnos />
  </main>
);
