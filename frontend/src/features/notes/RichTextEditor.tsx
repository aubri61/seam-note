import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/primitives'
import { EMPTY_DOCUMENT, parseDocument, serializeDocument } from './richTextDocument'

const Frame = styled.div(({theme})=>({display:'flex',flexDirection:'column',flex:1,minHeight:160,
  '[role="toolbar"]':{display:'flex',gap:theme.spacing.xs,padding:`${theme.spacing.lg} 0`,borderBottom:`1px solid ${theme.colors.border}`},
  'button[aria-pressed="true"]':{background:theme.colors.selected,color:theme.colors.text},
  '.editor-content':{display:'flex',flexDirection:'column',flex:1,minHeight:160,paddingTop:theme.spacing.xl},
  '.tiptap':{flex:1,minHeight:160,padding:`${theme.spacing.md} 0`,outline:'none',color:theme.colors.mutedText,fontSize:15,lineHeight:1.9,overflowWrap:'anywhere',whiteSpace:'pre-wrap'},
  '.tiptap p':{minHeight:'1.9em'},'.tiptap ul, .tiptap ol':{paddingLeft:28,margin:'8px 0'},'.tiptap li p':{margin:0},
  '.tiptap strong':{fontWeight:700},'.tiptap em':{fontStyle:'italic'},
}))
export default function RichTextEditor({content,editable,onChange}:{content:string;editable:boolean;onChange:(content:string)=>void}) {
  const [initial]=useState(()=>{try{return {document:parseDocument(content),error:''}}catch(error){return {document:parseDocument(EMPTY_DOCUMENT),error:String((error as Error).message)}}})
  const [error,setError]=useState(initial.error)
  const lastValue=useRef(content),change=useRef(onChange)
  useEffect(()=>{change.current=onChange},[onChange])
  const editor=useEditor({
    extensions:[StarterKit.configure({blockquote:false,code:false,codeBlock:false,heading:false,horizontalRule:false,strike:false,underline:false,link:false,trailingNode:false})],
    content:initial.document,editable:editable&&!initial.error,immediatelyRender:false,shouldRerenderOnTransaction:false,
    enableContentCheck:true,
    editorProps:{attributes:{role:'textbox','aria-label':'문서 내용','aria-multiline':'true',spellcheck:'true'}},
    onUpdate:({editor})=>{
      const value=serializeDocument(editor.getJSON())
      lastValue.current=value
      change.current(value)
    },
  },[])
  const state=useEditorState({editor,selector:({editor})=>({bold:editor?.isActive('bold')??false,italic:editor?.isActive('italic')??false,
    bullet:editor?.isActive('bulletList')??false,ordered:editor?.isActive('orderedList')??false,
    undo:editor?.can().undo()??false,redo:editor?.can().redo()??false})})
  useEffect(()=>{editor?.setEditable(editable&&!error)},[editor,editable,error])
  useEffect(()=>{
    if(!editor || content===lastValue.current)return
    let timer:ReturnType<typeof setTimeout>|undefined
    const apply=()=>{
      if(editor.isDestroyed)return
      // Never replace the ProseMirror document while an IME composition owns it.
      if(editor.view.composing){timer=setTimeout(apply,30);return}
      try{editor.commands.setContent(parseDocument(content),{emitUpdate:false,errorOnInvalidContent:true});lastValue.current=content;setError('')}
      catch(cause){setError((cause as Error).message)}
    }
    apply()
    return()=>{if(timer)clearTimeout(timer)}
  },[content,editor])
  const disabled=!editor||!editable||!!error
  return <Frame>
    {error&&<p role="alert">{error}</p>}
    <div role="toolbar" aria-label="원고 서식">
      <IconButton type="button" disabled={disabled} aria-label="굵게" aria-pressed={state?.bold??false} onMouseDown={e=>e.preventDefault()} onClick={()=>editor?.chain().focus().toggleBold().run()}><strong>B</strong></IconButton>
      <IconButton type="button" disabled={disabled} aria-label="기울임" aria-pressed={state?.italic??false} onMouseDown={e=>e.preventDefault()} onClick={()=>editor?.chain().focus().toggleItalic().run()}><i>I</i></IconButton>
      <IconButton type="button" disabled={disabled} aria-label="글머리 기호 목록" aria-pressed={state?.bullet??false} onMouseDown={e=>e.preventDefault()} onClick={()=>editor?.chain().focus().toggleBulletList().run()}><Icon name="list" size={19}/></IconButton>
      <IconButton type="button" disabled={disabled} aria-label="번호 목록" aria-pressed={state?.ordered??false} onMouseDown={e=>e.preventDefault()} onClick={()=>editor?.chain().focus().toggleOrderedList().run()}><Icon name="ordered" size={19}/></IconButton>
      <IconButton type="button" disabled={disabled||!state?.undo} aria-label="실행 취소" onMouseDown={e=>e.preventDefault()} onClick={()=>editor?.chain().focus().undo().run()}>↶</IconButton>
      <IconButton type="button" disabled={disabled||!state?.redo} aria-label="다시 실행" onMouseDown={e=>e.preventDefault()} onClick={()=>editor?.chain().focus().redo().run()}>↷</IconButton>
    </div>
    <EditorContent className="editor-content" editor={editor}/>
  </Frame>
}
