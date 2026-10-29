import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import styled from '@emotion/styled'
import { useTheme } from '@emotion/react'
import { Link } from 'react-router-dom'
import { notePath } from '@/app/routing/noteRoutes'
import type { Folder } from '@/lib/api/types'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import { SyncButton } from '@/components/SyncButton'
import { ChangedConflict, NoConflict } from './conflictModel'
import type { ConflictPreview } from './conflictModel'
import { chooseConflict, discardDeletedNote, inspectConflict, saveChosenNote } from './conflictService'
import { ApiError } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { noteKeys, workspaceKeys } from '@/lib/query/queryKeys'
import { documentText } from '@/features/notes/richTextDocument'
import { DiffView } from './DiffView'
const Overlay=styled(Dialog.Overlay)({position:'fixed',inset:0,background:'rgba(36,35,32,.3)',zIndex:40})
const Content=styled(Dialog.Content)<{compact:boolean}>(({theme,compact})=>({position:'fixed',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:`min(${compact?520:960}px, calc(100vw - 32px))`,maxHeight:'85dvh',zIndex:41,overflowY:'auto',padding:theme.spacing.lg,
  borderRadius:theme.radii.panel,background:theme.colors.surface,color:theme.colors.text,boxShadow:theme.shadow,
  'button:focus-visible, select:focus-visible':{outline:`2px solid ${theme.colors.text}`,outlineOffset:2},
  h2:{fontSize:20},h3:{fontSize:14,margin:'12px 0 8px'},p:{fontSize:13,lineHeight:1.7,overflowWrap:'anywhere'},select:{padding:8,maxWidth:'100%'},
}))
export default function ConflictDialog({id,session,folders,initialFolderId,onClose,onResolved}:{id:string;session:DraftSession;folders:Folder[];initialFolderId:string;onClose:()=>void;onResolved:(newId?:string)=>void}) {
  const theme=useTheme()
  const client=useQueryClient()
  const [pendingSave,setPendingSave]=useState<{noteId:string;newId?:string;choice:'mine'|'other'|'recover'}|null>(null)
  const [notice,setNotice]=useState('')
  const [preview,setPreview]=useState<ConflictPreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [recoveredAs,setRecoveredAs]=useState<string|undefined>()
  const [folderId,setFolderId]=useState(initialFolderId),[diffReady,setDiffReady]=useState(false)
  const heading=useRef<HTMLHeadingElement>(null)
  const opener=useRef<HTMLElement|null>(null)
  const gate=useRef(false),sequence=useRef(0)
  const onDiffReady=useCallback(()=>setDiffReady(true),[])
  const load=useCallback(()=>{
    const request=++sequence.current
    return import('@/features/local-drafts/draftDatabase').then(async({draftRepository:repo})=>{
      const head=await repo.conflictHead(id)
      if(request===sequence.current){setRecoveredAs(head.record?.recoveredAs)}
      return inspectConflict(id,session)
    }).then(next=>{if(request===sequence.current)setPreview(next)})
      .catch(cause=>{if(request===sequence.current){if(cause instanceof NoConflict)setNotice(cause.message);else setError(cause instanceof Error?cause.message:'원고 비교를 준비하지 못했습니다.')}})
      .finally(()=>{if(request===sequence.current)setLoading(false)})
  },[id,session])
  const invalidate=useCallback(()=>{sequence.current++},[])
  useEffect(()=>{void load();return invalidate},[load,invalidate])
  const closeDeleted=useEffectEvent(()=>onClose())
  useEffect(()=>{
    let active=true
    const check=()=>{void import('@/features/local-drafts/draftDatabase').then(async({draftRepository:repo})=>{
      if((await repo.deletedEntities()).some(d=>d.kind==='note'&&d.id===id)&&active)closeDeleted()
    }).catch(()=>{})}
    check()
    window.addEventListener('seam-note:workspace-deleted',check)
    return()=>{active=false;window.removeEventListener('seam-note:workspace-deleted',check)}
  },[id])
  const mine=preview?.mine??session.getSnapshot()[id]?.draft,other=preview?.server??preview?.head.record
  const deleted=preview?.kind==='SERVER_NOTE_DELETED'
  async function choose(choice:'mine'|'other'|'recover') {
    if(!preview||gate.current)return
    gate.current=true;setBusy(true);setError('')
    let selected=pendingSave
    try{
      if(!selected){
        const result=await chooseConflict(preview,choice,session,folderId)
        selected={noteId:result.replacement?.id??id,newId:result.replacement?.id,choice}
        setPendingSave(selected)
      }
      await saveChosenNote(selected.noteId,session)
      await client.invalidateQueries({queryKey:noteKeys.detail(selected.noteId)})
      void client.invalidateQueries({queryKey:workspaceKeys.tree()})
      onResolved(selected.newId)
    }
    catch(cause){
      let conflict=false
      for(let current:unknown=cause,depth=0;current instanceof Error&&depth<6;current=current.cause,depth++){
        if(current instanceof ApiError&&['VERSION_CONFLICT','NOTE_NOT_FOUND'].includes(current.code))conflict=true
      }
      if(cause instanceof ChangedConflict||conflict){
        setPendingSave(null);setDiffReady(false);setLoading(true);setPreview(null);await load()
      }
      setError((selected?'선택한 제목과 본문은 보존되어 있습니다. ':'')+(cause instanceof Error?cause.message:'선택을 적용하지 못했습니다. 원고를 보존했습니다.'))
    }
    finally{gate.current=false;setBusy(false)}
  }
  async function discard() {
    if(!preview||gate.current)return
    gate.current=true;setBusy(true);setError('')
    try{
      await discardDeletedNote(preview,session)
      client.removeQueries({queryKey:noteKeys.detail(id),exact:true})
      void client.invalidateQueries({queryKey:workspaceKeys.tree()})
      onResolved()
    }catch(cause){
      if(cause instanceof ChangedConflict){setLoading(true);setPreview(null);await load()}
      setError(cause instanceof Error?cause.message:'로컬 원고 삭제에 실패했습니다. 원고를 보존했습니다.')
    }finally{gate.current=false;setBusy(false)}
  }
  const disabled=busy||loading||!preview||!!preview.blocked||(!deleted&&!diffReady)
  return <Dialog.Root open onOpenChange={open=>{if(!open&&!busy)onClose()}}><Dialog.Portal><Overlay/><Content compact={deleted}
    onOpenAutoFocus={event=>{event.preventDefault();if(!opener.current&&document.activeElement instanceof HTMLElement&&!document.activeElement.closest('[role=dialog]'))opener.current=document.activeElement;heading.current?.focus()}}
    onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus();else (document.querySelector<HTMLElement>('[data-workspace-sync]')??document.querySelector<HTMLElement>('header button'))?.focus()}}
    onEscapeKeyDown={event=>{if(busy)event.preventDefault()}} onPointerDownOutside={event=>{if(busy)event.preventDefault()}}>
    <Dialog.Title ref={heading} tabIndex={-1}>{deleted?'삭제된 서버 원고 복구':'원고 충돌 비교'}</Dialog.Title>
    <Dialog.Description style={{position:'absolute',width:1,height:1,overflow:'hidden',clipPath:'inset(50%)'}}>{deleted?'서버에 없는 원고의 로컬 사본을 새 원고로 복구하거나 영구 삭제할 수 있습니다.':'두 원고 중 유지할 버전을 선택하세요. 선택 전 원고는 로컬 복구 사본으로 보관되고 선택 즉시 서버 저장을 시도합니다.'} Escape 또는 바깥 영역을 눌러 선택 없이 닫을 수 있습니다.</Dialog.Description>
    {recoveredAs&&<p><Link to={notePath(recoveredAs)} onClick={onClose}>복구된 새 원고 열기</Link></p>}
    {loading&&<p role="status">충돌 원고 확인 중</p>}
    {busy&&<p role="status">선택한 작업을 처리하고 있습니다…</p>}
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert">{error}</p>}
    {preview?.blocked&&<p role="alert">{preview.blocked}</p>}
    {preview&&!deleted&&other&&<DiffView left={preview.mine.content} right={other.content}
      leftLabel="현재 원고" rightLabel={preview.server?'서버 원고':'다른 탭 원고'}
      leftTitle={preview.mine.title} rightTitle={other.title} onReady={onDiffReady}
      leftAction={<SyncButton type="button" disabled={disabled||!!pendingSave&&pendingSave.choice!=='mine'} onClick={()=>{void choose('mine')}}>{pendingSave?.choice==='mine'?'현재 원고 서버 저장 재시도':'현재 원고 선택'}</SyncButton>}
      rightAction={<SyncButton type="button" disabled={disabled||!!pendingSave&&pendingSave.choice!=='other'} onClick={()=>{void choose('other')}}>{pendingSave?.choice==='other'?'선택한 원고 서버 저장 재시도':preview.server?'서버 원고 선택':'다른 탭 원고 선택'}</SyncButton>}/>}
    {deleted&&<><h3>복구할 로컬 원고</h3><p><strong>{mine?.title||'제목 없음'}</strong></p><textarea aria-label="복구할 로컬 원고 본문" readOnly value={mine ? documentText(mine.content,true) : ''} rows={5} style={{width:'100%',resize:'vertical',background:theme.colors.background}}/><p>서버가 NOTE_NOT_FOUND를 반환했습니다. 기존 UUID로 재생성하지 않고 새 UUID와 NOTE_CREATE로 복구합니다.</p>
      <label>새 원고를 보관할 폴더 <select value={folderId} onChange={e=>setFolderId(e.target.value)} disabled={busy}><option value="">폴더 없이 생성</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></>}
    {deleted&&<><p>로컬 원고를 삭제하면 이 브라우저의 원고와 대기 작업도 제거되며 복구할 수 없습니다.</p><div style={{marginTop:16,display:'flex',flexWrap:'wrap',gap:12}}><SyncButton type="button" disabled={disabled} onClick={()=>{void choose('recover')}}>새 원고로 복구</SyncButton><SyncButton type="button" disabled={disabled||!!pendingSave} onClick={()=>{void discard()}}>로컬 원고 삭제</SyncButton></div></>}
  </Content></Dialog.Portal></Dialog.Root>
}
