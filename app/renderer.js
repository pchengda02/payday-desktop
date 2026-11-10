import {clone,validateConfig,compute,payrollEstimate,currentPayrollPeriod,nextPayday,weekType,duration,dayKey,upcomingOverride,expandOverrideRange,mergeOverrides,removeOverrideRange,prunePastOverrides,groupOverrides,presetHolidayOverrides,lunchMarker,OVERRIDE_NAMES} from './core.js';
const $=id=>document.getElementById(id),api=window.payday,form=$('form');let model,lastConfig='',lastPage=0,toastTimer,draftOverrides=[];
const CUSTOM_KEYS=new Set(['workDays','alternateWorkDays','scheduleMode','dayOverrides','anchorWeek','payrollEndDay','payrollMonthOffset','funItems']);
const WEEK='日一二三四五六';
const money=n=>'¥'+Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}),text=(id,value)=>{$(id).textContent=value;};
function toast(msg){text('toast',msg);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
async function action(name,value){try{const result=await api.action(name,value);if(result?.state)apply(result);if(result?.message)toast(result.message);return result;}catch(e){toast(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}}
function apply(data){
  model=data;const {prefs,state,readError}=model;
  document.body.classList.toggle('collapsed',!!data.collapsed);
  document.body.classList.toggle('settings-open',prefs.page===3);
  document.body.classList.toggle('light',prefs.theme==='light');$('warning').hidden=!readError;text('warning',readError||'');
  for(let p=0;p<4;p++)$('page-'+p).hidden=p!==prefs.page;
  $('pager').hidden=prefs.page===3;
  document.querySelectorAll('[data-page]').forEach(b=>{if(Number(b.dataset.page)===prefs.page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  text('page-name',['下班倒计时','收入在积累','给自己一点时间','设置'][prefs.page]);
  $('theme').classList.toggle('night-icon',prefs.theme==='light');$('pin').setAttribute('aria-pressed',String(prefs.pinned));$('pin').title=prefs.pinned?'取消固定，恢复自动收起':'固定展开';
  $('auto-hide').checked=prefs.autoHide;
  $('position-top').setAttribute('aria-pressed',String(prefs.anchor==='top'));$('position-free').setAttribute('aria-pressed',String(prefs.anchor==='free'));
  if(JSON.stringify(state.config)!==lastConfig){fillForm();lastConfig=JSON.stringify(state.config);}
  renderRecords();render();
}
function render(){if(!model)return;const {state}=model,c=state.config,now=new Date(),s=compute(c,now),hide=state.hiddenMoney;
  const statusMap={working:'正在积累',lunch:'休息时间',after:'已经下班',rest:'今日休息',before:'还未上班'};
  const statusText=s.mode==='rest'&&s.override?OVERRIDE_NAMES[s.override]:statusMap[s.mode]+(s.override==='work'?' · 补班':'');
  text('date',now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'}));text('status',statusText);
  text('label',{working:'距离下班还有',lunch:'休息一下，距离下班还有',after:'今天的时间，交还给你',rest:'距离下次上班还有',before:'距离上班还有'}[s.mode]);
  text('countdown',s.mode==='after'?'下班快乐':duration(s.left));$('countdown').classList.toggle('done',s.mode==='after');$('units').hidden=s.mode==='after';text('progress-copy',s.mode==='rest'?'今天好好休息':`已完成 ${(s.paid/3600).toFixed(1)} 小时计薪时间`);
  const pct=Math.max(0,Math.min(100,s.progress||0));
  text('percent',Math.round(pct)+'%');$('fill').style.width=pct+'%';$('collapsed-fill').style.width=pct+'%';$('progress').setAttribute('aria-valuenow',Math.round(pct));
  const lm=lunchMarker(s);$('lunch-mark').hidden=!lm.show;if(lm.show){$('lunch-mark').style.left=`${lm.left}%`;$('lunch-mark').style.width=`${lm.width}%`;}
  text('start',c.workStart+' 上班');text('end',c.workEnd+' 下班'+(c.workEnd<c.workStart?' · 次日':''));
  text('collapsed-label',{working:'下班',lunch:'下班',after:'今日',before:'上班',rest:'下次上班'}[s.mode]);text('collapsed-time',s.mode==='after'?'已下班':duration(s.left));text('collapsed-money',hide?'¥••••':money(s.earned));
  const pay=nextPayday(c,now),period=currentPayrollPeriod(c,now),range=p=>`${dayKey(p.start).slice(5)} 至 ${dayKey(p.end).slice(5)}`;
  text('income-mini',hide?'¥••••':money(s.earned));text('earned',hide?'••••':money(s.earned).slice(1));
  text('hourly',hide?'••••':money(s.rate*3600));text('hourly-hint',hide?'已隐藏':'按月薪与计薪天数');
  text('daily',hide?'••••':money(s.daily));text('daily-hint',c.scheduleMode==='alternating'?`本周${weekType(c,now)===0?'单休周':'双休周'}`:'按当前排班估算');
  text('monthly',hide?'••••':money(payrollEstimate(c,now)));text('monthly-hint',range(period));
  text('payday',pay.days===0?'就是今天':`${pay.days} 天`);text('payday-hint',`${dayKey(pay.date).slice(5)} 发 ${range(pay.period)}`);
  text('rate',hide?'只留一点属于自己的期待':`每秒 +¥${s.rate.toFixed(4)} · 每分钟 +${money(s.rate*60)}`);text('privacy',hide?'显示金额':'隐藏金额');$('privacy').setAttribute('aria-pressed',String(hide));
  text('quote',s.mode==='after'?'今天辛苦了，接下来做点喜欢的事。':s.mode==='rest'?(s.override==='holiday'?'节日快乐，假期就该好好享受。':s.override==='off'?'调休的一天，把时间留给自己。':'休息也是正经事，今天不赶时间。'):s.override==='work'?'补班辛苦了，假期的快乐已经提前存好。':'一点一点，离自己的时间更近。');$('setup').hidden=state.configured;
  text('treat',hide?'小小的收获，只让自己知道。':c.funItems.length?'≈ '+c.funItems.slice(0,2).map(f=>`${(s.earned/f.price).toFixed(1)} ${f.unit}${f.name}`).join(' / '):'在设置中添加趣味换算');
  const active=state.activeBreak!==null;let total=0;const day=new Date(now);day.setHours(0,0,0,0);for(const b of state.breaks)total+=Math.max(0,Math.min(+now,b.end)-Math.max(+day,b.start))/1000;
  text('break-state',active?'这一刻，属于你':'今天休息了');text('break-time',duration(active?(Date.now()-state.activeBreak)/1000:total));text('break',active?'结束休息':'休息一下');text('quick-break-label',active?'正在休息':'休息一下');text('quick-break-time',duration(active?(Date.now()-state.activeBreak)/1000:total));text('quick-hourly',hide?'••••':money(s.rate*3600));text('quick-payday',pay.days===0?'今天':`${pay.days} 天`);
  const up=upcomingOverride(c,now);
  const upCopy=!up?'':up.type==='work'?`${up.days===0?'今天':up.days===1?'明天':up.start.slice(5)}补班`:up.days===0?`${up.name}剩${up.length}天`:`${up.days===1?'明天起':up.start.slice(5)}${up.name}${up.length}天`;
  const schedCopy=c.scheduleMode==='alternating'?`${weekType(c,now)===0?'单休周':'双休周'}`:'';
  text('hero-note',!state.configured?'点击 ＋ 设置排班':[ `${c.workStart}—${c.workEnd}`, schedCopy, upCopy ].filter(Boolean).join(' · '));
  document.body.dataset.mood=s.mode;document.body.dataset.break=String(active);for(const id of ['income-mini','quick-hourly','monthly','payday'])$(id).title=$(id).textContent;
}
function renderRecords(){const list=$('records');list.replaceChildren();if(!model.state.breaks.length){list.innerHTML='<div class="empty">还没有休息记录<br>开始一次休息，结束后就会出现在这里。</div>';return;}
  for(const [revIdx,b] of [...model.state.breaks].reverse().slice(0,20).entries()){
    const idx=model.state.breaks.length-1-revIdx;
    const row=document.createElement('div'),info=document.createElement('div'),small=document.createElement('small'),right=document.createElement('div'),len=document.createElement('b'),del=document.createElement('button');
    row.className='record';right.className='record-actions';
    info.textContent=new Date(b.start).toLocaleDateString('zh-CN');
    small.textContent=new Date(b.start).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' — '+new Date(b.end).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    info.append(small);len.textContent=duration((b.end-b.start)/1000);
    del.type='button';del.className='text-button danger record-del';del.textContent='×';del.title='删除此条记录';del.setAttribute('aria-label','删除此条记录');
    del.onclick=()=>action('delete-break',{index:idx,start:b.start,end:b.end});
    right.append(len,del);row.append(info,right);list.append(row);
  }
}
function dayBoxes(container,name,values){
  $(container).replaceChildren();
  for(const n of [1,2,3,4,5,6,0]){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');input.type='checkbox';input.name=name;input.value=n;input.checked=values.includes(n);input.setAttribute('aria-label','星期'+WEEK[n]);span.textContent=WEEK[n];label.append(input,span);$(container).append(label);}
}
const checkedDays=name=>[...form.querySelectorAll(`[name="${name}"]:checked`)].map(x=>Number(x.value));
const setDays=(name,values)=>{for(const el of form.querySelectorAll(`[name="${name}"]`))el.checked=values.includes(Number(el.value));};
function presetOf(c){return c.scheduleMode==='alternating'?2:c.workDays.join(',')==='1,2,3,4,5,6'?0:c.workDays.join(',')==='1,2,3,4,5'?1:3;}
const dayOptions=(select,last)=>{select.replaceChildren(...Array.from({length:31},(_,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=i===30&&last?'月末（31 日，不足取月末）':`${i+1} 日`;return o;}));};
dayOptions($('period-start'),false);dayOptions(form.elements.payrollEndDay,true);
function setPeriodEnd(end){form.elements.payrollEndDay.value=String(end);$('period-start').value=String(end===31?1:end+1);}
$('period-start').addEventListener('change',e=>{const start=Number(e.target.value);setPeriodEnd(start===1?31:start-1);updatePreview();});
form.elements.payrollEndDay.addEventListener('change',e=>{setPeriodEnd(Number(e.target.value));updatePreview();});
function syncScheduleUI(){
  const alt=$('schedule-preset').value==='2';
  $('alt-fields').hidden=!alt;
  text('days-label',alt?'单休周 · 第一组工作日':'每周工作日');
}
$('schedule-preset').addEventListener('change',e=>{
  const index=Number(e.target.value);
  if(index===0)setDays('workDays',[1,2,3,4,5,6]);
  else if(index===1)setDays('workDays',[1,2,3,4,5]);
  else if(index===2&&$('alt-fields').hidden){setDays('workDays',[1,2,3,4,5,6]);setDays('alternateWorkDays',[1,2,3,4,5]);form.elements.scheduleAnchor.value=dayKey(new Date());form.elements.anchorWeek.value='0';}
  syncScheduleUI();updatePreview();
});
form.addEventListener('change',e=>{
  if(e.target.name==='workDays'&&$('schedule-preset').value!=='2')$('schedule-preset').value='3';
  if(['workDays','alternateWorkDays','scheduleAnchor','anchorWeek','payrollMonthOffset','payday'].includes(e.target.name))updatePreview();
});
function updatePreview(){
  if(!model)return;
  try{
    const c=validateConfig({...clone(model.state.config),scheduleMode:$('schedule-preset').value==='2'?'alternating':'fixed',workDays:checkedDays('workDays'),alternateWorkDays:checkedDays('alternateWorkDays'),
      scheduleAnchor:form.elements.scheduleAnchor.value,anchorWeek:Number(form.elements.anchorWeek.value),payrollEndDay:Number(form.elements.payrollEndDay.value),
      payrollMonthOffset:Number(form.elements.payrollMonthOffset.value),payday:Number(form.elements.payday.value),dayOverrides:draftOverrides});
    const now=new Date(),monday=new Date(now);monday.setDate(now.getDate()-((now.getDay()+6)%7));const following=new Date(monday);following.setDate(monday.getDate()+7);
    const weekName=d=>weekType(c,d)===0?`单休周 · 上班 ${c.workDays.length} 天`:`双休周 · 上班 ${c.alternateWorkDays.length} 天`;
    const period=currentPayrollPeriod(c,now),next=nextPayday(c,now),range=p=>`${dayKey(p.start)} 至 ${dayKey(p.end)}`;
    text('schedule-preview',c.scheduleMode==='alternating'?`本周 ${weekName(monday)}；下周 ${weekName(following)}`:`每周上班 ${c.workDays.length} 天`);
    text('payroll-preview',`当前周期：${range(period)}\n本期发薪：${dayKey(period.payDate)}\n下次发薪：${dayKey(next.date)}（${range(next.period)}）`);
  }catch(err){text('schedule-preview','请为每组排班至少选择一天，并设置参考周。');text('payroll-preview',err.message);}
}
function renderOverrides(){
  const list=$('ov-list'),today=dayKey(new Date()),groups=groupOverrides(draftOverrides,today);list.replaceChildren();
  if(!groups.length){const p=document.createElement('p');p.className='hint';p.textContent='还没有标记任何节假日或调休。';list.append(p);}
  for(const g of groups){
    const row=document.createElement('div'),date=document.createElement('span'),tag=document.createElement('b'),del=document.createElement('button');
    row.className='ov-row'+(g.past?' past':'');date.textContent=g.label;tag.className='ov-tag '+g.type;tag.textContent=g.name;
    del.type='button';del.className='text-button danger';del.textContent='删除';
    del.onclick=()=>{draftOverrides=removeOverrideRange(draftOverrides,g.start,g.end);renderOverrides();updatePreview();};
    row.append(date,tag,del);list.append(row);
  }
  const past=draftOverrides.filter(o=>o.date<today).length;$('ov-prune').hidden=!past;text('ov-prune',`清理已过去的 ${past} 天`);
}
$('ov-start').addEventListener('change',e=>{if(!$('ov-end').value||$('ov-end').value<e.target.value||$('ov-end').value===$('ov-start').dataset.prev)$('ov-end').value=e.target.value;$('ov-start').dataset.prev=e.target.value;$('ov-end').min=e.target.value||'1900-01-01';});
$('ov-add').onclick=()=>{try{const added=expandOverrideRange($('ov-start').value,$('ov-end').value,$('ov-type').value);draftOverrides=mergeOverrides(draftOverrides,added);$('ov-end').value=$('ov-start').value;renderOverrides();updatePreview();toast(`已添加 ${added.length} 天，点保存工作设置生效`);}catch(err){toast(err.message);}};
$('ov-preset').onclick=()=>{const year=new Date().getFullYear();draftOverrides=mergeOverrides(draftOverrides,presetHolidayOverrides(year));renderOverrides();updatePreview();toast(`已填入 ${year} 年法定节假日，点保存工作设置生效`);};
$('ov-prune').onclick=()=>{const before=draftOverrides.length;draftOverrides=prunePastOverrides(draftOverrides,new Date());renderOverrides();toast(`已清理 ${before-draftOverrides.length} 天，点保存工作设置生效`);};
function addFunRow(f={name:'',price:18,unit:'杯'}){
  if($('fun-fields').children.length>=10){toast('最多添加 10 项');return;}
  const row=document.createElement('div');row.className='fun-row';
  for(const [key,title] of [['name','名称'],['price','单价'],['unit','单位']]){
    const label=document.createElement('label'),input=document.createElement('input');
    label.textContent=title;input.dataset.key=key;input.value=f[key];input.required=true;
    if(key==='price'){input.type='number';input.min='.01';input.max='100000000';input.step='.01';}
    else{input.type='text';input.maxLength=key==='name'?20:8;}
    label.append(input);row.append(label);
  }
  const del=document.createElement('button');del.type='button';del.className='text-button danger';del.textContent='×';del.title='删除此换算项';
  del.onclick=()=>row.remove();row.append(del);$('fun-fields').append(row);
}
$('add-fun').onclick=()=>addFunRow();
for(const legend of document.querySelectorAll('#page-3 fieldset > legend')){
  legend.tabIndex=0;legend.setAttribute('role','button');
  const toggle=()=>legend.parentElement.classList.toggle('collapsed');
  legend.onclick=toggle;legend.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
}
function fillForm(){
  const c=model.state.config;
  for(const [key,value]of Object.entries(c)){if(CUSTOM_KEYS.has(key))continue;const el=form.elements.namedItem(key);if(el){if(el.type==='checkbox')el.checked=value;else el.value=value;}}
  dayBoxes('days','workDays',c.workDays);dayBoxes('alt-days','alternateWorkDays',c.alternateWorkDays||[1,2,3,4,5]);
  $('schedule-preset').value=String(presetOf(c));form.elements.anchorWeek.value=String(c.anchorWeek||0);
  form.elements.payrollMonthOffset.value=String(c.payrollMonthOffset||0);setPeriodEnd(c.payrollEndDay||31);
  draftOverrides=clone(c.dayOverrides||[]);
  $('fun-fields').replaceChildren();(c.funItems||[]).forEach(addFunRow);
  const today=dayKey(new Date());if(!$('ov-start').value){$('ov-start').value=today;$('ov-end').value=today;$('ov-start').dataset.prev=today;}
  syncScheduleUI();renderOverrides();updatePreview();
}
function next(delta){if(model.prefs.page===3)return;action('page',(model.prefs.page+delta+3)%3);}
$('prev').onclick=()=>next(-1);$('next').onclick=()=>next(1);document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>action('page',Number(b.dataset.page)));
$('settings').onclick=()=>{if(model.prefs.page!==3)lastPage=model.prefs.page;action('page',3);};$('back').onclick=()=>action('page',lastPage);$('setup').onclick=()=>$('settings').click();
for(const [id,name]of [['theme','theme'],['pin','pin'],['close','close'],['privacy','privacy'],['break','break'],['export','export'],['import','import'],['quit','quit']])$(id).onclick=()=>action(name);
$('position-top').onclick=()=>action('position','top');$('position-free').onclick=()=>action('position','free');$('auto-hide').onchange=e=>action('autoHide',e.target.checked);
form.onsubmit=async e=>{
  e.preventDefault();
  const c=structuredClone(model.state.config);
  for(const key of Object.keys(c)){if(CUSTOM_KEYS.has(key))continue;const el=form.elements.namedItem(key);if(!el)continue;c[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;}
  c.scheduleMode=$('schedule-preset').value==='2'?'alternating':'fixed';
  c.workDays=checkedDays('workDays');
  c.alternateWorkDays=checkedDays('alternateWorkDays');
  c.anchorWeek=Number(form.elements.anchorWeek.value);
  c.payrollEndDay=Number(form.elements.payrollEndDay.value);
  c.payrollMonthOffset=Number(form.elements.payrollMonthOffset.value);
  c.dayOverrides=clone(draftOverrides);
  c.funItems=[...$('fun-fields').children].map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(el=>[el.dataset.key,el.dataset.key==='price'?Number(el.value):el.value])));
  try{apply(await api.save(c));text('error','');toast('设置已保存在这台电脑');}catch(err){text('error',err.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}
};
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.key==='ArrowLeft')next(-1);if(e.key==='ArrowRight')next(1);if(e.key==='Escape'){if(model.prefs.page===3)action('page',lastPage);else action('close');}});
api.onUpdate(apply);try{apply(await api.init());}catch(e){text('warning','无法读取桌面数据：'+e.message);$('warning').hidden=false;}setInterval(render,1000);
document.body.addEventListener('pointerenter',()=>api.action('pointer-enter').catch(()=>{}));
document.body.addEventListener('pointerleave',()=>api.action('pointer-leave').catch(()=>{}));
$('edge-tab').onclick=()=>action('position','top');

$('add-settings').onclick=()=>$('settings').click();
$('quick-income').onclick=()=>action('page',1);$('quick-rate').onclick=()=>action('page',1);$('quick-payday-button').onclick=()=>action('page',1);$('quick-break').onclick=()=>action('break');

const reducedMotionQuery=matchMedia('(prefers-reduced-motion: reduce)');
const syncMotionPreference=()=>api.action('motion-preference',reducedMotionQuery.matches).catch(()=>{});
syncMotionPreference();reducedMotionQuery.addEventListener('change',syncMotionPreference);
