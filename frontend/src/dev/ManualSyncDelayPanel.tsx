import { useEffect, useState } from 'react'
import { armDelay, eventName } from './manualSyncDelay'

export default function ManualSyncDelayPanel({noteId}:{noteId:string|null}) {
  const allowed = import.meta.env.VITE_SYNC_DELAY_NOTE_ID
  const [message,setMessage]=useState('지연 미설정 · 기존 동기화 버튼으로 전송합니다.')
  const [proxyMessage,setProxyMessage]=useState('')
  useEffect(()=>{
    const listener=(event:Event)=>setMessage((event as CustomEvent<string>).detail)
    window.addEventListener(eventName,listener)
    const timer=setInterval(()=>{void fetch('/__sync-delay__/state').then(r=>r.json()).then((s:{message:string})=>setProxyMessage(s.message)).catch(()=>{})},300)
    return()=>{window.removeEventListener(eventName,listener);clearInterval(timer)}
  },[])
  if(!noteId || noteId!==allowed)return null
  return <aside aria-label="격리 동기화 지연 실험" style={{padding:'12px 24px',background:'#fff6da',fontSize:12}}>
    <p>개발 전용 · 지정 실험 원고만 · 아래 버튼은 다음 요청 1회에만 적용됩니다.</p>
    <button type="button" onClick={()=>void armDelay(noteId,'response').catch(e=>setMessage(String(e)))}>A: 응답 전달 전 10초</button>{' '}
    <button type="button" onClick={()=>void armDelay(noteId,'ack').catch(e=>setMessage(String(e)))}>B: ACK 직전 10초</button>
    <p role="status" data-lab-ack>{message}</p><p role="status" data-lab-proxy>{proxyMessage}</p>
  </aside>
}
