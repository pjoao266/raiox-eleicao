export type Bloc='lula'|'bolsonaro'|'third';
export type Metric=Bloc|'blank'|'null'|'otherInvalid'|'nonValid'|'valid'|'turnout'|'abstention';
export type Totals={votes:Record<string,number>,eligible:number,turnout:number,abstention:number,cast:number,valid:number,blank:number,null:number,otherInvalid:number};
export type Territory={id:string,uf:string,name:string,code?:string,ibge?:string,before:Totals|null,after:Totals|null};
export type ComparisonData={version:string,generatedAt:string,years:number[],turn:number,names:Record<string,Record<string,string>>,cities:Territory[],states:Territory[],national:Territory};
export const blocs:Bloc[]=['lula','bolsonaro','third'];
export const comparisonMetrics:Metric[]=['lula','bolsonaro','third','nonValid','turnout'];
export type Transition='lulaToBolsonaro'|'bolsonaroToLula';
export function transitionCities(rows:Territory[],direction:Transition):Territory[]{const [from,to]=direction==='lulaToBolsonaro'?['lula','bolsonaro']:['bolsonaro','lula'];return rows.filter(row=>winner(row.before)===from&&winner(row.after)===to)}
export const labels:Record<Metric,string>={lula:'Lula',bolsonaro:"Bolsonaro's",third:'Terceira via',blank:'Brancos',null:'Nulos',otherInvalid:'Demais não válidos',nonValid:'Branco/Nulos',valid:'Votos válidos',turnout:'Comparecimento',abstention:'Abstenção'};
export function bloc(number:string):Bloc{return number==='13'?'lula':number==='22'?'bolsonaro':'third'}
export function share(t:Totals|null,metric:Metric):number|null{
 if(!t)return null;let count:number,denominator:number;
 if(blocs.includes(metric as Bloc)){count=Object.entries(t.votes).reduce((n,[number,v])=>n+(bloc(number)===metric?v:0),0);denominator=t.valid}
 else if(metric==='turnout'||metric==='abstention'){count=t[metric];denominator=t.eligible}
 else {count=metric==='nonValid'?t.cast-t.valid:t[metric as 'blank'|'null'|'valid'|'otherInvalid'];denominator=t.cast}
 return denominator>0?count/denominator*100:null;
}
export function delta(row:Territory,metric:Metric):number|null{const a=share(row.before,metric),b=share(row.after,metric);return a===null||b===null?null:b-a}
export function winner(t:Totals|null):Bloc|'tie'|null{
 if(!t||!Object.keys(t.votes).length||t.valid<=0)return null;
 const entries=Object.entries(t.votes).sort((a,b)=>b[1]-a[1]);return entries.length>1&&entries[0][1]===entries[1][1]?'tie':bloc(entries[0][0]);
}
export function changed(row:Territory):boolean{const a=winner(row.before),b=winner(row.after);return !!a&&!!b&&a!=='tie'&&b!=='tie'&&a!==b}
export function mapColor(row:Territory|undefined):string{
 if(!row?.before||!row.after)return '#475569';const w=winner(row.after);if(!w||w==='tie')return '#64748b';
 const d=delta(row,w);if(d===null)return '#475569';const hue={lula:0,bolsonaro:142,third:275}[w];
 return `hsl(${hue} 68% ${60-Math.max(-20,Math.min(20,d))*1.3}%)`;
}
export function aggregate(rows:Totals[]):Totals{
 const out:Totals={votes:{},eligible:0,turnout:0,abstention:0,cast:0,valid:0,blank:0,null:0,otherInvalid:0};
 for(const row of rows){for(const key of ['eligible','turnout','abstention','cast','valid','blank','null','otherInvalid'] as const)out[key]+=row[key];for(const [num,votes]of Object.entries(row.votes))out.votes[num]=(out.votes[num]||0)+votes}
 return out;
}
function ranks(values:number[]):number[]{const ordered=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),out:number[]=[];for(let i=0;i<ordered.length;){let end=i+1;while(end<ordered.length&&ordered[end].v===ordered[i].v)end++;for(let k=i;k<end;k++)out[ordered[k].i]=(i+1+end)/2;i=end}return out}
export function correlation(points:[number,number][],method:'pearson'|'spearman'='pearson'):number|null{
 const pairs=points.filter(p=>p.every(Number.isFinite));if(pairs.length<3)return null;
 let xs=pairs.map(p=>p[0]),ys=pairs.map(p=>p[1]);if(method==='spearman'){xs=ranks(xs);ys=ranks(ys)}
 const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;let numerator=0,xx=0,yy=0;
 for(let i=0;i<xs.length;i++){const x=xs[i]-mx,y=ys[i]-my;numerator+=x*y;xx+=x*x;yy+=y*y}
 return xx&&yy?Math.max(-1,Math.min(1,numerator/Math.sqrt(xx*yy))):null;
}
export function report(rows:Territory[],metric:Metric,limit=10){const pairs=rows.map(row=>({row,value:delta(row,metric)})).filter((r):r is {row:Territory,value:number}=>r.value!==null);return {gains:pairs.filter(r=>r.value>0).sort((a,b)=>b.value-a.value||a.row.name.localeCompare(b.row.name,'pt-BR')).slice(0,limit),losses:pairs.filter(r=>r.value<0).sort((a,b)=>a.value-b.value||a.row.name.localeCompare(b.row.name,'pt-BR')).slice(0,limit)}}
