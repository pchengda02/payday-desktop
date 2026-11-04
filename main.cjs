const {app,BrowserWindow,ipcMain,screen,Tray,Menu,nativeImage,globalShortcut,dialog,Notification,powerMonitor,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {layout,validPosition,hoverDecision}=require('./geometry.cjs');
const {fadeProgress}=require('./transition.cjs');
app.disableHardwareAcceleration();
const customData=process.argv.find(x=>x.startsWith('--data-dir='));if(customData)app.setPath('userData',path.resolve(customData.slice(11)));
const selfTest=process.argv.find(x=>x.startsWith('--self-test='));
let panel,bar,tray,core,state,prefs,storeFile,collapsed=false,busy=false,quitting=false,dragging=false,lastInside=0,moveTimer,previous=null,readError='',timer,anchor='top',reminded=new Set();
let motion=null,motionTimer,motionId=0,queuedMove=null,programmaticUntil=0,reducedMotion=false;
const defaults={uiVersion:3,floatBounds:null,pinned:false,autoHide:true,theme:'dark',page:0,displayId:null};
function fresh(){return {schema:1,config:core.clone(core.DEFAULTS),breaks:[],activeBreak:null,configured:false,hiddenMoney:false};}
function snapshot(sender=panel?.webContents){return {state,prefs:{...prefs,mode:'floating',anchor},readError,collapsed:sender===bar?.webContents,transitioning:!!motion};}
function broadcast(){for(const win of [panel,bar])if(win&&!win.isDestroyed())win.webContents.send('update',snapshot(win.webContents));}
function transact(run){const oldState=core.clone(state),oldPrefs={...prefs};try{run();if(readError){if(JSON.stringify(state)!==JSON.stringify(oldState))throw Error('原数据读取失败，请先导入有效备份。');}else persist();broadcast();return snapshot();}catch(e){state=oldState;prefs=oldPrefs;throw e;}}
function persist(){fs.mkdirSync(path.dirname(storeFile),{recursive:true});fs.writeFileSync(storeFile+'.tmp',JSON.stringify({state,prefs},null,2));fs.renameSync(storeFile+'.tmp',storeFile);}
function display(){return screen.getAllDisplays().find(d=>d.id===prefs.displayId)||screen.getPrimaryDisplay();}
function geometry(){const d=display();return layout(d.workArea,{screen:d.bounds,settings:prefs.page===3,position:anchor==='free'?prefs.floatBounds:null});}
function place(win,bounds){programmaticUntil=Date.now()+100;const current=win.getBounds();if(Object.keys(bounds).some(k=>current[k]!==bounds[k]))win.setBounds(bounds,false);}
function park(win){win.setIgnoreMouseEvents(true,{forward:true});win.hide();win.setOpacity(0);}
function finishMotion(){
 if(!motion)return;clearTimeout(motionTimer);const {source,target,toCollapsed,focus}=motion;
 park(source);target.setOpacity(1);target.setIgnoreMouseEvents(false);collapsed=toCollapsed;motion=null;lastInside=Date.now();
 if(focus&&!toCollapsed){target.show();target.focus();}broadcast();
 const next=queuedMove;queuedMove=null;if(next)moveTo(next.bounds,next.nextCollapsed,next.focus);
}
function tickMotion(now=performance.now()){
 if(!motion)return;const progress=fadeProgress((now-motion.start)/motion.duration);
 motion.source.setOpacity(1-progress);motion.target.setOpacity(progress);
 if(progress>=1)finishMotion();else motionTimer=setTimeout(tickMotion,16);
}
function moveTo(bounds,nextCollapsed,focus=false){
 if(motion){queuedMove={bounds,nextCollapsed,focus};return;}
 const target=nextCollapsed?bar:panel,source=nextCollapsed?panel:bar;place(target,bounds);lastInside=Date.now();
 if(collapsed===nextCollapsed||!source.isVisible()){
  park(source);collapsed=nextCollapsed;target.setOpacity(1);target.setIgnoreMouseEvents(false);broadcast();
  if(focus&&!nextCollapsed){target.show();target.focus();}else target.showInactive();return;
 }
 dragging=false;clearTimeout(moveTimer);
 const duration=reducedMotion?1:220;
 motion={id:++motionId,source,target,toCollapsed:nextCollapsed,focus,start:performance.now(),duration};
 // Both HWNDs remain small. During the brief handoff neither captures clicks.
 source.setIgnoreMouseEvents(true,{forward:true});target.setIgnoreMouseEvents(true,{forward:true});
 target.setOpacity(0);broadcast();target.showInactive();tickMotion();
}
function reveal(focus=false,source='current'){if(!panel)return;if(source==='hover'||source==='top')anchor='top';else if(source==='restore')anchor=validPosition(prefs.floatBounds)?'free':'top';moveTo(geometry().panel,false,focus);}
function collapse(force=false){if(busy||(!force&&(prefs.pinned||!prefs.autoHide||prefs.page===3)))return;moveTo(geometry().handle,true);}
function rememberUserPosition(bounds){const d=screen.getDisplayMatching(bounds);anchor='free';transact(()=>{prefs.displayId=d.id;prefs.floatBounds={x:bounds.x,y:bounds.y};});lastInside=Date.now();}
function poll(now=Date.now(),cursor=screen.getCursorScreenPoint()){
 if(!panel||panel.isDestroyed()||motion)return;
 const current=collapsed?bar:panel;
 const decision=hoverDecision({cursor,panel:current.getBounds(),expanded:!collapsed,pinned:prefs.pinned,autoHide:prefs.autoHide,busy:busy||prefs.page===3,arranging:dragging,lastInside,now});
 lastInside=decision.lastInside;if(decision.action==='reveal')reveal(false,'hover');else if(decision.action==='collapse')collapse();
}
function updateTray(){tray?.setContextMenu(Menu.buildFromTemplate([{label:'回到上次拖放位置',click:()=>reveal(true,'restore')},{label:'从顶部展开',click:()=>reveal(true,'top')},{label:'固定展开',type:'checkbox',checked:prefs.pinned,click:i=>{transact(()=>{prefs.pinned=i.checked;});reveal(true);updateTray();}},{type:'separator'},{label:'设置',click:()=>{transact(()=>{prefs.page=3;});reveal(true);}},{type:'separator'},{label:'退出 Payday',click:()=>{quitting=true;app.quit();}}]));}
function checkReminder(){const now=new Date(),s=core.compute(state.config,now),target=+s.end-state.config.remindBefore*60000,key=s.shiftKey+':'+state.config.remindBefore;if(state.config.remindEnabled&&previous&&previous<target&&+now>=target&&+now-target<60000&&s.work&&!reminded.has(key)){reminded.add(key);new Notification({title:state.config.remindBefore?`还有 ${state.config.remindBefore} 分钟下班`:'下班啦',body:'今天辛苦了。',silent:!state.config.remindSound,icon:path.join(__dirname,'app/icon192.png')}).show();}previous=+now;}
function trusted(e){if(![panel?.webContents,bar?.webContents].includes(e.sender))throw Error('不允许的窗口请求');}
async function action(name,value){
 if(name==='motion-preference'){reducedMotion=value===true;return {};}
 if(name==='reveal'){reveal(true,'restore');return snapshot();}
 if(name==='pointer-enter'){if(collapsed&&!motion)reveal(false,'hover');lastInside=Date.now();return snapshot();}
 if(name==='pointer-leave'){lastInside=Date.now();return snapshot();}
 if(name==='close'){transact(()=>{prefs.pinned=false;if(prefs.page===3)prefs.page=0;});collapse(true);updateTray();return snapshot();}
 if(name==='pin'){transact(()=>{prefs.pinned=!prefs.pinned;});lastInside=Date.now();updateTray();return snapshot();}
 if(name==='theme')return transact(()=>{prefs.theme=prefs.theme==='dark'?'light':'dark';});
 if(name==='privacy')return transact(()=>{state.hiddenMoney=!state.hiddenMoney;});
 if(name==='page'){transact(()=>{if(!Number.isInteger(value)||value<0||value>3)throw Error('页面不存在');prefs.page=value;});reveal(false);return snapshot();}
 if(name==='autoHide'){transact(()=>{prefs.autoHide=!!value;if(value)prefs.pinned=false;});lastInside=Date.now();updateTray();return snapshot();}
 if(name==='position'){if(!['top','free'].includes(value))throw Error('无效位置');reveal(true,value==='top'?'top':'restore');return snapshot();}
 if(name==='float'){reveal(true,'restore');return {message:'拖动顶部可自由放置，移开后收至顶部中间。'};}
 if(name==='break')return transact(()=>{const now=Date.now();if(state.activeBreak===null)state.activeBreak=now;else{if(now<state.activeBreak)throw Error('请校准系统时间');state.breaks=[...state.breaks,{start:state.activeBreak,end:now}].slice(-1000);state.activeBreak=null;}});
 if(name==='export'||name==='import'){
  busy=true;try{
   if(name==='export'){const r=await dialog.showSaveDialog(panel,{title:'导出备份',defaultPath:`payday-${core.dayKey(new Date())}.json`,filters:[{name:'JSON',extensions:['json']}]});if(!r.canceled)fs.writeFileSync(r.filePath,JSON.stringify(state,null,2));return {message:r.canceled?'已取消':'备份已保存'};}
   const r=await dialog.showOpenDialog(panel,{title:'导入备份',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return {message:'已取消'};if(fs.statSync(r.filePaths[0]).size>2000000)throw Error('备份不能超过 2 MB');const imported=core.validateState(JSON.parse(fs.readFileSync(r.filePaths[0],'utf8')));
   const confirm=await dialog.showMessageBox(panel,{type:'question',message:'使用备份替换本机设置和记录？',buttons:['取消','替换'],defaultId:0,cancelId:0});if(confirm.response!==1)return {message:'已取消'};const before=state;state=imported;try{persist();readError='';}catch(e){state=before;throw e;}broadcast();return {message:'已导入备份'};
  }finally{busy=false;lastInside=Date.now();}
 }
 if(name==='quit'){quitting=true;app.quit();return {};}
 throw Error('不支持的操作');
}

async function nativeTest(reportPath){
 clearInterval(timer);const checks=[],samples=[],hitDiagnostics=[];let probe;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const settle=async()=>{const start=Date.now();while(motion||queuedMove){if(Date.now()-start>2400)throw Error('fade did not settle');await sleep(20);}await sleep(80);};
 const record=(name,pass)=>{checks.push({name,pass,panel:panel.getBounds(),bar:bar.getBounds(),panelVisible:panel.isVisible(),barVisible:bar.isVisible()});if(!pass)throw Error(name);};
 const handle=w=>{const b=w.getNativeWindowHandle();return(b.length===8?b.readBigUInt64LE():BigInt(b.readUInt32LE())).toString();};
 const capture=async(win,name)=>{await settle();fs.writeFileSync(reportPath.replace(/\.json$/,'-'+name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  prefs.page=0;prefs.pinned=false;prefs.autoHide=true;reveal(false,'top');await settle();
  const area=display().workArea;
  probe=new BrowserWindow({title:'Payday input check',x:area.x+30,y:area.y+210,width:Math.min(1100,area.width-60),height:Math.min(430,area.height-240),show:false,backgroundColor:'#f3f6f8',webPreferences:{nodeIntegration:false,contextIsolation:true}});
  await probe.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><title>Payday input check</title><style>body{font:22px sans-serif;padding:25px;background:#f3f6f8}button,input{font:22px sans-serif;margin:12px;padding:14px}</style><h1>Independent window input check</h1><p>Test fixture only. No personal data.</p><button onclick="this.textContent=++window.clicks">Click check</button><input aria-label="Keyboard check" placeholder="Keyboard check"><script>window.clicks=0</script>'));
  probe.show();await sleep(450);
  const point={x:area.x+80,y:area.y+300},physical=screen.dipToScreenPoint(point);
  const py=process.argv.find(x=>x.startsWith('--hit-probe='));
  const hit=(p=physical)=>JSON.parse(require('node:child_process').execFileSync('python',[py?py.slice(12):path.join(__dirname,'tests/hit-test.py'),String(p.x),String(p.y),handle(probe)],{windowsHide:true,encoding:'utf8'}));
  const outsideReachesProbe=()=>{const result=hit();hitDiagnostics.push({result,expected:handle(probe),probeBounds:probe.getBounds(),physical,focus:probe.isFocused()});return result.root===handle(probe);};
  record('main and bar are genuinely small native windows',panel.getBounds().width===560&&panel.getBounds().height===180&&bar.getBounds().width===320&&bar.getBounds().height===48);
  record('expanded app leaves another window accessible',outsideReachesProbe());
  record('startup and hover do not steal focus',probe.isFocused());await capture(panel,'home');
  const saved={x:Math.round(area.x+(area.width-560)*.35),y:Math.round(area.y+(area.height-180)*.4)},oldSpot=screen.dipToScreenPoint({x:Math.round(area.x+(area.width-560)*.35)+500,y:Math.round(area.y+(area.height-180)*.4)+140}),baseline=hit(oldSpot);place(panel,{...geometry().panel,...saved});rememberUserPosition(panel.getBounds());
  await action('page',1);await settle();record('free position survives navigation',Math.abs(panel.getBounds().x-saved.x)<=2&&Math.abs(panel.getBounds().y-saved.y)<=2);
  record('expanded window really receives its own clicks',hit(oldSpot).root===handle(panel)&&hit(oldSpot).pixel!==baseline.pixel);
  record('free position persists',JSON.parse(fs.readFileSync(storeFile,'utf8')).prefs.floatBounds.x===saved.x);await action('page',0);await settle();
  const panelBefore=panel.getBounds(),barBefore=bar.getBounds();
  collapse(true);await sleep(70);
  record('fade has intermediate opacity',!!motion&&panel.getOpacity()>0&&panel.getOpacity()<1&&bar.getOpacity()>0&&bar.getOpacity()<1);
  record('another window remains accessible during fade',outsideReachesProbe());
  record('both native rectangles stay bounded during fade',panel.getBounds().width<=563&&panel.getBounds().height<=563&&bar.getBounds().width<=323&&bar.getBounds().height<=51);
  record('fade never scales or moves the source rectangle',JSON.stringify(panel.getBounds())===JSON.stringify(panelBefore));
  await settle();record('collapse fully hides source HWND',collapsed&&!panel.isVisible()&&panel.getOpacity()===0&&bar.isVisible()&&bar.getOpacity()===1);
  record('collapsed app leaves another window accessible',outsideReachesProbe());
  const after=hit(oldSpot);hitDiagnostics.push({baseline,after,oldSpot});record('old panel location exposes underlying window with no stale pixels',after.root===handle(probe)&&after.pixel===baseline.pixel);
  const d=display(),r=bar.getBounds();record('bar sits at screen top center',Math.abs(r.x+r.width/2-d.bounds.x-d.bounds.width/2)<=2&&r.y===Math.max(d.bounds.y,d.workArea.y));await capture(bar,'bar');
  poll(Date.now(),{x:r.x+20,y:r.y+20});await settle();record('hover expands without leaving bar behind',!collapsed&&panel.isVisible()&&!bar.isVisible()&&bar.getOpacity()===0);
  record('hover preserves independent-window keyboard focus',probe.isFocused());
  record('free position remains saved after top expansion',prefs.floatBounds.x===saved.x&&prefs.floatBounds.y===saved.y);
  await action('reveal');await settle();record('tray restore uses saved coordinates',Math.abs(panel.getBounds().x-saved.x)<=2&&Math.abs(panel.getBounds().y-saved.y)<=2);probe.focus();await sleep(80);
  prefs.pinned=true;lastInside=0;poll(Date.now(),point);record('pin prevents collapse',!motion&&!collapsed);prefs.pinned=false;
  await action('page',3);await settle();record('settings window remains bounded',Math.abs(panel.getBounds().width-368)<=2&&Math.abs(panel.getBounds().height-560)<=2);await action('page',0);await settle();
  for(let i=0;i<4;i++){
   collapse(true);await sleep(40);samples.push({panel:panel.getBounds(),bar:bar.getBounds(),panelOpacity:panel.getOpacity(),barOpacity:bar.getOpacity()});await settle();
   reveal(false,'hover');await settle();
  }
  record('repeated fades leave one visible window and zero stale animations',!bar.isVisible()&&panel.isVisible()&&await panel.webContents.executeJavaScript(`document.getAnimations().every(a=>a.effect?.target?.classList.contains('hero-face'))`));
  collapse(true);await sleep(30);reveal(false,'hover');collapse(true);await settle();record('rapid last request settles collapsed',collapsed&&!panel.isVisible()&&bar.isVisible());
  state.hiddenMoney=true;broadcast();await sleep(50);record('bar respects hidden income',await bar.webContents.executeJavaScript(`document.getElementById('collapsed-money').textContent==='¥••••'`));
  const font=await bar.webContents.executeJavaScript(`parseFloat(getComputedStyle(document.getElementById('collapsed-time')).fontSize)`);record('larger 14px numbers retained',font===14);
  reveal(false,'top');await settle();await action('motion-preference',true);collapse(true);await sleep(60);record('reduced motion settles promptly',!motion&&collapsed);await action('motion-preference',false);
  record('final focus still belongs to independent window',probe.isFocused());record('final independent hit test remains correct',outsideReachesProbe());
  fs.writeFileSync(reportPath,JSON.stringify({ok:true,checks,samples,scaleFactor:d.scaleFactor,hit:hit(),hitDiagnostics},null,2));
 }catch(e){fs.writeFileSync(reportPath,JSON.stringify({ok:false,error:e.message,checks,samples},null,2));process.exitCode=1;}
 finally{probe?.destroy();quitting=true;app.quit();}
}

if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>reveal(true,'restore'));
 app.whenReady().then(async()=>{
  app.setAppUserModelId('Payday.Desktop');core=await import(pathToFileURL(path.join(__dirname,'app/core.js')).href);storeFile=path.join(app.getPath('userData'),'payday.json');state=fresh();prefs={...defaults};
  try{if(fs.existsSync(storeFile)){const raw=JSON.parse(fs.readFileSync(storeFile,'utf8')),p=raw.prefs||{};state=core.validateState(raw.state);prefs={...defaults,floatBounds:validPosition(p.floatBounds)?{x:p.floatBounds.x,y:p.floatBounds.y}:null,theme:p.theme==='light'?'light':'dark',displayId:p.displayId,page:Number.isInteger(p.page)&&p.page>=0&&p.page<=3?p.page:0,pinned:p.uiVersion>=3?!!p.pinned:false,autoHide:p.uiVersion>=3?p.autoHide!==false:true};}}catch{readError='原文件无法读取，请导入备份恢复；本次不会覆盖原数据。';}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  function createWindow(title,bounds,focusable=true){
   const win=new BrowserWindow({title,...bounds,show:false,frame:false,thickFrame:false,hasShadow:false,resizable:false,focusable,alwaysOnTop:true,skipTaskbar:true,transparent:true,backgroundColor:'#00000000',icon:path.join(__dirname,'app/icon512.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
   win.setIgnoreMouseEvents(true,{forward:true});win.setOpacity(0);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
   win.on('close',e=>{if(!quitting){e.preventDefault();prefs.pinned=false;prefs.page=0;collapse(true);}});return win;
  }
  panel=createWindow('Payday · 下班倒计时',geometry().panel);bar=createWindow('Payday · 顶部信息条',geometry().handle,false);
  ipcMain.handle('init',e=>{trusted(e);return snapshot(e.sender);});
  ipcMain.handle('save',(e,c)=>{trusted(e);transact(()=>{state.config=core.validateConfig(c);state.configured=true;previous=null;});return snapshot(e.sender);});
  ipcMain.handle('action',async(e,n,v)=>{trusted(e);const r=await action(n,v);return r?.state?snapshot(e.sender):r;});
  await Promise.all([panel,bar].map(w=>w.loadFile(path.join(__dirname,'app/index.html'))));
  panel.on('will-move',()=>{if(motion||Date.now()<programmaticUntil)return;dragging=true;});
  panel.on('moved',()=>{if(!dragging)return;clearTimeout(moveTimer);moveTimer=setTimeout(()=>{dragging=false;rememberUserPosition(panel.getBounds());},160);});
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'app/icon192.png')).resize({width:20,height:20}));tray.setToolTip('下班倒计时 · Payday');tray.on('click',()=>reveal(true,'restore'));updateTray();
  globalShortcut.register('CommandOrControl+Alt+P',()=>{if(collapsed)reveal(true,'restore');else{prefs.page=0;prefs.pinned=false;collapse(true);}});
  const reset=()=>{previous=null;dragging=false;if(motion)finishMotion();collapsed?collapse(true):reveal();};screen.on('display-metrics-changed',reset);screen.on('display-removed',reset);powerMonitor.on('resume',reset);
  reveal(false,'restore');timer=setInterval(()=>poll(),60);setInterval(checkReminder,1000);
  if(selfTest)await nativeTest(path.resolve(selfTest.slice(12)));
 }).catch(e=>{dialog.showErrorBox('Payday 启动失败',e.message);app.quit();});
 app.on('before-quit',()=>{quitting=true;clearInterval(timer);clearTimeout(motionTimer);clearTimeout(moveTimer);globalShortcut.unregisterAll();});app.on('window-all-closed',()=>{if(quitting)app.quit();});
}
