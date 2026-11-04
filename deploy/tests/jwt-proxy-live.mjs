// Called by the disposable TLS harness with its own CA and synthetic credentials.
import assert from 'node:assert/strict'
import { proxy } from '../../frontend/api/[...path].js'
const env={PROXY_AUTH_MODE:'jwt',API_PUBLIC_URL:process.env.TEST_API_URL,FRONTEND_ORIGIN:'https://seam.example.test'}
const cookies=new Map()
async function call(path,method='GET',body,extra={}){
 const request=new Request(env.FRONTEND_ORIGIN+path,{method,headers:{'content-type':'application/json',cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const response=await proxy(request,env)
 for(const cookie of response.headers.getSetCookie()){
  const pair=cookie.split(';',1)[0];const index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1))
 }
 const raw=await response.text();return {status:response.status,data:raw?JSON.parse(raw):null,cookies:response.headers.getSetCookie()}
}
const csrf=await call('/api/auth/csrf');assert.equal(csrf.status,200);assert.ok(cookies.get('JSESSIONID'))
const headers={'x-csrf-token':csrf.data.token,origin:env.FRONTEND_ORIGIN}
const email=`proxy-${crypto.randomUUID()}@example.test`,password='synthetic-proxy-password-only'
assert.equal((await call('/api/auth/signup','POST',{email,password,nickname:'프록시 검증'},headers)).status,202)
const login=await call('/api/auth/login','POST',{email,password},headers);assert.equal(login.status,200);assert.ok(cookies.get('seam_refresh'))
assert.ok(login.cookies.every(cookie=>cookie.includes('HttpOnly')&&cookie.includes('Secure')))
const token=login.data.accessToken
assert.equal((await call('/api/workspace/tree','GET',undefined,{authorization:`Bearer ${token}`})).status,200)
assert.equal((await call('/api/workspace/tree')).status,401)
const old=cookies.get('seam_refresh');assert.equal((await call('/api/auth/refresh','POST',{},headers)).status,200);assert.notEqual(cookies.get('seam_refresh'),old)
assert.equal((await call('/api/auth/refresh','POST',{})).status,403)
assert.equal((await call('/api/auth/logout','POST',{},headers)).status,204)
assert.equal((await call('/api/auth/refresh','POST',{},headers)).status,401)
console.log('Live JWT proxy -> Caddy HTTPS -> Spring cookie/CSRF/Bearer/rotation/logout: PASS')
