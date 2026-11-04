const widget=document.getElementById('widget'),bar=document.getElementById('edge-tab');
const shell=document.createElement('div');shell.id='motion-shell';shell.setAttribute('aria-hidden','true');document.body.prepend(shell);
let activeKey='',animations=[];
const translate=(x,y,sx=1,sy=sx)=>`translate(${x}px,${y}px) scale(${sx},${sy})`;
function clear(){for(const a of animations)a.cancel();animations=[];document.body.classList.remove('window-motion');for(const el of [widget,bar,shell])el.removeAttribute('style');}
export function updateFrame(frame){
 if(!frame?.bounds||!frame.canvas)return;
 const {bounds:b,canvas:c}=frame,el=document.body.classList.contains('collapsed')?bar:widget;
 Object.assign(el.style,{width:b.width+'px',height:b.height+'px',transform:translate(b.x-c.x,b.y-c.y)});
}
export function updateMotion(m,frame){
 if(!m){if(activeKey){activeKey='';clear();}updateFrame(frame);return;}
 const key=m.id+':'+m.stage;if(activeKey===key)return;activeKey=key;clear();
 const expanded=m.fromCollapsed?m.to:m.from,compact=m.fromCollapsed?m.from:m.to;
 const local=r=>({x:r.x-m.canvas.x,y:r.y-m.canvas.y});
 const from=local(m.from),to=local(m.to),expanding=m.fromCollapsed;
 document.body.classList.add('window-motion');
 Object.assign(widget.style,{width:expanded.width+'px',height:expanded.height+'px'});
 Object.assign(bar.style,{width:compact.width+'px',height:compact.height+'px'});
 if(m.stage==='prepare'){
  const source=expanding?bar:widget,target=expanding?widget:bar;
  source.style.opacity='1';source.style.transform=translate(from.x,from.y);target.style.opacity='0';
  Object.assign(shell.style,{width:m.from.width+'px',height:m.from.height+'px',transform:translate(from.x,from.y),borderRadius:expanding?'0 0 18px 18px':'25px',borderColor:expanding?'var(--line)':'transparent'});
  requestAnimationFrame(()=>{if(activeKey===key)window.payday.action('motion-ready',m.id).catch(()=>{});});return;
 }
 const options={duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:m.duration,easing:'cubic-bezier(.25,.8,.25,1)',fill:'both'};
 const animate=(el,frames)=>{const animation=el.animate(frames,options);animations.push(animation);return animation;};
 animate(shell,[{transform:translate(from.x,from.y),width:m.from.width+'px',height:m.from.height+'px',borderRadius:expanding?'0 0 18px 18px':'25px',borderColor:expanding?'var(--line)':'transparent'},
  {transform:translate(to.x,to.y),width:m.to.width+'px',height:m.to.height+'px',borderRadius:expanding?'25px':'0 0 18px 18px',borderColor:expanding?'transparent':'var(--line)'}]);
 const widgetFrom=expanding?translate(to.x,to.y-6,.97,.96):translate(from.x,from.y);
 const widgetTo=expanding?translate(to.x,to.y):translate(to.x+(m.to.width-expanded.width)/2,to.y-6,.97,.96);
 animate(widget,[{transform:widgetFrom,opacity:expanding?0:1},{transform:widgetTo,opacity:expanding?1:0}]);
 const barFrom=expanding?translate(from.x,from.y):translate(from.x+(m.from.width-compact.width)/2,from.y+6);
 const barTo=expanding?translate(to.x+(m.to.width-compact.width)/2,to.y+6):translate(to.x,to.y);
 animate(bar,[{transform:barFrom,opacity:expanding?1:0},{transform:barTo,opacity:expanding?0:1}]);
 Promise.all(animations.map(a=>a.finished)).then(()=>{
  requestAnimationFrame(()=>{if(activeKey===key)window.payday.action('motion-done',m.id).catch(()=>{});});
 }).catch(()=>{});
}
