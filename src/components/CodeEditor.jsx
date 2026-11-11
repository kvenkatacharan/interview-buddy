import { useRef } from 'react'

const INDENT = '    '

// A plain textarea with a line-number gutter, Tab / Shift+Tab indentation and
// auto-indent on Enter. Edits go through execCommand so Cmd+Z still works.
export default function CodeEditor({ value, onChange, language, readOnly = false }) {
  const textRef = useRef(null)
  const gutterRef = useRef(null)
  const lineCount = Math.max(1, value.split('\n').length)

  function insert(text) {
    document.execCommand('insertText', false, text)
  }

  function handleKeyDown(e) {
    const el = e.currentTarget
    const { selectionStart: start, selectionEnd: end } = el

    if (e.key === 'Tab') {
      e.preventDefault()
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      if (e.shiftKey) {
        const line = value.slice(lineStart)
        const remove = line.match(/^ {1,4}/)?.[0].length ?? 0
        if (remove) {
          el.setSelectionRange(lineStart, lineStart + remove)
          insert('')
          el.setSelectionRange(Math.max(lineStart, start - remove), Math.max(lineStart, end - remove))
        }
      } else if (start !== end && value.slice(start, end).includes('\n')) {
        // Indent every selected line.
        const block = value.slice(lineStart, end)
        el.setSelectionRange(lineStart, end)
        insert(block.replace(/^/gm, INDENT))
      } else {
        insert(INDENT)
      }
      return
    }

    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const currentIndent = value.slice(lineStart, start).match(/^\s*/)[0]
      const opensBlock = /[:{[(]\s*$/.test(value.slice(lineStart, start))
      insert('\n' + currentIndent + (opensBlock ? INDENT : ''))
    }
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <span className="editor-lang">{language}</span>
        <span className="editor-meta">{lineCount} lines</span>
      </div>
      <div className="editor-body">
        <div className="editor-gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textRef}
          className="editor-text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={readOnly ? undefined : handleKeyDown}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Code editor"
        />
      </div>
    </div>
  )
}
