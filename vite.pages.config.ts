import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({root:'.',base:process.env.PAGES_BASE||'/raiox-eleicao/',plugins:[react()],resolve:{alias:{'@':resolve('.')}},build:{outDir:'dist-pages',rollupOptions:{input:resolve('pages/index.html')}},publicDir:'public'});
