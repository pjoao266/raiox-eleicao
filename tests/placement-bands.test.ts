import {test} from 'node:test';import assert from 'node:assert/strict';
import {placementBands} from '../lib/placements.ts';
test('president and governor stop at third, senator at fifth and deputies at tenth',()=>{assert.deepEqual(placementBands('1').map(x=>x.to),[1,2,3]);assert.deepEqual(placementBands('3').map(x=>x.to),[1,2,3]);assert.deepEqual(placementBands('5').map(x=>[x.from,x.to]),[[1,1],[2,2],[3,3],[4,5]]);assert.deepEqual(placementBands('6').map(x=>[x.from,x.to]),[[1,1],[2,2],[3,3],[4,5],[6,10]])});
