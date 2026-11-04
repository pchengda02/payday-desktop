// Keep the native canvas fixed through preparation, animation and commit.
function motionPlan(from,to,fromCollapsed,toCollapsed,id,canvas=null){
 const x=Math.min(from.x,to.x),y=Math.min(from.y,to.y);
 const distance=Math.hypot(from.x+from.width/2-to.x-to.width/2,from.y-to.y);
 const region={x,y,width:Math.max(from.x+from.width,to.x+to.width)-x,height:Math.max(from.y+from.height,to.y+to.height)-y};
 return {id,from,to,fromCollapsed,toCollapsed,stage:'prepare',duration:toCollapsed?(distance>180?400:320):360,canvas:canvas||region,region};
}
module.exports={motionPlan};
