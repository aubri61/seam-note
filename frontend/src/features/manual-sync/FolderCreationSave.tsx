import { useRef,useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnectivity } from '@/features/offline/useConnectivity'
import { workspaceKeys } from '@/lib/query/queryKeys'
import { syncLocalFolder } from './creationSync'
export function FolderCreationSave({id,pending}:{id:string|null;pending:boolean}){
 const online=useConnectivity(),client=useQueryClient(),lock=useRef(false),[busy,setBusy]=useState(false),[state,setState]=useState({id:'',message:''})
 if(!id||!pending&&state.id!==id)return null
 return <div style={{fontSize:12,padding:8}}>{pending&&<p>서버 미반영 폴더</p>}{pending&&<button type="button" disabled={!online||busy} onClick={()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setState({id,message:''})
  void syncLocalFolder(id).then(()=>{setState({id,message:'폴더 서버 반영 완료'});return client.invalidateQueries({queryKey:workspaceKeys.tree()})}).catch(e=>setState({id,message:e instanceof Error?e.message:'폴더 반영 실패'})).finally(()=>{lock.current=false;setBusy(false)})
 }}>폴더 서버에 저장</button>}{state.id===id&&state.message&&<p role="status">{state.message}</p>}</div>
}
