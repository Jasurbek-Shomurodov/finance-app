import test from 'node:test';
import assert from 'node:assert/strict';
import {clampViewport,minViewportSpan,panViewport,pointsInView,showsAll,zoomViewport} from '../lib/chart-viewport.ts';
const day=86_400_000,extent={start:0,end:100*day};
test('zooming keeps the day under the pointer in place and never zooms past two days or the whole history',()=>{
 const zoomed=zoomViewport(extent,extent,.25,.5);
 assert.deepEqual(zoomed,{start:12.5*day,end:62.5*day});
 // The anchor day (25) sits at the same fraction of the narrower view.
 assert.equal((25*day-zoomed.start)/(zoomed.end-zoomed.start),.25);
 assert.equal(zoomViewport(extent,extent,.5,.0001).end-zoomViewport(extent,extent,.5,.0001).start,minViewportSpan);
 assert.deepEqual(zoomViewport(zoomed,extent,.5,50),extent);
 // An anchor outside the plot (the pointer on an axis) counts as the nearest edge.
 assert.equal(zoomViewport(extent,extent,-3,.5).start,0);
});
test('panning moves through history and stops at both ends without changing the span',()=>{
 const view={start:40*day,end:60*day};
 assert.deepEqual(panViewport(view,extent,-10*day),{start:30*day,end:50*day});
 assert.deepEqual(panViewport(view,extent,-500*day),{start:0,end:20*day});
 assert.deepEqual(panViewport(view,extent,500*day),{start:80*day,end:100*day});
});
test('a view is kept inside the history, and a history shorter than two days is shown whole',()=>{
 assert.deepEqual(clampViewport({start:-5*day,end:200*day},extent),extent);
 const short={start:0,end:day};
 assert.deepEqual(clampViewport({start:0,end:day/4},short),short);
 assert.ok(showsAll(extent,extent));assert.ok(!showsAll({start:day,end:100*day},extent));
});
test('the drawn points are those in view plus one on each side, so lines reach the edges',()=>{
 const points=[0,10,20,30,40].map(at=>({timestamp:at*day,at}));
 assert.deepEqual(pointsInView(points,{start:15*day,end:25*day}).map(point=>point.at),[10,20,30]);
 // No point inside the view (a long gap): the two around it still draw the line across.
 assert.deepEqual(pointsInView(points,{start:21*day,end:29*day}).map(point=>point.at),[20,30]);
 assert.deepEqual(pointsInView(points,{start:0,end:40*day}).map(point=>point.at),[0,10,20,30,40]);
 assert.deepEqual(pointsInView(points,{start:50*day,end:60*day}).map(point=>point.at),[40]);
});
