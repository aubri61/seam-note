// Explicit initial network mode for isolated tests; never changes OS networking.
// Later context.setOffline(true/false) remains available to each scenario.
const runtime=require(process.env.SEAM_NOTE_PLAYWRIGHT_BASE||'playwright')
async function configure(context,offline=false){await context.setOffline(!offline);await context.setOffline(offline);return context}
function browserMode(browser){
 const create=browser.newContext.bind(browser),page=browser.newPage.bind(browser)
 browser.newContext=async(options={})=>configure(await create({...options,offline:!!options.offline}),!!options.offline)
 browser.newPage=async(options={})=>{const result=await page({...options,offline:!!options.offline});await configure(result.context(),!!options.offline);return result}
 return browser
}
module.exports={...runtime,chromium:new Proxy(runtime.chromium,{get(target,key){
 if(key==='launch')return async options=>browserMode(await target.launch(options))
 if(key==='launchPersistentContext')return async(dir,options={})=>configure(await target.launchPersistentContext(dir,{...options,offline:!!options.offline}),!!options.offline)
 const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value
}})}
