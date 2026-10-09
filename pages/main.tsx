import React from 'react';
import {zones} from './zones';
import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,init)=>{if(typeof input==='string'&&input.startsWith('/api/zones?'))return zones(input,nativeFetch,import.meta.env.BASE_URL,init?.signal as AbortSignal).catch(e=>Response.json({error:e.message},{status:500}));if(typeof input==='string'&&(input.startsWith('/data/')||input.startsWith('/maps/')))input=import.meta.env.BASE_URL+input.slice(1);return nativeFetch(input,init)};
createRoot(document.getElementById('root')!).render(<Home/>);
