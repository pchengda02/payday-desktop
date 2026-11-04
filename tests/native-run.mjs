import {spawn} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {DEFAULTS,clone} from '../app/core.js';
const work=path.resolve('.test-output'),electron=process.env.PAYDAY_TEST_EXE||path.resolve('node_modules/electron/dist/electron.exe');
for(const [name,args]of [['system',[]],['100',['--force-device-scale-factor=1']]]){
 const data=path.join(work,'payday-top-native-'+name),report=path.join(work,'payday-top-native-'+name+'.json');fs.mkdirSync(data,{recursive:true});
 fs.writeFileSync(path.join(data,'payday.json'),JSON.stringify({state:{schema:1,config:{...clone(DEFAULTS),monthlySalary:17600,workStart:"00:00",workEnd:"23:59",workDays:[0,1,2,3,4,5,6],lunchEnabled:false},configured:true,breaks:[],activeBreak:null,hiddenMoney:false},prefs:{uiVersion:3,theme:'dark'}}));
 const started=Date.now();const code=await new Promise((resolve,reject)=>{const child=spawn(electron,['.',...args,'--data-dir='+data,'--self-test='+report,'--region-probe='+path.resolve('tests/window-region.py')],{stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('exit',resolve);setTimeout(()=>{if(child.exitCode===null){child.kill();reject(Error('native check timed out'));}},40000).unref();});
 assert.equal(code,0);assert.ok(fs.statSync(report).mtimeMs>=started-1000);const result=JSON.parse(fs.readFileSync(report,'utf8'));assert.equal(result.ok,true,JSON.stringify(result));console.log(`Native ${name}: ${result.checks.length} checks passed, display scale ${result.scaleFactor}`);
}
