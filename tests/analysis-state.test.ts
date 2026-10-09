import {test} from 'node:test';import assert from 'node:assert/strict';import {mergeBatch} from '../lib/analysis-state.ts';
test('ignores stale selection and keeps partial coverage explicit',()=>{
 const a={key:'new',rows:[],processed:0,failed:0,unavailable:0,total:0,complete:false};
 assert.equal(mergeBatch(a,'old',{cities:[{code:'1'}],processed:20,total:40,nextCursor:20}),a);
 const b=mergeBatch(a,'new',{cities:[{code:'1',uf:'mg'}],processed:20,total:40,failed:1,unavailable:2,nextCursor:20});assert.equal(b.processed,20);assert.equal(b.complete,false);assert.equal(b.failed,1);
 const c=mergeBatch(b,'new',{cities:[{code:'2',uf:'mg'}],processed:20,total:40,failed:0,unavailable:0,nextCursor:null});assert.equal(c.complete,true);assert.equal(c.rows.length,2);
});
