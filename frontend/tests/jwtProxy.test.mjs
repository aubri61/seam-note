import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proxy } from '../api/[...path].js'
const env={API_PUBLIC_URL:'https://api.example.com',FRONTEND_ORIGIN:'https://app.example.com',PROXY_AUTH_MODE:'jwt'}
const request=(path,method='GET',headers={},body)=>new Request(env.FRONTEND_ORIGIN+path,{method,headers,...(body?{body}: {})})
test('JWT proxy passes Bearer/CSRF and auth cookies only, without injecting credentials',async()=>{
 const response=await proxy(request('/api/auth/refresh','POST',{authorization:'Bearer synthetic',cookie:'JSESSIONID=session; seam_refresh=token; unrelated=drop','x-csrf-token':'csrf',origin:env.FRONTEND_ORIGIN},'{}'),env,async(url,options)=>{
  assert.equal(String(url),'https://api.example.com/api/auth/refresh');assert.equal(options.headers.get('authorization'),'Bearer synthetic');assert.equal(options.headers.get('x-csrf-token'),'csrf');assert.equal(options.headers.get('cookie'),'JSESSIONID=session; seam_refresh=token')
  return Response.json({ok:true})
 });assert.equal(response.status,200)
 await proxy(request('/api/notes','GET',{cookie:'seam_refresh=token',authorization:'Basic shared'}),env,async(_,options)=>{assert.equal(options.headers.get('cookie'),null);assert.equal(options.headers.get('authorization'),null);return Response.json([])})
})
test('multiple Secure host-only auth cookies survive without joining and unsafe cookies are dropped',async()=>{
 const headers=new Headers();headers.append('set-cookie','JSESSIONID=session; Path=/; Secure; HttpOnly; SameSite=Lax');headers.append('set-cookie','seam_refresh=token; Path=/api/auth; Secure; HttpOnly; SameSite=Lax');headers.append('set-cookie','bad=1; Path=/; Secure; HttpOnly; SameSite=Lax');headers.append('set-cookie','seam_refresh=bad; Path=/api/auth; Domain=example.com; Secure; HttpOnly; SameSite=Lax')
 const response=await proxy(request('/api/auth/login','POST',{},'{}'),env,async()=>new Response('{}',{headers}))
 assert.equal(response.headers.getSetCookie().length,2);assert.equal(response.headers.get('cache-control'),'no-store')
 assert.equal(response.headers.get('referrer-policy'),'no-referrer')
})
test('redirects allow only Google authorization and fixed frontend callback destinations',async()=>{
 const start='/api/auth/oauth2/authorization/google',callback='/api/auth/oauth2/callback/google'
 const redirect=url=>async()=>new Response(null,{status:302,headers:{location:url}})
 assert.equal((await proxy(request(start),env,redirect('https://accounts.google.com/o/oauth2/v2/auth?state=synthetic'))).status,302)
 assert.equal((await proxy(request(callback),env,redirect(env.FRONTEND_ORIGIN+'/auth/complete'))).status,302)
 assert.equal((await proxy(request(callback),env,redirect(env.FRONTEND_ORIGIN+'/login?oauth=failed'))).status,302)
 for(const url of ['https://attacker.example','https://accounts.google.com.attacker.example/o/oauth2/v2/auth','https://accounts.google.com/other'])assert.equal((await proxy(request(start),env,redirect(url))).status,502)
 for(const url of [env.FRONTEND_ORIGIN+'/auth/complete?token=secret',env.FRONTEND_ORIGIN+'/other',env.FRONTEND_ORIGIN+'/auth/complete#token'])assert.equal((await proxy(request(callback),env,redirect(url))).status,502)
 assert.equal((await proxy(request('/api/notes'),env,redirect(env.FRONTEND_ORIGIN+'/auth/complete'))).status,502)
})
test('cross-site writes oversize bodies and invalid config fail before upstream',async()=>{
 const never=()=>assert.fail('request reached upstream')
 assert.equal((await proxy(request('/api/auth/refresh','POST',{origin:'https://evil.example'},'{}'),env,never)).status,403)
 assert.equal((await proxy(request('/api/notes','POST',{},'x'.repeat(2*1024*1024+1)),env,never)).status,413)
 assert.equal((await proxy(request('/api/notes'),{...env,API_PUBLIC_URL:'http://api.example.com'},never)).status,503)
 assert.equal((await proxy(request('/api/notes'),{...env,PROXY_AUTH_MODE:'typo'},never)).status,503)
})
