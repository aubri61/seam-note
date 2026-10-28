export interface DiffRow { left?:string; right?:string; leftNumber?:number; rightNumber?:number; changed:boolean }
export interface DiffResult { rows:DiffRow[]; blocks:number[]; coarse:boolean }
/** Bounded LCS after common prefix/suffix. Large fully changed regions use coarse line pairing. */
export function lineDiff(left:string,right:string):DiffResult {
  const a=left.split('\n'),b=right.split('\n'),rows:DiffRow[]=[]
  let prefix=0,suffix=0
  while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++
  const add=(i:number|undefined,j:number|undefined,changed:boolean)=>rows.push({left:i===undefined?undefined:a[i],right:j===undefined?undefined:b[j],leftNumber:i===undefined?undefined:i+1,rightNumber:j===undefined?undefined:j+1,changed})
  for(let i=0;i<prefix;i++)add(i,i,false)
  const n=a.length-prefix-suffix,m=b.length-prefix-suffix,coarse=(n+1)*(m+1)>200_000
  if(coarse)for(let i=0;i<Math.max(n,m);i++)add(i<n?prefix+i:undefined,i<m?prefix+i:undefined,true)
  else {
    const dp=new Uint32Array((n+1)*(m+1)),width=m+1
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i*width+j]=a[prefix+i]===b[prefix+j]?dp[(i+1)*width+j+1]+1:Math.max(dp[(i+1)*width+j],dp[i*width+j+1])
    let i=0,j=0,deletes:number[]=[],inserts:number[]=[]
    const flush=()=>{for(let k=0;k<Math.max(deletes.length,inserts.length);k++)add(deletes[k],inserts[k],true);deletes=[];inserts=[]}
    while(i<n||j<m){
      if(i<n&&j<m&&a[prefix+i]===b[prefix+j]){flush();add(prefix+i++,prefix+j++,false)}
      else if(i<n&&(j===m||dp[(i+1)*width+j]>=dp[i*width+j+1]))deletes.push(prefix+i++)
      else inserts.push(prefix+j++)
    }
    flush()
  }
  for(let i=suffix;i>0;i--)add(a.length-i,b.length-i,false)
  return {rows,coarse,blocks:rows.flatMap((row,i)=>row.changed&&(i===0||!rows[i-1].changed)?[i]:[])}
}
/** Read-only character-range emphasis; no claim of word-level semantic merging. */
export function changedRange(value:string,other:string) {
  if(value===other)return {before:value,change:'',after:''}
  if(value.length>10_000||other.length>10_000)return {before:'',change:value,after:''}
  const a=Array.from(value),b=Array.from(other);let p=0,s=0
  while(p<a.length&&p<b.length&&a[p]===b[p])p++
  while(s<a.length-p&&s<b.length-p&&a[a.length-1-s]===b[b.length-1-s])s++
  return {before:a.slice(0,p).join(''),change:a.slice(p,a.length-s).join(''),after:s?a.slice(a.length-s).join(''):''}
}
