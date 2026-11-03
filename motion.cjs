// A temporary transparent canvas keeps both endpoints visible while Chromium
// animates the surfaces. Resize the native window only at the two endpoints.
function motionPlan(from,to,fromCollapsed,toCollapsed,id){
 const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y);
 const distance=Math.hypot(from.x+from.width/2-to.x-to.width/2,from.y-to.y);
 return {id,from,to,fromCollapsed,toCollapsed,stage:'prepare',duration:toCollapsed?(distance>180?460:360):400,
  canvas:{x,y,width:Math.max(from.x+from.width,to.x+to.width)-x,height:Math.max(from.y+from.height,to.y+to.height)-y}};
}
module.exports={motionPlan};
