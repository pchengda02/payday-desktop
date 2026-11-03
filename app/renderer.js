import {compute,monthEstimate,paydayDays,duration,dayKey} from './core.js';
import {updateMotion} from './motion.js';
const $=id=>document.getElementById(id),api=window.payday,form=$('form');let model,lastConfig='',lastPage=0,toastTimer;
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
  renderRecords();render();updateMotion(data.motion);
}
function render(){if(!model)return;const {state}=model,c=state.config,now=new Date(),s=compute(c,now),hide=state.hiddenMoney;
  text('date',now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'}));text('status',{working:'正在积累',lunch:'休息时间',after:'已经下班',rest:'今日休息',before:'还未上班'}[s.mode]);
  text('label',{working:'距离下班还有',lunch:'休息一下，距离下班还有',after:'今天的时间，交还给你',rest:'距离下次上班还有',before:'距离上班还有'}[s.mode]);
  text('countdown',s.mode==='after'?'下班快乐':duration(s.left));$('countdown').classList.toggle('done',s.mode==='after');$('units').hidden=s.mode==='after';text('progress-copy',s.mode==='rest'?'今天好好休息':`已完成 ${(s.paid/3600).toFixed(1)} 小时计薪时间`);text('percent',Math.round(s.progress)+'%');$('fill').style.width=s.progress+'%';$('progress').setAttribute('aria-valuenow',Math.round(s.progress));text('start',c.workStart+' 上班');text('end',c.workEnd+' 下班'+(c.workEnd<c.workStart?' · 次日':''));
  text('collapsed-label',{working:'下班',lunch:'下班',after:'今日',before:'上班',rest:'下次上班'}[s.mode]);text('collapsed-time',s.mode==='after'?'已下班':duration(s.left));text('collapsed-money',hide?'¥••••':money(s.earned));
  text('income-mini',hide?'¥••••':money(s.earned));text('earned',hide?'••••':money(s.earned).slice(1));text('hourly',hide?'••••':money(s.rate*3600));text('daily',hide?'••••':money(s.daily));text('monthly',hide?'••••':money(monthEstimate(c,now)));const days=paydayDays(c,now);text('payday',days===0?'就是今天':`${days} 天`);text('rate',hide?'只留一点属于自己的期待':`每秒 +¥${s.rate.toFixed(4)} · 每分钟 +${money(s.rate*60)}`);text('privacy',hide?'显示金额':'隐藏金额');$('privacy').setAttribute('aria-pressed',String(hide));text('quote',s.mode==='after'?'今天辛苦了，接下来做点喜欢的事。':s.mode==='rest'?'休息也是正经事，今天不赶时间。':'一点一点，离自己的时间更近。');$('setup').hidden=state.configured;
  text('treat',hide?'小小的收获，只让自己知道。':c.funItems.length?'今天的努力 ≈ '+c.funItems.slice(0,2).map(f=>`${(s.earned/f.price).toFixed(1)} ${f.unit}${f.name}`).join(' / '):'慢慢积累，留给喜欢的生活。');
  const active=state.activeBreak!==null;let total=0;const day=new Date(now);day.setHours(0,0,0,0);for(const b of state.breaks)total+=Math.max(0,Math.min(+now,b.end)-Math.max(+day,b.start))/1000;
  text('break-state',active?'这一刻，属于你':'今天休息了');text('break-time',duration(active?(Date.now()-state.activeBreak)/1000:total));text('break',active?'结束休息':'休息一下');text('quick-break-label',active?'正在休息':'休息一下');text('quick-break-time',duration(active?(Date.now()-state.activeBreak)/1000:total));text('quick-hourly',hide?'••••':money(s.rate*3600));text('quick-payday',days===0?'今天':`${days} 天`);text('hero-note',state.configured?`${c.workStart} — ${c.workEnd}`:'点击 ＋ 设置排班');document.body.dataset.mood=s.mode;for(const id of ['income-mini','quick-hourly'])$(id).title=$(id).textContent;
}
function renderRecords(){const list=$('records');list.replaceChildren();if(!model.state.breaks.length){list.innerHTML='<div class="empty">还没有休息记录<br>开始一次休息，结束后就会出现在这里。</div>';return;}
  for(const b of [...model.state.breaks].reverse().slice(0,20)){const row=document.createElement('div'),info=document.createElement('div'),small=document.createElement('small'),len=document.createElement('b');row.className='record';info.textContent=new Date(b.start).toLocaleDateString('zh-CN');small.textContent=new Date(b.start).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' — '+new Date(b.end).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});info.append(small);len.textContent=duration((b.end-b.start)/1000);row.append(info,len);list.append(row);}
}
function fillForm(){const c=model.state.config;for(const [key,value]of Object.entries(c)){const el=form.elements.namedItem(key);if(el){if(el.type==='checkbox')el.checked=value;else el.value=value;}}
  $('days').replaceChildren();for(const n of [1,2,3,4,5,6,0]){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');input.type='checkbox';input.name='workDays';input.value=n;input.checked=c.workDays.includes(n);input.setAttribute('aria-label','星期'+'日一二三四五六'[n]);span.textContent='日一二三四五六'[n];label.append(input,span);$('days').append(label);}}
function next(delta){if(model.prefs.page===3)return;action('page',(model.prefs.page+delta+3)%3);}
$('prev').onclick=()=>next(-1);$('next').onclick=()=>next(1);document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>action('page',Number(b.dataset.page)));
$('settings').onclick=()=>{if(model.prefs.page!==3)lastPage=model.prefs.page;action('page',3);};$('back').onclick=()=>action('page',lastPage);$('setup').onclick=()=>$('settings').click();
for(const [id,name]of [['theme','theme'],['pin','pin'],['close','close'],['privacy','privacy'],['break','break'],['export','export'],['import','import'],['quit','quit']])$(id).onclick=()=>action(name);
$('position-top').onclick=()=>action('position','top');$('position-free').onclick=()=>action('position','free');$('auto-hide').onchange=e=>action('autoHide',e.target.checked);
form.onsubmit=async e=>{e.preventDefault();const c=structuredClone(model.state.config);for(const key of Object.keys(c)){const el=form.elements.namedItem(key);if(!el||key==='workDays')continue;c[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;}c.workDays=[...form.querySelectorAll('[name="workDays"]:checked')].map(x=>Number(x.value));try{apply(await api.save(c));text('error','');toast('设置已保存在这台电脑');}catch(err){text('error',err.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}};
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.key==='ArrowLeft')next(-1);if(e.key==='ArrowRight')next(1);if(e.key==='Escape'){if(model.prefs.page===3)action('page',lastPage);else action('close');}});
api.onUpdate(apply);try{apply(await api.init());}catch(e){text('warning','无法读取桌面数据：'+e.message);$('warning').hidden=false;}setInterval(render,1000);
document.body.addEventListener('pointerenter',()=>api.action('pointer-enter').catch(()=>{}));
document.body.addEventListener('pointerleave',()=>api.action('pointer-leave').catch(()=>{}));
$('edge-tab').onclick=()=>action('position','top');

$('add-settings').onclick=()=>$('settings').click();
$('quick-income').onclick=()=>action('page',1);$('quick-rate').onclick=()=>action('page',1);$('quick-payday-button').onclick=()=>action('page',1);$('quick-break').onclick=()=>action('break');
