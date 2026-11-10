import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DEFAULTS,validateConfig,validateState,compute,payrollEstimate,expandOverrideRange} from '../app/core.js';

const fields={scheduleMode:'fixed',alternateWorkDays:[1,2,3,4,5],scheduleAnchor:'2026-01-05',anchorWeek:0,payrollEndDay:31,payrollMonthOffset:0,dayOverrides:[]};
test('P1 旧配置补充与小程序一致的六个默认字段',()=>{
  const old={...DEFAULTS};for(const key of Object.keys(fields))delete old[key];
  const migrated=validateConfig(old);
  for(const [key,value] of Object.entries(fields)){
    assert.deepEqual(DEFAULTS[key],value);assert.deepEqual(migrated[key],value);
  }
});
test('P1 小程序备份导入、持久化重载、导出后保留新字段和未知配置',()=>{
  const mobile={schema:1,config:{...DEFAULTS,monthlySalary:8800,scheduleMode:'alternating',workDays:[1,2,3,4,5,6],alternateWorkDays:[1,2,3,4,5],scheduleAnchor:'2026-11-02',anchorWeek:1,payrollEndDay:25,payrollMonthOffset:1,futureSetting:{enabled:true,values:[0,false,'中文',null]}},breaks:[{start:1000,end:2000}],activeBreak:null,configured:true,hiddenMoney:true};
  // Same validation + JSON persistence/export sequence used by main.cjs.
  const imported=validateState(JSON.parse(JSON.stringify(mobile)));
  const persisted=JSON.stringify({state:imported,prefs:{}});
  const reloaded=validateState(JSON.parse(persisted).state);
  const exported=JSON.parse(JSON.stringify(reloaded));
  assert.deepEqual(exported,mobile);
  for(const key of Object.keys(fields))assert.deepEqual(exported.config[key],mobile.config[key]);
});
test('P1 未知配置字段不会污染原型且校验已知字段不退化',()=>{
  const c=validateConfig(JSON.parse('{"__proto__":{"paydayPolluted":true},"future":7}'));
  assert.equal({}.paydayPolluted,undefined);assert.equal(Object.getPrototypeOf(c),Object.prototype);
  assert.equal(JSON.parse(JSON.stringify(c)).__proto__.paydayPolluted,true);assert.equal(c.future,7);
  for(const bad of [{scheduleMode:'bad'},{alternateWorkDays:[]},{alternateWorkDays:[8]},{scheduleAnchor:'2026-02-30'},{anchorWeek:2},{payrollEndDay:0},{payrollMonthOffset:2},{monthlySalary:Infinity},{dayOverrides:[{date:'2026-10-01',type:'bad'}]}])assert.throws(()=>validateConfig(bad));
});
test('桌面端核心计算支持大小周、自定义工资周期及节假日与调休补班，且界面包含对应控件',()=>{
  const overrides=[...expandOverrideRange('2026-10-01','2026-10-03','holiday'),{date:'2026-10-10',type:'work'}];
  const c=validateConfig({...DEFAULTS,monthlySalary:17600,scheduleMode:'alternating',workDays:[1,2,3,4,5,6],scheduleAnchor:'2026-11-02',payrollEndDay:25,payrollMonthOffset:1,dayOverrides:overrides});
  assert.equal(compute(c,new Date(2026,9,2,14)).override,'holiday');
  assert.equal(compute(c,new Date(2026,9,10,14)).mode,'working');
  assert.equal(compute(c,new Date(2026,10,7,14)).mode,'working');
  assert.equal(compute(c,new Date(2026,10,14,14)).mode,'rest');
  assert.ok(payrollEstimate(c,new Date(2026,10,20,18))>0);
  const html=fs.readFileSync(fileURLToPath(new URL('../app/index.html',import.meta.url)),'utf8');
  const js=fs.readFileSync(fileURLToPath(new URL('../app/renderer.js',import.meta.url)),'utf8');
  const css=fs.readFileSync(fileURLToPath(new URL('../app/styles-dock.css',import.meta.url)),'utf8');
  for(const id of ['schedule-preset','alt-fields','alt-days','schedule-preview','period-start','payroll-preview','ov-start','ov-end','ov-type','ov-add','ov-list','ov-prune','ov-preset','hourly-hint','daily-hint','monthly-hint','payday-hint','collapsed-fill','lunch-mark','treat','fun-fields','add-fun']){
    assert.match(html,new RegExp(`id="${id}"`),`desktop index.html missing #${id}`);
    assert.match(js,new RegExp(id),`desktop renderer.js missing ${id}`);
  }
  assert.doesNotMatch(css,/\.record:nth-child\(n\+3\)\{display:none\}/);
  assert.match(css,/body\[data-mood=lunch\] \.mascot i/);
  assert.match(css,/fieldset\.collapsed/);
});
