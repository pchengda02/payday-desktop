const {app,BrowserWindow,ipcMain,screen,Tray,Menu,nativeImage,globalShortcut,dialog,Notification,powerMonitor,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {layout,validPosition,hoverDecision}=require('./geometry.cjs');
const {motionPlan}=require('./motion.cjs');
app.disableHardwareAcceleration();
const customData=process.argv.find(x=>x.startsWith('--data-dir='));if(customData)app.setPath('userData',path.resolve(customData.slice(11)));
const selfTest=process.argv.find(x=>x.startsWith('--self-test='));
let panel,tray,core,state,prefs,storeFile,collapsed=false,busy=false,quitting=false,dragging=false,moveUntil=0,lastInside=0,moveTimer,previous=null,readError='',timer,anchor='top',reminded=new Set();
let motion=null,motionTimer,motionId=0,queuedMove=null;
const defaults={uiVersion:3,floatBounds:null,pinned:false,autoHide:true,theme:'dark',page:0,displayId:null};
function fresh(){return {schema:1,config:core.clone(core.DEFAULTS),breaks:[],activeBreak:null,configured:false,hiddenMoney:false};}
function persist(){fs.mkdirSync(path.dirname(storeFile),{recursive:true});fs.writeFileSync(storeFile+'.tmp',JSON.stringify({state,prefs},null,2));fs.renameSync(storeFile+'.tmp',storeFile);}
function snapshot(){return {state,prefs:{...prefs,mode:'floating',anchor},readError,collapsed,motion};}
function broadcast(){if(panel&&!panel.isDestroyed())panel.webContents.send('update',snapshot());}
function transact(run){const oldState=core.clone(state),oldPrefs={...prefs};try{run();if(readError){if(JSON.stringify(state)!==JSON.stringify(oldState))throw Error('原数据读取失败，请先导入有效备份。');}else persist();broadcast();return snapshot();}catch(e){state=oldState;prefs=oldPrefs;throw e;}}
function display(){return screen.getAllDisplays().find(d=>d.id===prefs.displayId)||screen.getPrimaryDisplay();}
function geometry(){const d=display();return layout(d.workArea,{screen:d.bounds,settings:prefs.page===3,position:anchor==='free'?prefs.floatBounds:null});}
function setBounds(bounds){moveUntil=Date.now()+350;panel.setBounds(bounds,false);}
function finishMotion(id){
 if(!motion||motion.id!==id)return;clearTimeout(motionTimer);const target=motion.to;motion=null;
 setBounds(target);lastInside=Date.now();broadcast();
 const next=queuedMove;queuedMove=null;if(next)moveTo(next.bounds,next.nextCollapsed,next.focus);
}
function moveTo(bounds,nextCollapsed,focus=false){
 if(motion){queuedMove={bounds,nextCollapsed,focus};return;}
 const from=panel.getBounds(),wasCollapsed=collapsed;collapsed=nextCollapsed;lastInside=Date.now();
 if(panel.isVisible()&&wasCollapsed!==nextCollapsed){
  dragging=false;clearTimeout(moveTimer);motion=motionPlan(from,bounds,wasCollapsed,nextCollapsed,++motionId);
  // Let the renderer freeze its layout before enlarging the transparent canvas.
  motionTimer=setTimeout(()=>finishMotion(motion?.id),1600);broadcast();
 }else{setBounds(bounds);broadcast();}
 if(focus){panel.show();panel.focus();}else panel.showInactive();
}
function reveal(focus=false,source='current'){if(!panel)return;if(source==='hover'||source==='top')anchor='top';else if(source==='restore')anchor=validPosition(prefs.floatBounds)?'free':'top';moveTo(geometry().panel,false,focus);}
function collapse(force=false){if(busy||(!force&&(prefs.pinned||!prefs.autoHide||prefs.page===3)))return;dragging=false;moveTo(geometry().handle,true);}
function rememberUserPosition(bounds){const d=screen.getDisplayMatching(bounds);anchor='free';transact(()=>{prefs.displayId=d.id;prefs.floatBounds={x:bounds.x,y:bounds.y};});lastInside=Date.now();}
function poll(now=Date.now(),cursor=screen.getCursorScreenPoint()){
 if(!panel||panel.isDestroyed())return;
 if(motion){lastInside=now;return;}
 const decision=hoverDecision({cursor,panel:panel.getBounds(),expanded:!collapsed,pinned:prefs.pinned,autoHide:prefs.autoHide,busy:busy||prefs.page===3,arranging:!!motion||dragging||now<moveUntil,lastInside,now});
 lastInside=decision.lastInside;if(decision.action==='reveal')reveal(false,'hover');else if(decision.action==='collapse')collapse();
}
function updateTray(){tray?.setContextMenu(Menu.buildFromTemplate([{label:'回到上次拖放位置',click:()=>reveal(true,'restore')},{label:'从顶部展开',click:()=>reveal(true,'top')},{label:'固定展开',type:'checkbox',checked:prefs.pinned,click:i=>{transact(()=>{prefs.pinned=i.checked;});reveal(true);updateTray();}},{type:'separator'},{label:'设置',click:()=>{transact(()=>{prefs.page=3;});reveal(true);}},{type:'separator'},{label:'退出 Payday',click:()=>{quitting=true;app.quit();}}]));}
function checkReminder(){const now=new Date(),s=core.compute(state.config,now),target=+s.end-state.config.remindBefore*60000,key=s.shiftKey+':'+state.config.remindBefore;if(state.config.remindEnabled&&previous&&previous<target&&+now>=target&&+now-target<60000&&s.work&&!reminded.has(key)){reminded.add(key);new Notification({title:state.config.remindBefore?`还有 ${state.config.remindBefore} 分钟下班`:'下班啦',body:'今天辛苦了。',silent:!state.config.remindSound,icon:path.join(__dirname,'app/icon192.png')}).show();}previous=+now;}
function trusted(e){if(panel?.webContents!==e.sender)throw Error('不允许的窗口请求');}
async function action(name,value){
 if(name==='motion-ready'){
  if(motion?.id===value&&motion.stage==='prepare'){
   clearTimeout(motionTimer);setBounds(motion.canvas);motion.stage='run';broadcast();
   const id=motion.id;motionTimer=setTimeout(()=>finishMotion(id),motion.duration+900);
  }return {};
 }
 if(name==='motion-done'){finishMotion(value);return {};}
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
 clearInterval(timer);const checks=[],record=(name,pass)=>{checks.push({name,pass,bounds:panel.getBounds(),collapsed,pinned:prefs.pinned,page:prefs.page,anchor,floatBounds:prefs.floatBounds});if(!pass)throw Error(name);},sleep=ms=>new Promise(r=>setTimeout(r,ms)),pause=async()=>{const start=Date.now();while(motion||queuedMove){if(Date.now()-start>3000)throw Error('animation did not settle');await sleep(25);}await sleep(120);},capture=async name=>{await pause();fs.writeFileSync(reportPath.replace(/\.json$/, '-'+name+'.png'),(await panel.webContents.capturePage()).toPNG());};
 try{
  prefs.page=0;prefs.pinned=false;prefs.autoHide=true;reveal(true,'top');await pause();
  record('expanded native window',Math.abs(panel.getBounds().width-560)<=3&&Math.abs(panel.getBounds().height-180)<=3);await capture('dark');
  const a=display().workArea,screenBounds=display().bounds,position={x:Math.round(a.x+(a.width-560)*.31),y:Math.round(a.y+(a.height-180)*.43)};
  setBounds({...geometry().panel,...position});await pause();rememberUserPosition(panel.getBounds());const saved={...prefs.floatBounds};
  await action('page',1);await pause();record('page switching keeps freely placed position',Math.abs(panel.getBounds().x-saved.x)<=2&&Math.abs(panel.getBounds().y-saved.y)<=2);
  record('free position is saved to disk',JSON.parse(fs.readFileSync(storeFile,'utf8')).prefs.floatBounds.x===saved.x);
  await action('page',0);moveUntil=0;lastInside=Date.now()-1000;poll(Date.now(),{x:a.x+3,y:a.y+a.height-3});
  const collapsingId=motion?.id;poll(Date.now(),{x:position.x+15,y:position.y+10});record('hover polling cannot reverse active collapse',motion?.id===collapsingId&&!queuedMove);
  await sleep(110);const mid=await panel.webContents.executeJavaScript(`(()=>{const s=document.querySelector('#motion-shell');return {reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,running:s.getAnimations().some(a=>a.playState==='running'),width:s.getBoundingClientRect().width,body:document.body.classList.contains('window-motion')};})()`);
  record('collapse has an intermediate animated surface',mid.reduced||(!!motion&&mid.running&&mid.body&&mid.width>320&&mid.width<560));
  fs.writeFileSync(reportPath.replace(/\.json$/, '-motion-mid.png'),(await panel.webContents.capturePage()).toPNG());await pause();
  const bar=panel.getBounds();record('leave shrinks to 320x48 top bar',collapsed&&Math.abs(bar.width-320)<=3&&Math.abs(bar.height-48)<=3);
  record('bar centered at top of active screen',Math.abs(bar.x+bar.width/2-screenBounds.x-screenBounds.width/2)<=2&&Math.abs(bar.y-Math.max(a.y,screenBounds.y))<=2);await capture('collapsed');
  poll(Date.now(),{x:bar.x+bar.width/2,y:bar.y+12});await pause();record('hover expands beneath top bar',!collapsed&&anchor==='top'&&Math.abs(panel.getBounds().y-bar.y)<=2);await capture('expanded');
  record('hover does not overwrite saved free position',prefs.floatBounds.x===saved.x&&prefs.floatBounds.y===saved.y);
  record('motion canvas and animations cleaned up',!motion&&!await panel.webContents.executeJavaScript(`document.body.classList.contains('window-motion')`));
  await action('reveal');await pause();record('tray or shortcut restore free position',anchor==='free'&&Math.abs(panel.getBounds().x-saved.x)<=2&&Math.abs(panel.getBounds().y-saved.y)<=2);
  prefs.pinned=true;moveUntil=0;lastInside=Date.now()-1000;poll(Date.now(),{x:a.x+3,y:a.y+a.height-3});record('pin prevents collapse',!collapsed);prefs.pinned=false;
  await action('page',1);await action('theme');await capture('income-light');await action('theme');await capture('income-dark');await action('page',2);await capture('rest-dark');record('income and break navigation',prefs.page===2);
  await action('page',3);await pause();record('settings expands separately',Math.abs(panel.getBounds().width-368)<=3);await action('page',0);await pause();record('return from settings preserves free position',Math.abs(panel.getBounds().width-560)<=3&&Math.abs(panel.getBounds().x-saved.x)<=2&&Math.abs(panel.getBounds().y-saved.y)<=2);
  state.hiddenMoney=true;broadcast();collapse(true);await capture('collapsed-private');record('manual collapse uses top bar',collapsed&&Math.abs(panel.getBounds().width-320)<=3);
  reveal(false,'hover');await sleep(50);collapse(true);await pause();record('rapid reverse request settles in requested state',collapsed&&!motion&&Math.abs(panel.getBounds().width-320)<=3);
  reveal(false,'hover');await pause();
  panel.webContents.debugger.attach('1.3');await panel.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  collapse(true);await pause();record('reduced motion reaches final bar and clears surfaces',collapsed&&!motion&&!await panel.webContents.executeJavaScript(`document.body.classList.contains('window-motion')`));panel.webContents.debugger.detach();
  fs.writeFileSync(reportPath,JSON.stringify({ok:true,checks,scaleFactor:display().scaleFactor},null,2));
 }catch(e){fs.writeFileSync(reportPath,JSON.stringify({ok:false,error:e.message,checks},null,2));process.exitCode=1;}
 finally{quitting=true;app.quit();}
}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>reveal(true,'restore'));
 app.whenReady().then(async()=>{
  app.setAppUserModelId('Payday.Desktop');core=await import(pathToFileURL(path.join(__dirname,'app/core.js')).href);storeFile=path.join(app.getPath('userData'),'payday.json');state=fresh();prefs={...defaults};
  try{if(fs.existsSync(storeFile)){const raw=JSON.parse(fs.readFileSync(storeFile,'utf8')),p=raw.prefs||{};state=core.validateState(raw.state);prefs={...defaults,floatBounds:validPosition(p.floatBounds)?{x:p.floatBounds.x,y:p.floatBounds.y}:null,theme:p.theme==='light'?'light':'dark',displayId:p.displayId,page:Number.isInteger(p.page)&&p.page>=0&&p.page<=3?p.page:0,pinned:p.uiVersion>=3?!!p.pinned:false,autoHide:p.uiVersion>=3?p.autoHide!==false:true};}}catch{readError='原文件无法读取，请导入备份恢复；本次不会覆盖原数据。';}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_d,cb)=>cb({cancel:true}));
  panel=new BrowserWindow({title:'Payday · 下班倒计时',width:560,height:180,show:false,frame:false,thickFrame:false,hasShadow:false,minWidth:1,minHeight:1,resizable:false,alwaysOnTop:true,skipTaskbar:true,transparent:true,backgroundColor:'#00000000',icon:path.join(__dirname,'app/icon512.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  panel.webContents.setWindowOpenHandler(()=>({action:'deny'}));panel.webContents.on('will-navigate',e=>e.preventDefault());session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  ipcMain.handle('init',e=>{trusted(e);return snapshot();});ipcMain.handle('save',(e,c)=>{trusted(e);return transact(()=>{state.config=core.validateConfig(c);state.configured=true;previous=null;});});ipcMain.handle('action',(e,n,v)=>{trusted(e);return action(n,v);});
  await panel.loadFile(path.join(__dirname,'app/index.html'));
  panel.on('close',e=>{if(!quitting){e.preventDefault();prefs.pinned=false;prefs.page=0;collapse(true);}});
  panel.on('will-move',()=>{if(motion||Date.now()<moveUntil||collapsed)return;dragging=true;anchor='free';});
  panel.on('moved',()=>{if(!dragging)return;clearTimeout(moveTimer);moveTimer=setTimeout(()=>{dragging=false;rememberUserPosition(panel.getBounds());},200);});
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'app/icon192.png')).resize({width:20,height:20}));tray.setToolTip('下班倒计时 · Payday');tray.on('click',()=>reveal(true,'restore'));updateTray();
  globalShortcut.register('CommandOrControl+Alt+P',()=>{if(collapsed)reveal(true,'restore');else{prefs.page=0;prefs.pinned=false;collapse(true);}});
  const reset=()=>{previous=null;dragging=false;collapsed?collapse(true):reveal();};screen.on('display-metrics-changed',reset);screen.on('display-removed',reset);powerMonitor.on('resume',reset);
  reveal(true,'restore');timer=setInterval(()=>poll(),80);setInterval(checkReminder,1000);
  if(selfTest)await nativeTest(path.resolve(selfTest.slice(12)));
 }).catch(e=>{dialog.showErrorBox('Payday 启动失败',e.message);app.quit();});
 app.on('before-quit',()=>{quitting=true;clearInterval(timer);clearTimeout(motionTimer);globalShortcut.unregisterAll();});app.on('window-all-closed',()=>{if(quitting)app.quit();});
}
