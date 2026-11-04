import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {fadeProgress}=createRequire(import.meta.url)('../transition.cjs');
test('fade endpoints clamp overshoot and preserve monotonic opacity',()=>{
 assert.equal(fadeProgress(-1),0);assert.equal(fadeProgress(2),1);
 let previous=0;for(let i=0;i<=100;i++){const p=fadeProgress(i/100);assert.ok(p>=previous&&p<=1);previous=p;}
});
