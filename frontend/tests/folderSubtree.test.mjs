import assert from 'node:assert/strict'
import {test} from 'node:test'
import {load} from './helpers/loadModules.mjs'
const {folderSubtree}=await load('features/workspace/workspaceActions')
test('recursive folder membership includes descendants and excludes unfiled/unrelated notes',()=>{
 const data={folders:[{id:'a',parentId:null},{id:'b',parentId:'a'},{id:'c',parentId:'b'},{id:'other',parentId:null}],notes:[{id:'one',folderId:'a'},{id:'two',folderId:'c'},{id:'root',folderId:null},{id:'keep',folderId:'other'}]}
 assert.deepEqual(folderSubtree(data,'a'),{folderIds:['a','b','c'],noteIds:['one','two']})
 assert.deepEqual(folderSubtree(undefined,'pending'),{folderIds:['pending'],noteIds:[]})
})
test('a corrupt cycle cannot hang deletion membership traversal',()=>{
 assert.deepEqual(folderSubtree({folders:[{id:'a',parentId:'b'},{id:'b',parentId:'a'}],notes:[]},'a').folderIds,['a','b'])
})
