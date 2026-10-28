import assert from 'node:assert/strict'
import {test} from 'node:test'
import {load} from './helpers/loadModules.mjs'
const {classifyConflict,blockedChoice,headStamp,snapshot,serverDraft}=await load('features/conflicts/conflictModel')
const {lineDiff,changedRange}=await load('features/conflicts/lineDiff')
const record={noteId:'A',title:'',content:'my text',baseVersion:0,baseTitle:'',baseContent:'base',latestServerVersion:0,localRevision:2,localSavedAt:1,storageToken:'t',writerId:'writer'}
const head=(code='VERSION_CONFLICT',status='conflict')=>({record,operations:[{operationId:'key',noteId:'A',status,failureCode:code,attemptedAt:1}],creations:[]})
test('local CAS, exact server version code and exact deleted-note code are distinct',()=>{
 assert.equal(classifyConflict(head(),true),'LOCAL_DRAFT_CONFLICT')
 assert.equal(classifyConflict(head(),false),'SERVER_VERSION_CONFLICT')
 assert.equal(classifyConflict(head('NOTE_NOT_FOUND'),false),'SERVER_NOTE_DELETED')
})
test('UUID/key/unknown409/other404 errors never become version or deletion choices',()=>{
 for(const code of ['IDEMPOTENCY_KEY_REUSED','DUPLICATE_ENTITY_ID','HTTP_ERROR','FOLDER_NOT_FOUND',undefined])assert.equal(classifyConflict({...head(),operations:[{...head().operations[0],failureCode:code}]},false),undefined)
 assert.equal(classifyConflict(head('VERSION_CONFLICT','pending'),false),undefined)
})
test('any uncertain inFlight operation prevents all manual replacements',()=>{
 for(const kind of ['LOCAL_DRAFT_CONFLICT','SERVER_VERSION_CONFLICT','SERVER_NOTE_DELETED'])assert.match(blockedChoice(kind,head('VERSION_CONFLICT','inFlight')),/미확정/)
})
test('missing/recovered local records and uncertain creations do not permit blind CAS adoption',()=>{
 assert.ok(blockedChoice('LOCAL_DRAFT_CONFLICT',{operations:[],creations:[]}))
 assert.ok(blockedChoice('LOCAL_DRAFT_CONFLICT',{record:{...record,recoveredAs:'new'},operations:[],creations:[]}))
 assert.ok(blockedChoice('LOCAL_DRAFT_CONFLICT',{record,operations:[],creations:[{status:'inFlight',attemptedAt:1}]}))
})
test('only terminal known conflicts may be replaced; pending local work may be coalesced',()=>{
 assert.equal(blockedChoice('LOCAL_DRAFT_CONFLICT',{record,operations:[{status:'pending',attemptedAt:null}],creations:[]}),undefined)
 assert.equal(blockedChoice('SERVER_VERSION_CONFLICT',head()),undefined)
 assert.ok(blockedChoice('SERVER_VERSION_CONFLICT',head('IDEMPOTENCY_KEY_REUSED')))
 assert.ok(blockedChoice('LOCAL_DRAFT_CONFLICT',head()))
})
test('head fence includes token, revision, entire immutable operation and status, not only IDs',()=>{
 const a=head(),s=headStamp(a)
 for(const h of [{...a,record:{...record,storageToken:'other'}},{...a,record:{...record,localRevision:3}},{...a,operations:[{...a.operations[0],status:'inFlight'}]},{...a,operations:[{...a.operations[0],content:'another payload'}]}])assert.notEqual(headStamp(h),s)
})
test('snapshot excludes mutable persistence projections and history; server baseline validates versions',()=>{
 const d=snapshot({...record,conflictHistory:['not copied'],serverOperationPending:true});assert.equal('storageToken'in d,false);assert.equal('conflictHistory'in d,false)
 assert.equal(serverDraft({id:'A',title:'',content:'',version:2}).baseVersion,2)
 for(const version of [-1,1.5,NaN])assert.throws(()=>serverDraft({id:'A',title:'',content:'',version}))
})
function faithful(left,right){const d=lineDiff(left,right);assert.equal(d.rows.filter(r=>r.left!==undefined).map(r=>r.left).join('\n'),left);assert.equal(d.rows.filter(r=>r.right!==undefined).map(r=>r.right).join('\n'),right);return d}
test('line alignment preserves empty lines, trailing newline, insertions and deletions exactly',()=>{
 for(const pair of [['',''],['a\n','a\nb\n'],['a\nb','b'],['\n\n','\n'],['a\nb\nc','a\nB\nc'],['a\na','a\nx\na']])faithful(...pair)
 assert.equal(lineDiff('same','same').blocks.length,0)
 assert.equal(lineDiff('same\nold\nend','same\nnew\nend').blocks.length,1)
})
test('very different long manuscripts use bounded coarse pairing instead of quadratic allocation',()=>{
 const a=Array.from({length:1000},(_,i)=>'A'+i).join('\n'),b=Array.from({length:1100},(_,i)=>'B'+i).join('\n')
 const d=faithful(a,b);assert.equal(d.coarse,true);assert.equal(d.rows.length,1100)
})
test('common prefix/suffix keep a large manuscript single-line edit precise',()=>{
 const a=Array.from({length:10000},(_,i)=>'line '+i),b=[...a];b[5000]='changed'
 const d=faithful(a.join('\n'),b.join('\n'));assert.equal(d.coarse,false);assert.equal(d.blocks.length,1)
})
test('character emphasis preserves Unicode and caps long-line analysis without changing data',()=>{
 for(const [a,b] of [['안녕 👩‍💻 세계','안녕 👨‍💻 세계'],['😀x','😁x'],['','new'],['a'.repeat(20000),'b'.repeat(20000)]]){
  const r=changedRange(a,b);assert.equal(r.before+r.change+r.after,a)
 }
})

