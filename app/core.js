export const DEFAULTS = Object.freeze({workStart:'09:00',workEnd:'18:00',lunchEnabled:true,lunchStart:'12:00',lunchEnd:'13:00',lunchPaid:false,workDays:[1,2,3,4,5],monthlySalary:0,workDaysPerMonth:22,payday:10,useNetSalary:false,netSalary:0,remindEnabled:false,remindBefore:10,remindSound:false,funItems:[{name:'奶茶',price:18,unit:'杯'},{name:'火锅',price:88,unit:'顿'}]});
export const clone = x => JSON.parse(JSON.stringify(x));
export function validateConfig(input){
  if(!input || typeof input!=='object' || Array.isArray(input)) throw Error('设置格式不正确');
  const c=clone(DEFAULTS);
  for(const key of Object.keys(c)) if(Object.hasOwn(input,key)) c[key]=input[key];
  for(const key of ['workStart','workEnd','lunchStart','lunchEnd']) if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(c[key])) throw Error('请填写有效时间');
  if(c.workStart===c.workEnd) throw Error('上班和下班时间不能相同');
  for(const key of ['monthlySalary','netSalary']) if(typeof c[key]!=='number'||!Number.isFinite(c[key])||c[key]<0||c[key]>100000000) throw Error('月薪请输入 0 到 1 亿之间的数字');
  for(const key of ['workDaysPerMonth','payday']) if(!Number.isInteger(c[key])||c[key]<1||c[key]>31) throw Error('工作天数和发薪日请输入 1 到 31 的整数');
  if(!Array.isArray(c.workDays)||!c.workDays.length||c.workDays.some(d=>!Number.isInteger(d)||d<0||d>6)) throw Error('请至少选择一个工作日');
  c.workDays=[...new Set(c.workDays)].sort();
  for(const key of ['lunchEnabled','lunchPaid','useNetSalary','remindEnabled','remindSound']) if(typeof c[key]!=='boolean') throw Error('开关设置不正确');
  if(!Number.isInteger(c.remindBefore)||c.remindBefore<0||c.remindBefore>120) throw Error('提醒时间请输入 0 到 120 分钟');
  if(!Array.isArray(c.funItems)||c.funItems.length>10) throw Error('趣味换算最多设置 10 项');
  c.funItems=c.funItems.map(f=>{if(!f||typeof f.name!=='string'||!f.name.trim()||f.name.length>20||typeof f.unit!=='string'||!f.unit.trim()||f.unit.length>8||typeof f.price!=='number'||!Number.isFinite(f.price)||f.price<=0||f.price>100000000) throw Error('请填写换算名称、正数单价和单位'); return {name:f.name.trim(),price:f.price,unit:f.unit.trim()};});
  const s=shift(c,new Date(2026,0,5));
  if(s.paidSeconds<=0) throw Error('休息时段不能覆盖全部计薪时间');
  return c;
}
export function dayKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function at(day,time){const d=new Date(day);d.setHours(...time.split(':').map(Number),0,0);return d;}
function addDay(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
export function shift(c,day){
  const start=at(day,c.workStart);let end=at(day,c.workEnd);
  if(end<=start)end=addDay(end,1);
  let lunchStart=at(day,c.lunchStart),lunchEnd=at(day,c.lunchEnd);
  if(c.workEnd<c.workStart && lunchStart<start) lunchStart=addDay(lunchStart,1);
  lunchEnd=at(lunchStart,c.lunchEnd);if(lunchEnd<=lunchStart)lunchEnd=addDay(lunchEnd,1);
  lunchStart=new Date(Math.max(+start,+lunchStart));lunchEnd=new Date(Math.min(+end,+lunchEnd));
  const lunchSeconds=c.lunchEnabled?Math.max(0,(lunchEnd-lunchStart)/1000):0;
  return {start,end,lunchStart,lunchEnd,lunchSeconds,paidSeconds:(end-start)/1000-(c.lunchPaid?0:lunchSeconds)};
}
export function compute(c,now=new Date()){
  let s=shift(c,now),work=c.workDays.includes(s.start.getDay());
  const prev=shift(c,addDay(now,-1));
  if(c.workDays.includes(prev.start.getDay())&&now>=prev.start&&now<prev.end){s=prev;work=true;}
  const daily=(c.useNetSalary?c.netSalary:c.monthlySalary)/c.workDaysPerMonth,rate=daily/s.paidSeconds;
  let mode=!work?'rest':now<s.start?'before':now>=s.end?'after':c.lunchEnabled&&now>=s.lunchStart&&now<s.lunchEnd?'lunch':'working';
  const elapsed=Math.max(0,Math.min(+now,+s.end)-s.start)/1000;
  const lunchPassed=c.lunchEnabled&&!c.lunchPaid?Math.max(0,Math.min(+now,+s.lunchEnd)-s.lunchStart)/1000:0;
  const paid=work?Math.min(s.paidSeconds,Math.max(0,elapsed-lunchPassed)):0;
  let next=null;
  for(let i=0;i<=7;i++){const d=shift(c,addDay(now,i)).start;if(d>now&&c.workDays.includes(d.getDay())){next=d;break;}}
  const left=mode==='rest'?(next-now)/1000:mode==='before'?(s.start-now)/1000:mode==='after'?(now-s.end)/1000:(s.end-now)/1000;
  return {...s,now,mode,daily,rate,paid,earned:paid*rate,progress:paid/s.paidSeconds*100,left,next,work,shiftKey:dayKey(s.start)};
}
export function monthEstimate(c,now){
  let sum=0;const daily=(c.useNetSalary?c.netSalary:c.monthlySalary)/c.workDaysPerMonth;
  for(let d=1;d<=now.getDate();d++){
    const anchor=new Date(now.getFullYear(),now.getMonth(),d);if(!c.workDays.includes(anchor.getDay()))continue;
    const s=shift(c,anchor);if(now>=s.end)sum+=daily;
    else if(now>=s.start){const elapsed=(now-s.start)/1000;const unpaid=c.lunchEnabled&&!c.lunchPaid?Math.max(0,Math.min(+now,+s.lunchEnd)-s.lunchStart)/1000:0;sum+=Math.max(0,elapsed-unpaid)/s.paidSeconds*daily;}
  }return sum;
}
export function paydayDays(c,now){
  const target=(y,m)=>new Date(y,m,Math.min(c.payday,new Date(y,m+1,0).getDate()));
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());let d=target(today.getFullYear(),today.getMonth());
  if(d<today)d=target(today.getFullYear(),today.getMonth()+1);
  return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
}
export function duration(seconds){const s=Math.max(0,Math.floor(seconds));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(':');}
export function validateState(x){
  if(!x||x.schema!==1)throw Error('不是支持的 Payday 备份文件');
  const config=validateConfig(x.config);
  if(!Array.isArray(x.breaks)||x.breaks.length>1000)throw Error('休息记录格式不正确');
  const breaks=x.breaks.map(b=>{if(!b||!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.start<0||b.end<b.start||b.end>8640000000000000)throw Error('休息记录时间不正确');return {start:b.start,end:b.end};});
  if(x.activeBreak!==null&&(!Number.isFinite(x.activeBreak)||x.activeBreak<0||x.activeBreak>Date.now()))throw Error('休息计时格式不正确');
  return {schema:1,config,breaks,activeBreak:x.activeBreak,configured:!!x.configured,hiddenMoney:!!x.hiddenMoney};
}
