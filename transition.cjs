// Monotonic ease-in-out opacity. Window rectangles never interpolate.
function fadeProgress(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
module.exports={fadeProgress};