test('only status404 plus NOTE_NOT_FOUND is classified as a confirmed missing note response',async()=>{
 const {deletedError}=await load('features/conflicts/conflictService'),{ApiError}=await load('lib/api/client')
 for(const [status,code,expected]of [[404,'NOTE_NOT_FOUND',true],[404,'HTTP_ERROR',false],[404,'FOLDER_NOT_FOUND',false],[500,'NOTE_NOT_FOUND',false],[0,'NOTE_NOT_FOUND',false]])assert.equal(deletedError(new ApiError(status,{code,message:'synthetic',errors:[]})),expected)
})

test('confirmed missing server note may recover a clean local record with no queued writes',()=>{
 assert.equal(blockedChoice('SERVER_NOTE_DELETED',{record,operations:[],creations:[]}),undefined)
 assert.ok(blockedChoice('SERVER_VERSION_CONFLICT',{record,operations:[],creations:[]}))
})

test('recovery history validates provenance and malformed records without discarding stored originals',async()=>{
 const {validateLocalDraft}=await load('features/local-drafts/draftDatabase')
 const copy={id:'backup',createdAt:1,kind:'LOCAL_DRAFT_CONFLICT',choice:'other',mine:snapshot(record),stored:snapshot(record),other:snapshot(record),operations:[],creations:[]}
 const valid={...record,conflictHistory:[copy]};assert.equal(validateLocalDraft(valid),valid)
 for(const change of [{kind:{}},{choice:'force'},{createdAt:-1},{mine:{...snapshot(record),noteId:'OTHER'}},{operations:[{}]}]){
  assert.throws(()=>validateLocalDraft({...record,conflictHistory:[{...copy,...change}]}),/not supported/)
 }
})
test('retired-note pointer and recovery array are guarded against invalid persisted shapes',async()=>{
 const {validateLocalDraft}=await load('features/local-drafts/draftDatabase')
 assert.throws(()=>validateLocalDraft({...record,recoveredAs:{}}),/not supported/)
 assert.throws(()=>validateLocalDraft({...record,conflictHistory:{}}),/not supported/)
})
