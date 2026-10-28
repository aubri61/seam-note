// Installed only by manual-sync-lab.py --delay. Not a product Vite plugin.
import http from 'node:http'
export default function syncDelayProxy({noteId,apiOrigin}) {
  let armed=false,message='응답 지연 미설정'
  return {name:'isolated-sync-delay',apply:'serve',configureServer(server){
    server.middlewares.use((req,res,next)=>{
      if(req.url==='/__sync-delay__/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message}));return}
      if(req.url==='/__sync-delay__/arm'){
        let raw='';req.on('data',chunk=>{raw+=chunk});req.on('end',()=>{try{
          const data=JSON.parse(raw);if(req.method!=='POST'||data.noteId!==noteId||!['response','ack'].includes(data.mode))throw Error()
          armed=data.mode==='response';message=armed?'응답 전달 전 10초 지연 예약됨':'응답 지연 없음 (ACK 지연은 현재 탭만)';res.end('{}')
        }catch{res.statusCode=400;res.end('{}')}});return
      }
      if(!req.url?.startsWith('/api/'))return next()
      // Reserve the arm at request start. Only this fresh lab note can consume it.
      const delay=armed&&req.method==='PUT'&&req.url===`/api/notes/${noteId}`
      if(delay)armed=false
      const upstream=http.request(new URL(req.url,apiOrigin),{method:req.method,headers:{...req.headers,host:new URL(apiOrigin).host}},response=>{
        const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{
          const deliver=()=>{if(!res.destroyed){res.writeHead(response.statusCode,response.headers);res.end(Buffer.concat(chunks))}}
          if(delay&&response.statusCode===200){
            message=`서버 처리 완료 · 응답 전달 전 대기 중 · 10초 · operationId=${req.headers['idempotency-key']}`;console.info(message)
            setTimeout(()=>{message='응답 지연 완료';deliver()},10_000)
          }else deliver()
        })
      });upstream.on('error',()=>{if(!res.destroyed){res.statusCode=502;res.end('{}')}});req.pipe(upstream)
    })
  }}
}
