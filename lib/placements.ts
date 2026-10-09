export type Placements={counts:number[],loaded:number};
export function placementBands(cargo:string){const bands=[{from:1,to:1,label:'1º lugar'},{from:2,to:2,label:'2º lugar'},{from:3,to:3,label:'3º lugar'}];if(!['1','3'].includes(cargo))bands.push({from:4,to:5,label:'4º–5º lugar'});if(!['1','3','5'].includes(cargo))bands.push({from:6,to:10,label:'6º–10º lugar'});return bands;}
