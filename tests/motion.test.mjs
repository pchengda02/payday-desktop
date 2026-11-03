import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {motionPlan}=createRequire(import.meta.url)('../motion.cjs');
test('animation canvas contains both endpoints on a negative-coordinate monitor',()=>{
 const from={x:-1600,y:400,width:560,height:180},to={x:-1120,y:0,width:320,height:48};
 const plan=motionPlan(from,to,false,true,7);
 for(const rect of [from,to]){assert.ok(rect.x>=plan.canvas.x&&rect.y>=plan.canvas.y);assert.ok(rect.x+rect.width<=plan.canvas.x+plan.canvas.width&&rect.y+rect.height<=plan.canvas.y+plan.canvas.height);}
 assert.equal(plan.duration,460);assert.equal(plan.stage,'prepare');assert.equal(plan.id,7);
});
test('top expansion has a stable 400ms duration and no canvas growth beyond the panel',()=>{
 const from={x:800,y:0,width:320,height:48},to={x:680,y:0,width:560,height:180};
 const plan=motionPlan(from,to,true,false,8);
 assert.deepEqual(plan.canvas,to);assert.equal(plan.duration,400);assert.equal(plan.fromCollapsed,true);assert.equal(plan.toCollapsed,false);
});
