const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const COMPACT={width:560,height:180},SETTINGS={width:368,height:560},TAB={width:320,height:48};
function validPosition(position){return !!position&&Number.isFinite(position.x)&&Number.isFinite(position.y);}
function layout(area,{settings=false,position=null,screen=area}={}){
 const size=settings?SETTINGS:COMPACT,width=Math.min(size.width,area.width-16),height=Math.min(size.height,area.height-16);
 const barWidth=Math.min(TAB.width,area.width-16),center=screen.x+screen.width/2;
 const top=Math.max(screen.y,area.y);
 return {panel:{x:Math.round(clamp(validPosition(position)?position.x:center-width/2,area.x,area.x+area.width-width)),y:Math.round(clamp(validPosition(position)?position.y:top,area.y,area.y+area.height-height)),width,height},handle:{x:Math.round(clamp(center-barWidth/2,area.x,area.x+area.width-barWidth)),y:top,width:barWidth,height:TAB.height}};
}
function inside(p,r,pad=0){return p.x>=r.x-pad&&p.x<r.x+r.width+pad&&p.y>=r.y-pad&&p.y<r.y+r.height+pad;}
function hoverDecision({cursor,panel,expanded,pinned,autoHide,busy,arranging,lastInside,now}){
 if(!expanded)return {action:inside(cursor,panel)?'reveal':'none',lastInside};
 if(inside(cursor,panel,2)||pinned||!autoHide||busy||arranging)return {action:'none',lastInside:now};
 return {action:now-lastInside>=650?'collapse':'none',lastInside};
}
module.exports={layout,inside,clamp,hoverDecision,validPosition,COMPACT,SETTINGS,TAB};
