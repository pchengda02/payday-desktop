const widget=document.getElementById('widget'),bar=document.getElementById('edge-tab');
const shell=document.createElement('div');shell.id='motion-shell';shell.setAttribute('aria-hidden','true');document.body.prepend(shell);
let activeKey='',animations=[];
const translate=(x,y,sx=1,sy=sx)=>`translate(${x}px,${y}px) scale(${sx},${sy})`;
function clear(){for(const a of animations)a.cancel();animations=[];document.body.classList.remove('window-motion');for(const el of [widget,bar,shell])el.removeAttribute('style');}
export function updateMotion(m){
 if(!m){if(activeKey){activeKey='';clear();}return;}
 const key=m.id+':'+m.stage;if(activeKey===key)return;activeKey=key;clear();
 const expanded=m.fromCollapsed?m.to:m.from,compact=m.fromCollapsed?m.from:m.to;
 document.body.classList.add('window-motion');
 Object.assign(widget.style,{width:expanded.width+'px',height:expanded.height+'px'});
 Object.assign(bar.style,{width:compact.width+'px',height:compact.height+'px'});
 if(m.stage==='prepare'){
  const source=m.fromCollapsed?bar:widget,target=m.fromCollapsed?widget:bar;
  source.style.opacity='1';target.style.opacity='0';
  Object.assign(shell.style,{width:m.from.width+'px',height:m.from.height+'px',borderRadius:m.fromCollapsed?'0 0 18px 18px':'25px'});
  requestAnimationFrame(()=>{if(activeKey===key)window.payday.action('motion-ready',m.id).catch(()=>{});});return;
 }
 const local=r=>({x:r.x-m.canvas.x,y:r.y-m.canvas.y});
 const from=local(m.from),to=local(m.to),expanding=m.fromCollapsed;
 const options={duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:m.duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'};
 const animate=(el,frames)=>{const animation=el.animate(frames,options);animations.push(animation);return animation;};
 animate(shell,[{transform:translate(from.x,from.y),width:m.from.width+'px',height:m.from.height+'px',borderRadius:expanding?'0 0 18px 18px':'25px'},
  {transform:translate(to.x,to.y),width:m.to.width+'px',height:m.to.height+'px',borderRadius:expanding?'25px':'0 0 18px 18px'}]);
 const widgetFrom=expanding?translate(to.x,to.y-10,.94,.92):translate(from.x,from.y);
 const widgetTo=expanding?translate(to.x,to.y):translate(to.x+(m.to.width-expanded.width)/2,to.y-10,.94,.92);
 animate(widget,[{transform:widgetFrom,opacity:expanding?0:1},{transform:expanding?widgetFrom:widgetTo,opacity:expanding?0:0,offset:expanding?.16:.64},{transform:widgetTo,opacity:expanding?1:0}]);
 const barFrom=expanding?translate(from.x,from.y):translate(from.x+(m.from.width-compact.width)/2,from.y+8);
 const barTo=expanding?translate(to.x+(m.to.width-compact.width)/2,to.y+8):translate(to.x,to.y);
 animate(bar,[{transform:barFrom,opacity:expanding?1:0},{transform:expanding?barTo:barFrom,opacity:0,offset:expanding?.50:.28},{transform:barTo,opacity:expanding?0:1}]);
 Promise.all(animations.map(a=>a.finished)).then(()=>{
  // Commit the final native rectangle only after Chromium paints the final frame.
  requestAnimationFrame(()=>{if(activeKey===key)window.payday.action('motion-done',m.id).catch(()=>{});});
 }).catch(()=>{});
}
