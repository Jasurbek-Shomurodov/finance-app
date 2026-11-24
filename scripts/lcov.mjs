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

/** One lcov report from several (the CI shards). Entries for the same file with the same functions and branches add
 * their counts; a file whose copies differ in shape (a copy loaded through tests/helpers/load-ts.mjs) keeps each copy,
 * and lcovFiles combines those as it does within one report. Totals are counted again from the merged counts. */
export function mergeLcov(reports){
 const entries=new Map();
 for(const report of reports)for(const record of report.split('end_of_record')){
  const file=/^SF:(.*)$/m.exec(record)?.[1];
  if(!file)continue;
  const functions=[...record.matchAll(/^FN:([^,\n]*),(.*)$/gm)].map(match=>[match[1],match[2]]);
  const calls=new Map([...record.matchAll(/^FNDA:(\d+),(.*)$/gm)].map(match=>[match[2],Number(match[1])]));
  const branches=new Map([...record.matchAll(/^BRDA:([^,\n]+,[^,\n]+,[^,\n]+),(\S+)$/gm)].map(match=>[match[1],match[2]==='-'?0:Number(match[2])]));
  const lines=new Map([...record.matchAll(/^DA:(\d+),(\d+)/gm)].map(match=>[match[1],Number(match[2])]));
  const key=[file,functions.map(([,name])=>name).join(','),[...branches.keys()].join(';')].join('\n');
  const seen=entries.get(key);
  if(!seen){entries.set(key,{file,functions,calls,branches,lines});continue;}
  for(const [counts,more] of [[seen.calls,calls],[seen.branches,branches],[seen.lines,lines]])
   for(const [id,count] of more)counts.set(id,(counts.get(id)??0)+count);
 }
 return [...entries.values()].map(({file,functions,calls,branches,lines})=>{
  const hit=map=>[...map.values()].filter(count=>count>0).length;
  return [`SF:${file}`,...functions.map(([line,name])=>`FN:${line},${name}`),...functions.map(([,name])=>`FNDA:${calls.get(name)??0},${name}`),
   `FNF:${functions.length}`,`FNH:${functions.filter(([,name])=>(calls.get(name)??0)>0).length}`,
   ...[...branches].map(([id,count])=>`BRDA:${id},${count}`),`BRF:${branches.size}`,`BRH:${hit(branches)}`,
   ...[...lines].map(([line,count])=>`DA:${line},${count}`),`LH:${hit(lines)}`,`LF:${lines.size}`,'end_of_record'].join('\n');
 }).join('\n')+'\n';
}
