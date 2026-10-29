import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import styled from '@emotion/styled'
import { useTheme } from '@emotion/react'
import { documentText } from '@/features/notes/richTextDocument'
import { changedRange } from './lineDiff'
import type { DiffResult } from './lineDiff'
const Panels=styled.div(({theme})=>({display:'grid',gridTemplateColumns:'1fr 1fr',gap:theme.spacing.md,minWidth:0,[`@media(max-width:${theme.breakpoints.mobile})`]:{gridTemplateColumns:'1fr'}}))
const Scroll=styled.div(({theme})=>({maxHeight:'36vh',overflow:'auto',background:theme.colors.background,position:'relative',font:'13px/24px ui-monospace,monospace',outlineOffset:2,[`@media(max-width:${theme.breakpoints.mobile})`]:{maxHeight:'25vh'}}))
function Range({value,other,changed}:{value:string;other:string;changed:boolean}) {
  const theme=useTheme()
  if(!changed)return <>{value}</>
  const range=changedRange(value,other)
  return <>{range.before}<mark style={{background:theme.colors.diffEmphasis,color:'inherit'}}>{range.change}</mark>{range.after}</>
}
export function DiffView({left,right,leftLabel,rightLabel,leftTitle,rightTitle,leftAction,rightAction,onReady}:{left:string;right:string;leftLabel:string;rightLabel:string;leftTitle?:string;rightTitle?:string;leftAction?:ReactNode;rightAction?:ReactNode;onReady:()=>void}) {
  const theme=useTheme()
  const comparison=useMemo(()=>{try{return {left:documentText(left,true),right:documentText(right,true),error:''}}catch(cause){return {left:'',right:'',error:(cause as Error).message}}},[left,right])
  const [result,setResult]=useState<{left:string;right:string;data:DiffResult}|null>(null),[error,setError]=useState(''),[top,setTop]=useState(0)
  const l=useRef<HTMLDivElement>(null),r=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(comparison.error)return
    let active=true
    const worker=new Worker(new URL('./diffWorker.ts',import.meta.url),{type:'module'})
    worker.onmessage=event=>{if(active){setResult({left,right,data:event.data});setError('');onReady()}}
    worker.onerror=()=>{if(active)setError('차이를 계산하지 못했습니다. 버전을 선택하지 않고 입력을 보관한 뒤 다시 비교해주세요.')}
    worker.postMessage({left:comparison.left,right:comparison.right})
    return()=>{active=false;worker.terminate()}
  },[left,right,onReady,comparison])
  const data=result?.left===left&&result.right===right?result.data:null
  const start=Math.max(0,Math.floor(top/24)-8),end=Math.min(data?.rows.length??0,start+90)
  const scroll=(value:number)=>{setTop(value);for(const ref of [l,r])if(ref.current&&Math.abs(ref.current.scrollTop-value)>1)ref.current.scrollTop=value}

  if(comparison.error)return <p role="alert">{comparison.error}</p>
  if(error)return <p role="alert">{error}</p>
  if(!data)return <p role="status">원고 차이 계산 중</p>
  return <>
    <p>본문의 굵게는 **표기**, 기울임은 _표기_, 목록은 기호로 비교합니다.</p>
    {left!==right&&comparison.left===comparison.right&&<p role="status">본문 문장은 같지만 서식 또는 문서 구조가 다릅니다.</p>}
    <Panels>{(['left','right'] as const).map((side,index)=><section key={side} style={{minWidth:0}}>
      <h3>{index?rightLabel:leftLabel}</h3>
      <div aria-label={`${index?rightLabel:leftLabel} 제목 비교`} style={{padding:12,marginBottom:16,borderRadius:theme.radii.sm,background:leftTitle!==rightTitle?(index?theme.colors.diffAdded:theme.colors.diffRemoved):theme.colors.background}}>
        <span style={{fontSize:12,color:theme.colors.mutedText}}>제목{leftTitle!==rightTitle?' · 변경됨':''}</span>
        <p style={{whiteSpace:'pre-wrap',minHeight:24,fontSize:20,fontWeight:600,margin:'8px 0 0'}}><Range value={(index?rightTitle:leftTitle)||'제목 없음'} other={(index?leftTitle:rightTitle)||'제목 없음'} changed={leftTitle!==rightTitle}/></p>
      </div>
      <Scroll style={{height:Math.max(72,Math.min(320,data.rows.length*24))}} ref={index?r:l} tabIndex={0} aria-label={`${index?rightLabel:leftLabel} 본문 비교`} onScroll={event=>scroll(event.currentTarget.scrollTop)}>
        <div style={{height:data.rows.length*24,position:'relative'}}>
          {data.rows.slice(start,end).map((row,offset)=><div key={start+offset} data-diff-row style={{position:'absolute',top:(start+offset)*24,minWidth:'100%',whiteSpace:'pre',height:24,background:row.changed?(index?theme.colors.diffAdded:theme.colors.diffRemoved):'transparent'}}>
            <span aria-hidden style={{display:'inline-block',width:52,textAlign:'right',paddingRight:12,color:theme.colors.secondary}}>{index?row.rightNumber:row.leftNumber}</span>
            <Range value={row[side]??''} other={row[index?'left':'right']??''} changed={row.changed}/>
          </div>)}
        </div>
      </Scroll>
      <div style={{marginTop:16}}>{index?rightAction:leftAction}</div>
    </section>)}</Panels>
  </>
}
