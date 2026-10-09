export const integer=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);
export const percent=(n:number)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+'%';
export const titleCase=(s:string)=>s.toLocaleLowerCase('pt-BR').replace(/(^|\s)\p{L}/gu,c=>c.toLocaleUpperCase('pt-BR'));
