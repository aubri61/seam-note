import {test} from 'node:test'
import assert from 'node:assert/strict'
import {load} from './helpers/loadModules.mjs'
const {EMPTY_DOCUMENT,parseDocument,serializeDocument,documentText}=await load('features/notes/richTextDocument')
const text=(value,marks=[])=>({type:'text',text:value,...(marks.length?{marks:marks.map(type=>({type}))}:{})})
const doc=content=>({type:'doc',content})
const p=content=>({type:'paragraph',...(content.length?{content}:{})})
test('canonical empty Tiptap document has a paragraph and supports blank content',()=>assert.equal(serializeDocument(parseDocument(EMPTY_DOCUMENT)),EMPTY_DOCUMENT))
test('schema rejects plain text, HTML, unknown nodes, illegal nesting and attributes',()=>{
 for(const bad of ['', 'plain', '<p>x</p>','null','{}',JSON.stringify(doc([])),JSON.stringify(doc([text('x')])),JSON.stringify(doc([{type:'image'}])),JSON.stringify(doc([p([{type:'text',text:''}])])),JSON.stringify(doc([p([text('x',['link'])])])),JSON.stringify(doc([{type:'paragraph',attrs:{onclick:'bad'}}])),JSON.stringify(doc([{type:'listItem',content:[p([])]}]))]) assert.throws(()=>parseDocument(bad))
})
test('formatting and hard breaks serialize without changing readable body',()=>{
 const value=serializeDocument(doc([p([text('한글',['italic','bold']),{type:'hardBreak'},text('다음 줄')]),p([])]))
 assert.equal(documentText(value),'한글\n다음 줄\n\n');assert.match(documentText(value,true),/\*\*한글\*\*/)
 assert.equal(serializeDocument(parseDocument(value)),value)
})
test('ordered and nested lists retain starting number and structures',()=>{
 const value=serializeDocument(doc([{type:'orderedList',attrs:{start:3},content:[{type:'listItem',content:[p([text('항목')]),{type:'bulletList',content:[{type:'listItem',content:[p([text('안쪽')])]}]}]}]}]))
 assert.match(documentText(value),/^3\. 항목/);assert.match(documentText(value),/• 안쪽/)
})
test('format-only change remains dirty and preserves the selected immutable operation snapshot',async()=>{
 const {isDraftDirty}=await load('features/notes/noteDrafts'),{createOperation}=await load('features/outbox/outboxModel')
 const before=serializeDocument(doc([p([text('같은 문장')])])),after=serializeDocument(doc([p([text('같은 문장',['bold'])])]))
 const draft={noteId:crypto.randomUUID(),title:'',content:after,baseContent:before,baseTitle:'',baseVersion:2,latestServerVersion:2}
 assert.equal(documentText(before),documentText(after));assert.equal(isDraftDirty(draft),true)
 assert.equal(createOperation({...draft,localRevision:1}).content,after)
})
test('depth and unsupported list attributes are rejected deterministically',()=>{
 assert.throws(()=>serializeDocument(doc([{type:'orderedList',attrs:{start:-1},content:[]}])));
 let item=p([]);for(let i=0;i<40;i++)item={type:'bulletList',content:[{type:'listItem',content:[p([]),item]}]}
 assert.throws(()=>serializeDocument(doc([item])))
})
