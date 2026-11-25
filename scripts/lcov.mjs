/** Per-file coverage from an lcov report. A file the tests load both directly and through tests/helpers/load-ts.mjs
 * appears twice; its entries are combined: a line counts as run when either copy ran it, and branches and functions
 * take the better of the two copies (their numbering differs between copies, so they cannot be matched one by one). */
export function lcovFiles(report,root){
 const files=new Map();
 for(const record of report.split('end_of_record')){
  const file=/^SF:(.*)$/m.exec(record)?.[1]?.replace(root,'');
  if(!file)continue;
  const lines=new Map([...record.matchAll(/^DA:(\d+),(\d+)/gm)].map(match=>[match[1],Number(match[2])>0]));
  const count=(found,hit)=>({found:Number(new RegExp(`^${found}:(\\d+)`,'m').exec(record)?.[1]??0),hit:Number(new RegExp(`^${hit}:(\\d+)`,'m').exec(record)?.[1]??0)});
  const entry={lines,branches:count('BRF','BRH'),functions:count('FNF','FNH')};
  const seen=files.get(file);
  if(!seen){files.set(file,entry);continue;}
  for(const [line,ran] of lines)seen.lines.set(line,seen.lines.get(line)||ran);
  for(const key of ['branches','functions'])if(rate(entry[key])>rate(seen[key]))seen[key]=entry[key];
 }
 return files;
}
export function rate({found,hit}){return found?hit/found:1;}
export function totals(files){
 const sum={lines:{found:0,hit:0},branches:{found:0,hit:0},functions:{found:0,hit:0}};
 for(const {lines,branches,functions} of files.values()){
  sum.lines.found+=lines.size;sum.lines.hit+=[...lines.values()].filter(Boolean).length;
  for(const [key,value] of [['branches',branches],['functions',functions]]){sum[key].found+=value.found;sum[key].hit+=value.hit;}
 }
 return sum;
}
export function percent({found,hit}){return found?hit/found*100:100;}

/** One lcov report from several (the CI shards). Each shard measures only the code its own tests ran, so the copies of
 * a file differ in shape: anonymous functions are numbered differently and branches inside functions a shard never
 * called are missing. The copies are combined per line instead: lines add their counts; a function is matched by its
 * line and name (an anonymous one by its place among the anonymous functions on that line) and counts as run when any
 * copy ran it; the branches on a line are matched in order and add their counts. A file loaded both directly and
 * through tests/helpers/load-ts.mjs has two copies whose functions sit on different lines; those stay apart (matched
 * by the lines of their named functions) and lcovFiles takes the better one. Totals are counted again. */
export function mergeLcov(reports){
 const files=new Map();
 for(const report of reports)for(const record of report.split('end_of_record')){
  const file=/^SF:(.*)$/m.exec(record)?.[1];
  if(!file)continue;
  const declared=[...record.matchAll(/^FN:([^,\n]*),(.*)$/gm)].map(([,line,name])=>[line,name]);
  const named=new Map(declared.filter(([,name])=>!/^anonymous_\d+$/.test(name)).map(([line,name])=>[name,line]));
  if(!files.has(file))files.set(file,[]);
  const copies=files.get(file);
  const fits=copy=>{let shared=0;for(const [name,line] of named)if(copy.named.has(name)){if(copy.named.get(name)!==line)return false;shared++;}return shared>0||!named.size||!copy.named.size;};
  let entry=copies.find(fits);
  if(!entry){entry={named:new Map(),functions:new Map(),branches:new Map(),lines:new Map()};copies.push(entry);}
  for(const [name,line] of named)entry.named.set(name,line);
  const calls=new Map([...record.matchAll(/^FNDA:(\d+),(.*)$/gm)].map(match=>[match[2],Number(match[1])]));
  const anonymous=new Map();
  for(const [line,name] of declared){
   const place=/^anonymous_\d+$/.test(name)?anonymous.set(line,(anonymous.get(line)??0)+1).get(line):0;
   const key=`${line}\n${place?`#${place}`:name}`;
   entry.functions.set(key,(entry.functions.get(key)??0)+(calls.get(name)??0));
  }
  const onLine=new Map();
  for(const [,line,count] of record.matchAll(/^BRDA:([^,\n]+),[^,\n]+,[^,\n]+,(\S+)$/gm)){
   if(!onLine.has(line))onLine.set(line,[]);
   onLine.get(line).push(count==='-'?0:Number(count));
  }
  for(const [line,counts] of onLine){
   const seen=entry.branches.get(line)??[];
   entry.branches.set(line,counts.length>seen.length?counts.map((count,i)=>count+(seen[i]??0)):seen.map((count,i)=>count+(counts[i]??0)));
  }
  for(const [,line,count] of record.matchAll(/^DA:(\d+),(\d+)/gm))entry.lines.set(line,(entry.lines.get(line)??0)+Number(count));
 }
 return [...files].flatMap(([file,copies])=>copies.map(({functions,branches,lines})=>{
  const named=[...functions].map(([key,count],i)=>{const [line,name]=key.split('\n');return [line,name.startsWith('#')?`anonymous_${i}`:name,count];});
  const brda=[...branches].flatMap(([line,counts])=>counts.map(count=>[line,count])).map(([line,count],block)=>`BRDA:${line},${block},0,${count}`);
  const hit=values=>values.filter(count=>count>0).length;
  return [`SF:${file}`,...named.map(([line,name])=>`FN:${line},${name}`),...named.map(([,name,count])=>`FNDA:${count},${name}`),
   `FNF:${named.length}`,`FNH:${hit(named.map(([,,count])=>count))}`,
   ...brda,`BRF:${brda.length}`,`BRH:${hit([...branches.values()].flat())}`,
   ...[...lines].map(([line,count])=>`DA:${line},${count}`),`LH:${hit([...lines.values()])}`,`LF:${lines.size}`,'end_of_record'].join('\n');
 })).join('\n')+'\n';
}
