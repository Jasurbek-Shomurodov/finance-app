// Round value-axis ticks (1, 2, 2.5 or 5 × 10ⁿ). The axis never dips below zero
// for non-negative data, so money charts do not show impossible negative ticks.
// Steps are whole amounts: money totals never show decimal ticks such as 0.3.
export function niceAxis(values:readonly number[],count=5):{domain:[number,number];ticks:number[]}{
 const finite=values.filter(Number.isFinite);
 let min=finite.length?Math.min(...finite):0,max=finite.length?Math.max(...finite):1;
 // Floating-point noise is not a range: a step that small can never advance a tick.
 if(max-min<=Math.max(Math.abs(min),Math.abs(max))*1e-9)max=min;
 if(min>=0)min=Math.min(min,Math.max(0,min-(max-min)*.1));
 if(max===min){const pad=Math.max(Math.abs(max)*.1,1);max+=pad;min=min>=0?Math.max(0,min-pad):min-pad;}
 const rough=(max-min)/Math.max(1,count-1),magnitude=10**Math.floor(Math.log10(rough));
 const step=Math.max(1,[1,2,2.5,5,10].map(factor=>factor*magnitude).find(candidate=>candidate>=rough)!);
 const start=Math.floor(min/step)*step,end=Math.ceil(max/step)*step;
 const ticks:number[]=[];
 const steps=Math.round((end-start)/step);
 for(let index=0;index<=steps;index++)ticks.push(Number((start+index*step).toPrecision(12)));
 return {domain:[ticks[0],ticks.at(-1)!],ticks};
}

// Where each line's end label sits on the value axis: at its last value, pushed apart so no two are closer than
// `gap` (a value distance), and kept inside the axis. Labels keep the order of their values.
export function spreadLabels<T extends {value:number}>(items:readonly T[],domain:[number,number],gap:number):(T&{at:number})[]{
 const sorted=[...items].sort((a,b)=>b.value-a.value).map(item=>({...item,at:Math.min(domain[1],Math.max(domain[0],item.value))}));
 for(let index=1;index<sorted.length;index++)sorted[index].at=Math.min(sorted[index].at,sorted[index-1].at-gap);
 const last=sorted.length-1;
 if(last>=0&&sorted[last].at<domain[0]){
  sorted[last].at=domain[0];
  for(let index=last-1;index>=0;index--)sorted[index].at=Math.max(sorted[index].at,sorted[index+1].at+gap);
 }
 return sorted;
}
