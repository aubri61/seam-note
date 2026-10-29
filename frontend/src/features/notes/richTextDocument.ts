/** One persisted format: a serialized Tiptap document, never HTML or plain text. */
export interface RichNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string }[]
  content?: RichNode[]
}
export const EMPTY_DOCUMENT = '{"type":"doc","content":[{"type":"paragraph"}]}'
const blocks = new Set(['paragraph', 'bulletList', 'orderedList'])
export function validateDocument(value: unknown): RichNode {
  let count = 0
  function visit(raw: unknown, depth: number): RichNode {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || depth > 64 || ++count > 100_000) throw Error('올바른 Tiptap 문서가 아닙니다.')
    const node = raw as RichNode
    if (Object.keys(node).some(key => !['type','text','attrs','marks','content'].includes(key))) throw Error('지원하지 않는 문서 속성입니다.')
    const types = ['doc','paragraph','text','hardBreak','bulletList','orderedList','listItem']
    if (!types.includes(node.type) || node.type === 'doc' && depth !== 0 || depth === 0 && node.type !== 'doc') throw Error('지원하지 않는 문서 구조입니다.')
    if (node.type === 'text' ? typeof node.text !== 'string' || !node.text.length : node.text !== undefined) throw Error('올바른 본문 텍스트가 아닙니다.')
    if (node.attrs !== undefined) {
      if (node.type !== 'orderedList' || !node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)
        || Object.keys(node.attrs).some(key => !['start','type'].includes(key))
        || node.attrs.start !== undefined && (!Number.isSafeInteger(node.attrs.start) || Number(node.attrs.start) < 1)
        || node.attrs.type !== undefined && node.attrs.type !== null && (typeof node.attrs.type !== 'string' || !['1','a','A','i','I'].includes(node.attrs.type))) throw Error('지원하지 않는 목록 속성입니다.')
    }
    if (node.marks !== undefined && (!['text','hardBreak'].includes(node.type) || !Array.isArray(node.marks)
      || node.marks.some(mark => !mark || !['bold','italic'].includes(mark.type) || Object.keys(mark).some(key => key !== 'type'))
      || new Set(node.marks.map(mark => mark.type)).size !== node.marks.length)) throw Error('지원하지 않는 글자 서식입니다.')
    if (node.content !== undefined && !Array.isArray(node.content)) throw Error('올바른 문단이 아닙니다.')
    const children = (node.content ?? []).map(child => visit(child, depth + 1))
    if (['text','hardBreak'].includes(node.type) && children.length
      || node.type === 'paragraph' && children.some(child => !['text','hardBreak'].includes(child.type))
      || node.type === 'doc' && (!children.length || children.some(child => !blocks.has(child.type)))
      || ['bulletList','orderedList'].includes(node.type) && (!children.length || children.some(child => child.type !== 'listItem'))
      || node.type === 'listItem' && (children[0]?.type !== 'paragraph' || children.some(child => !blocks.has(child.type)))) throw Error('올바른 문단/목록 구조가 아닙니다.')
    return {type:node.type,...(node.type === 'orderedList' ? {attrs:{start:node.attrs?.start ?? 1,type:node.attrs?.type ?? null}} : {}),
      ...(node.text !== undefined ? {text:node.text} : {}),...(node.marks?.length ? {marks:[...node.marks].sort((a,b)=>a.type.localeCompare(b.type))} : {}),
      ...(children.length ? {content:children} : {})}
  }
  return visit(value, 0)
}
export function parseDocument(content: string): RichNode {
  try { return validateDocument(JSON.parse(content)) }
  catch { throw Error('지원하지 않는 원고 형식입니다. 새 원고를 생성해주세요. 기존 내용은 변경하지 않았습니다.') }
}
export function serializeDocument(value: unknown): string { return JSON.stringify(validateDocument(value)) }
/** Display projection only. Version selection always keeps the original JSON snapshot. */
export function documentText(content: string, showFormatting = false): string {
  const root = parseDocument(content)
  function text(node: RichNode): string {
    if (node.type === 'text') {
      let value = node.text!
      if (showFormatting) for (const mark of node.marks ?? []) value = mark.type === 'bold' ? `**${value}**` : `_${value}_`
      return value
    }
    if (node.type === 'hardBreak') return '\n'
    if (['bulletList','orderedList'].includes(node.type)) return (node.content ?? []).map((item,index)=>`${node.type === 'bulletList' ? '•' : Number(node.attrs?.start ?? 1) + index + '.'} ${text(item)}`).join('\n')
    return (node.content ?? []).map(text).join(node.type === 'paragraph' ? '' : '\n\n')
  }
  return text(root)
}
