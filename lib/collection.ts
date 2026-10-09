export type CacheStore={read:(key:string)=>Promise<{at:number,value:any}|null>,write:(key:string,value:{at:number,value:any})=>Promise<void>};
export async function cachedRead<T>(store:CacheStore,key:string,source:()=>Promise<T>,now=Date.now(),refresh=false,maxAge=900000):Promise<T>{const saved=await store.read(key);if(saved&&now-saved.at<(saved.value?.__tseError?900000:maxAge)&&(!refresh||saved.value?.__tseError))return saved.value;const value=await source();await store.write(key,{at:now,value});return value;}
export async function collectBatch<T,R>(items:T[],cursor:number,fetcher:(item:T)=>Promise<R>):Promise<{results:R[],failed:number,nextCursor:number|null,processed:number}>{
 if(!Number.isInteger(cursor)||cursor<0||cursor>items.length)throw new Error('Cursor inválido.');
 const batch=items.slice(cursor,cursor+(cursor===0?20:60)),outcomes:{value?:R,ok:boolean}[]=new Array(batch.length);let next=0;
 const workers=Array.from({length:Math.min(cursor===0?4:8,batch.length)},async()=>{while(next<batch.length){const index=next++;try{outcomes[index]={value:await fetcher(batch[index]),ok:true}}catch{outcomes[index]={ok:false}}}});
 await Promise.all(workers);return {results:outcomes.filter(x=>x.ok).map(x=>x.value!),failed:outcomes.filter(x=>!x.ok).length,processed:batch.length,nextCursor:cursor+batch.length<items.length?cursor+batch.length:null};
}
