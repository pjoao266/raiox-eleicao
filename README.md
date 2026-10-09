# Raio-X Eleitoral 2026

Painel de dados oficiais do TSE, primeiro turno de 2026. Seleção de região, cargo e candidato, mapa, rankings municipais e melhores desempenhos.

## GitHub Pages

Em Settings → Pages → Source selecione GitHub Actions. O fluxo `.github/workflows/pages.yml` compila com Vite e publica `dist-pages`. Na primeira execução, coleta a base municipal oficial completa, verifica sua integridade e salva os arquivos estáticos em `public/data`. As execuções seguintes reutilizam a base salva. Nenhum resultado parcial é publicado.

Para compilar localmente: `npm install` e `node scripts/build-pages.mjs`. O caminho padrão é `/raiox-eleicao/`; configure `PAGES_BASE=/` ao publicar com domínio próprio e configure o domínio no Pages.

As zonas são consultadas no TSE ao abrir o município; dependem da disponibilidade e permissão CORS do serviço oficial. A base municipal e os rankings usam arquivos locais.

A base inicial exige a disponibilidade dos endpoints oficiais TSE de 2026. Uma falha interrompe a publicação, sem substituir dados por exemplos.
