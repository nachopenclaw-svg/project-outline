// Reads and edits the outline file's text. No engine calls here, so the
// test can run these directly.

export type Mark = '✓' | '◐' | '☐'
export type Note = { line: number; depth: number; text: string }
export type Item = { line: number; mark: Mark | null; text: string; notes: Note[] }
export type Area = { line: number; name: string; items: Item[] }
export type Outline = { title: string; goal: string; areas: Area[] }

const BULLET = /^(\s*)[-*]\s+(.*)$/
const MARKED = /^([✓◐☐])️?\s*(.*)$/

// ponytail: a file with mixed line endings is rewritten with its first kind
// on an edit; keep each line's own ending if that ever matters.
const split = (text: string) => text.replace(/^﻿/, '').split(/\r?\n/)
const eol = (text: string) => (/\r\n/.test(text) ? '\r\n' : '\n')
const indentOf = (raw: string) => {
  const bullet = BULLET.exec(raw)
  return bullet ? bullet[1]!.replace(/\t/g, '  ').length : -1
}

export function parse(text: string): Outline {
  const outline: Outline = { title: '', goal: '', areas: [] }
  let item: Item | undefined

  split(text).forEach((raw, line) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw)
    if (heading) {
      item = undefined
      if (heading[1] === '#') outline.title ||= heading[2]!.trim()
      if (heading[1] === '##') outline.areas.push({ line, name: heading[2]!.trim(), items: [] })
      return
    }
    const goal = /^\*\*Goal:\*\*\s*(.*)$/.exec(raw)
    if (goal) {
      outline.goal = goal[1]!.trim()
      item = undefined
      return
    }
    const indent = indentOf(raw)
    if (indent < 0) {
      // A blank line keeps the job open for more notes; other text ends it.
      if (raw.trim() !== '') item = undefined
      return
    }
    const content = BULLET.exec(raw)![2]!.trim()
    if (indent >= 2) {
      item?.notes.push({ line, depth: Math.floor(indent / 2), text: content })
      return
    }
    let area = outline.areas.at(-1)
    if (!area) {
      area = { line: -1, name: 'General', items: [] }
      outline.areas.push(area)
    }
    const marked = MARKED.exec(content)
    item = marked
      ? { line, mark: marked[1] as Mark, text: marked[2]!.trim(), notes: [] }
      : { line, mark: null, text: content, notes: [] }
    area.items.push(item)
  })

  return outline
}

// An area is finished when it has marked jobs and every one is ✓.
export function isDone(area: Area): boolean {
  const marked = area.items.filter(one => one.mark !== null)
  return marked.length > 0 && marked.every(one => one.mark === '✓')
}

// The lines of a job: its own line and its notes, by the same rules as parse.
// Panel edits compare this with what the panel drew, so a job that moved or
// gained a note since the drawing is left alone.
export function block(text: string, line: number): string {
  const lines = split(text)
  if (lines[line] === undefined) return ''
  return lines.slice(line, blockEnd(lines, line)).join('\n')
}

function blockEnd(lines: string[], line: number): number {
  let end = line + 1
  for (let at = line + 1; at < lines.length; at += 1) {
    const raw = lines[at]!
    if (indentOf(raw) >= 2) end = at + 1
    else if (raw.trim() !== '') break
  }
  return end
}

// The press on a job's mark: ✓ goes back to ☐, anything else becomes ✓.
// Returns undefined when the job is not as drawn, so the caller writes nothing.
export function toggle(text: string, line: number, drawn: string): string | undefined {
  if (block(text, line) !== drawn) return undefined
  const lines = split(text)
  const marked = /^(\s*[-*]\s+)([✓◐☐])️?\s*(.*)$/.exec(lines[line]!)
  if (!marked) return undefined
  lines[line] = `${marked[1]}${marked[2] === '✓' ? '☐' : '✓'} ${marked[3]}`.trimEnd()
  return lines.join(eol(text))
}

// Deletes a job and its notes. Same undefined rule as toggle.
export function remove(text: string, line: number, drawn: string): string | undefined {
  if (block(text, line) !== drawn) return undefined
  const lines = split(text)
  lines.splice(line, blockEnd(lines, line) - line)
  return lines.join(eol(text))
}

// Puts a new title on the file's first `# ` line, or adds one at the top.
// Returns undefined for a title that is empty once trimmed.
export function retitle(text: string, title: string): string | undefined {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (clean === '') return undefined
  const lines = split(text)
  const at = lines.findIndex(raw => /^#\s+/.test(raw))
  if (at < 0) lines.unshift(`# ${clean}`)
  else lines[at] = `# ${clean}`
  return lines.join(eol(text))
}

// Splits `~~old~~` and `**bold**` out of a line so the panel can draw them.
export type Span = { text: string; strike?: true; bold?: true }
export function spans(text: string): Span[] {
  return text
    .split(/(~~[^~]+~~|\*\*[^*]+\*\*)/)
    .filter(part => part !== '')
    .map(part =>
      part.startsWith('~~') && part.endsWith('~~') && part.length > 4
        ? { text: part.slice(2, -2), strike: true }
        : part.startsWith('**') && part.endsWith('**') && part.length > 4
          ? { text: part.slice(2, -2), bold: true }
          : { text: part },
    )
}
