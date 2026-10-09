export type Point={x:number,y:number};
export type Viewport={zoom:number,x:number,y:number};
export const defaultViewport:Viewport={zoom:1,x:0,y:0};
export function boundViewport(v:Viewport):Viewport{const zoom=Math.min(8,Math.max(1,v.zoom));return {zoom,x:Math.min(0,Math.max(640*(1-zoom),v.x)),y:Math.min(0,Math.max(430*(1-zoom),v.y))};}
export function zoomAt(v:Viewport,factor:number,anchor:Point={x:320,y:215}):Viewport{const zoom=Math.min(8,Math.max(1,v.zoom*factor)),ratio=zoom/v.zoom;return boundViewport({zoom,x:anchor.x-(anchor.x-v.x)*ratio,y:anchor.y-(anchor.y-v.y)*ratio});}
export function pinchViewport(v:Viewport,from:Point,to:Point,factor:number):Viewport{const zoom=Math.min(8,Math.max(1,v.zoom*factor)),ratio=zoom/v.zoom;return boundViewport({zoom,x:to.x-(from.x-v.x)*ratio,y:to.y-(from.y-v.y)*ratio});}
