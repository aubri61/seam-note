import assert from 'node:assert/strict'
import {test} from 'node:test'
import {load} from './helpers/loadModules.mjs'
const {shortcutLabel}=await load('lib/keyboard/shortcutLabel')
test('Mac shows only Command and compact Shift glyph',()=>{
 assert.equal(shortcutLabel('굵게','B','macOS'),'굵게 (⌘B)')
 assert.equal(shortcutLabel('다시 실행','Shift+Z','MacIntel'),'다시 실행 (⌘⇧Z)')
 assert.equal(shortcutLabel('사이드바 접기','\\','MacIntel'),'사이드바 접기 (⌘\\)')
})
test('Windows and other desktop platforms show only Control',()=>{
 for(const os of ['Windows','Win32','Linux x86_64','']){
  assert.equal(shortcutLabel('굵게','B',os),'굵게 (Ctrl+B)')
  assert.equal(shortcutLabel('다시 실행','Shift+Z',os),'다시 실행 (Ctrl+Shift+Z)')
 }
})
