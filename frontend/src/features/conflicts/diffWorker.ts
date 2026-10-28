import { lineDiff } from './lineDiff'
self.onmessage=(event:MessageEvent<{left:string;right:string}>)=>{
  const started=performance.now()
  const result=lineDiff(event.data.left,event.data.right)
  self.postMessage({...result,duration:performance.now()-started})
}
