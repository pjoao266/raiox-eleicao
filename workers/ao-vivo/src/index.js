// Serve o arquivo da apuração ao vivo guardado no R2, sem cache, com CORS liberado para o site.
const ARQUIVOS = new Set(['ao-vivo-1t.json', 'ao-vivo-2t.json']);

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('método não permitido', {status: 405});
    }
    const nome = new URL(request.url).pathname.replace(/^\//, '');
    if (!ARQUIVOS.has(nome)) {
      return new Response('não encontrado', {status: 404});
    }
    const objeto = await env.DADOS.get(nome);
    if (!objeto) {
      return new Response('ainda não publicado', {status: 404});
    }
    return new Response(objeto.body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
