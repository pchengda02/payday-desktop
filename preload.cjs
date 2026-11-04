const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('payday',{
  init:()=>ipcRenderer.invoke('init'),save:config=>ipcRenderer.invoke('save',config),
  action:(name,value)=>ipcRenderer.invoke('action',name,value),
  onFrame:callback=>{const listener=(_e,data)=>callback(data);ipcRenderer.on('frame',listener);return ()=>ipcRenderer.removeListener('frame',listener);},
  onUpdate:callback=>{const listener=(_e,data)=>callback(data);ipcRenderer.on('update',listener);return ()=>ipcRenderer.removeListener('update',listener);}
});
