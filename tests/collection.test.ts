import {test} from 'node:test';import assert from 'node:assert/strict';
import {collectBatch,cachedRead} from '../lib/collection.ts';
test('bounded concurrency and resumable cursor preserve failed rows',async()=>{
 let active=0,max=0;const rows=Array.from({length:45},(_,i)=>i);
 const fetcher=async(n:number)=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;if(n===4)throw new Error('404');return n;};
 const a=await collectBatch(rows,0,fetcher);assert.equal(a.nextCursor,20);assert.equal(a.failed,1);assert.equal(a.results.length,19);assert.ok(max<=4);
 const b=await collectBatch(rows,40,fetcher);assert.equal(b.nextCursor,null);assert.deepEqual(b.results,[40,41,42,43,44]);
});
test('cache expires, shares reads and refresh does not invent data',async()=>{
 let stored:any=null,calls=0;const store={read:async()=>stored,write:async(k:string,v:any)=>{stored=v}};
 const source=async()=>{calls++;return {votes:123}};
 assert.equal((await cachedRead(store,'x',source,100)).votes,123);await cachedRead(store,'x',source,101);assert.equal(calls,1);
 await cachedRead(store,'x',source,100+900001);assert.equal(calls,2);
 await cachedRead(store,'x',source,100+900002,true);assert.equal(calls,3);
});
test('later batches process 60 municipalities with up to eight workers',async()=>{let active=0,max=0;const all=Array.from({length:100},(_,i)=>i);const r=await collectBatch(all,20,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;return n});assert.equal(r.processed,60);assert.equal(r.nextCursor,80);assert.equal(r.results[0],20);assert.equal(r.results[59],79);assert.ok(max<=8&&max>4)});

test('fixed successful data stays saved while missing files expire',async()=>{let stored:any=null,calls=0;const store={read:async()=>stored,write:async(k:string,v:any)=>{stored=v}};const source=async()=>{calls++;return {votes:123}};await cachedRead(store,'fixed',source,100,false,Infinity);await cachedRead(store,'fixed',source,100+86400000,false,Infinity);assert.equal(calls,1);await cachedRead(store,'fixed',source,100+86400001,true,Infinity);assert.equal(calls,2);stored={at:100,value:{__tseError:'missing'}};await cachedRead(store,'fixed',source,100+900001,false,Infinity);assert.equal(calls,3)});
