import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { block, isDone, parse, remove, retitle, spans, toggle } from '../hooks/outline'

const FILE = [
  '# Recipe App',
  '**Goal:** save family recipes',
  '',
  '## Accounts',
  '- ✓ Sign-in with email',
  '  - ~~Text codes~~ → email links, because texts cost money (Oct 3)',
  '## Search',
  '- ◐ Search by name',
  '- ☐ Filter by ingredient',
].join('\n')
const SIGN_IN = block(FILE, 4)

const PANE = {
  plugin: 'project-outline',
  component: 'Pane',
  requestId: 'outline',
  props: {
    title: 'Outline',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['desktop'],
  tools: [],
  outputStyle: null,
} as const

test('parse reads title, goal, areas, marks and notes', () => {
  const outline = parse(FILE)
  expect(outline.title).toBe('Recipe App')
  expect(outline.goal).toBe('save family recipes')
  expect(outline.areas.map(a => a.name)).toEqual(['Accounts', 'Search'])
  expect(outline.areas[0]!.items[0]!.notes[0]!.text).toContain('~~Text codes~~')
  expect(isDone(outline.areas[0]!)).toBe(true)
  expect(isDone(outline.areas[1]!)).toBe(false)
  // A byte-order mark doesn't hide the title; a stray emoji selector is dropped.
  expect(parse(`﻿${FILE}`).title).toBe('Recipe App')
  expect(parse('## A\n- ✓️ x').areas[0]!.items[0]!.text).toBe('x')
  // A deeper heading ends the job: the bullet under it is no note of "one".
  expect(parse('## A\n- ☐ one\n### sub\n  - note').areas[0]!.items[0]!.notes).toEqual([])
})

test('toggle edits only the job the panel drew', () => {
  expect(toggle(FILE, 7, block(FILE, 7))!.split('\n')[7]).toBe('- ✓ Search by name')
  expect(toggle(FILE, 4, SIGN_IN)!.split('\n')[4]).toBe('- ☐ Sign-in with email')
  // The file moved on since the panel drew it: nothing is written.
  expect(toggle(FILE, 7, '- ◐ Something else')).toBeUndefined()
  // Every line keeps Windows line endings.
  const crlf = FILE.replace(/\n/g, '\r\n')
  expect(toggle(crlf, 7, block(crlf, 7))!.split('\r\n')).toHaveLength(9)
  expect(toggle(crlf, 7, block(crlf, 7))!.replace(/\r\n/g, '')).not.toContain('\n')
})

test('remove takes a job and exactly its notes', () => {
  expect(remove(FILE, 4, SIGN_IN)!.split('\n')).toEqual([
    '# Recipe App',
    '**Goal:** save family recipes',
    '',
    '## Accounts',
    '## Search',
    '- ◐ Search by name',
    '- ☐ Filter by ingredient',
  ])
  // A note after a blank line or a tab still goes with its job.
  const gappy = '## A\n- ☐ one\n\n  - after blank\n\t- tab note\n- ☐ two'
  expect(remove(gappy, 1, block(gappy, 1))).toBe('## A\n- ☐ two')
  // A note added after the drawing: nothing is deleted.
  const grown = FILE.replace('(Oct 3)', '(Oct 3)\n  - a new note')
  expect(remove(grown, 4, SIGN_IN)).toBeUndefined()
  // The last job of the file.
  expect(remove(FILE, 8, block(FILE, 8))!.split('\n').at(-1)).toBe('- ◐ Search by name')
})

test('spans pull out crossed-out and bold parts', () => {
  expect(spans('~~old~~ → new')).toEqual([{ text: 'old', strike: true }, { text: ' → new' }])
  expect(spans('**Decision:** x')[0]).toEqual({ text: 'Decision:', bold: true })
})

test('the rules reach the system prompt, but not a teammate', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  on('session.cwd', () => ({ value: 'C:\\dev\\recipes' }))
  on('session.id', () => ({ value: 'chat-1' }))
  on('env.get', () => ({ value: 'C:\\Users\\k' }))
  on('fs.exists', () => ({ value: false }))

  const main = await $.prompt.compose({ ...COMPOSE, traits: [] })
  expect(main.sections.map(s => s.id)).toEqual([
    'intro',
    'project-outline:rules',
    'project-outline:chat',
  ])
  expect(main.sections[1]!.text).toContain('docs/outline.md')
  // No project outline here, so the chat outline goes in ~/.claude.
  expect(main.sections[2]!.text).toContain('C:\\Users\\k/.claude/chat-outlines/chat-1.md')

  const teammate = await $.prompt.compose({ ...COMPOSE, traits: ['teammate'] })
  expect(teammate.sections.map(s => s.id)).toEqual(['intro'])
})

test('with no home folder known, no chat outline path is given', async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  on('session.cwd', () => ({ value: 'C:\\dev\\recipes' }))
  on('session.id', () => ({ value: 'chat-1' }))
  on('env.get', () => ({ value: '' }))
  on('fs.exists', () => ({ value: false }))

  const { sections } = await $.prompt.compose({ ...COMPOSE, traits: [] })
  expect(sections.map(s => s.id)).toEqual(['project-outline:rules'])
})

test('the panel draws the outline; presses check off, fold and delete', async ($, on) => {
  let file = FILE
  const writes: string[] = []
  on('session.cwd', () => ({ value: 'C:\\dev\\recipes\\' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', (_, e) => {
    expect(e.path).toMatch(/^C:\\dev\\recipes[\\/]docs[\\/]outline\.md$/)
    return { value: file }
  })
  on('fs.write', (_, e) => {
    expect(e.path).toMatch(/^C:\\dev\\recipes[\\/]docs[\\/]outline\.md$/)
    file = e.text
    writes.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Recipe App/ })).toBeDefined()
    // Accounts is finished, so it starts folded: its job is not drawn.
    expect(await ui.find({ type: 'Text', text: /Sign-in with email/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Filter by ingredient/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'mark:7' })
  expect(writes.at(-1)!.split('\n')[7]).toBe('- ✓ Search by name')

  // Open the folded area, then close it again.
  await ui.press({ key: 'area:3:Accounts' })
  expect(await ui.find({ type: 'Text', text: /Sign-in with email/ })).toBeDefined()
  await ui.press({ key: 'area:3:Accounts' })
  expect(await ui.find({ type: 'Text', text: /Sign-in with email/ })).toBeUndefined()

  // "No" keeps the job; "Yes" deletes exactly that line.
  await ui.press({ key: 'del:8' })
  await ui.press({ key: 'no:8' })
  expect(writes).toHaveLength(1)
  await ui.press({ key: 'del:8' })
  await ui.press({ key: 'yes:8' })
  expect(writes.at(-1)!.split('\n')).toEqual(FILE.split('\n').slice(0, 8).map((line, at) =>
    at === 7 ? '- ✓ Search by name' : line,
  ))
  await ui.unmount()
})

test('the 3s poll follows the file and clears a pending "Delete?"', async ($, on) => {
  const clock = mock.clock(on)
  let file: string | null = FILE
  let isLocked = false
  on('session.cwd', () => ({ value: 'C:\\dev\\recipes' }))
  on('fs.exists', () => ({ value: file !== null }))
  on('fs.read', () => {
    if (isLocked) throw new Error('EBUSY')
    return { value: file ?? '' }
  })
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'del:8' })
  expect(await ui.find({ type: 'Text', text: /Delete\?/ })).toBeDefined()
  // Someone else adds a job above: the jobs move, so the question goes away.
  file = FILE.replace('## Search\n', '## Search\n- ☐ New job\n')
  await clock.advance(3000)
  expect(await ui.find({ type: 'Text', text: /Delete\?/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /New job/ })).toBeDefined()

  // A locked file keeps what the panel shows.
  isLocked = true
  await clock.advance(3000)
  expect(await ui.find({ type: 'Text', text: /New job/ })).toBeDefined()

  // A deleted file: with no project outline the panel turns to the chat tab,
  // and the project tab shows the "No outline yet" note.
  isLocked = false
  file = null
  await clock.advance(3000)
  expect(await ui.find({ type: 'Text', text: /No chat outline yet/ })).toBeDefined()
  await ui.press({ key: 'tab:project' })
  expect(await ui.find({ type: 'Text', text: /No outline yet/ })).toBeDefined()
  await ui.unmount()
})

test('a bullet with no mark has no check-off button', async ($, on) => {
  on('session.cwd', () => ({ value: 'C:\\dev\\recipes' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '## A\n- plain note\n- ☐ job' }))
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'mark:1' })).toBeUndefined()
  expect(await ui.find({ key: 'mark:2' })).toBeDefined()
  await ui.unmount()
})

test('retitle replaces the first title line, or adds one', () => {
  expect(retitle(FILE, '  Pill  Checker ')!.split('\n')[0]).toBe('# Pill Checker')
  expect(retitle(FILE, 'X')!.split('\n')).toHaveLength(9)
  expect(retitle('## A\n- ☐ one', 'New')).toBe('# New\n## A\n- ☐ one')
  expect(retitle(FILE, '   ')).toBeUndefined()
})

test('the title can be renamed from the panel, except on the phone', async ($, on) => {
  let file = FILE
  on('session.cwd', () => ({ value: 'C:\\dev\\recipes' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: file }))
  on('fs.write', (_, e) => {
    file = e.text
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
  expect(await phone.find({ key: 'title-edit' })).toBeUndefined()
  await phone.unmount()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'title-edit' })
  await ui.input({ key: 'title', text: 'Pill Checker' })
  expect(file.split('\n')[0]).toBe('# Pill Checker')
  expect(await ui.find({ type: 'Text', text: /Pill Checker/ })).toBeDefined()
  // Cancel leaves the file alone.
  await ui.press({ key: 'title-edit' })
  await ui.press({ key: 'title-cancel' })
  expect(file.split('\n')[0]).toBe('# Pill Checker')
  await ui.unmount()
})

const CHAT = ['# Add the scanner', '**Goal:** scan a barcode on the phone', '## Scanner', '- ◐ Camera opens'].join('\n')

test('the chat outline: where it is saved, its tab, and edits to its own file', async ($, on) => {
  const files: Record<string, string> = {}
  const norm = (path: string) => path.replace(/\\/g, '/')
  on('prompt.compose', () => ({ sections: [] }))
  on('session.cwd', () => ({ value: 'C:\\dev\\recipes' }))
  on('session.id', () => ({ value: 'chat-1' }))
  on('env.get', () => ({ value: 'C:\\Users\\k' }))
  on('fs.exists', (_, e) => ({ value: norm(e.path) in files }))
  on('fs.read', (_, e) => ({ value: files[norm(e.path)] ?? '' }))
  on('fs.write', (_, e) => {
    files[norm(e.path)] = e.text
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const compose = async () =>
    (await $.prompt.compose({ ...COMPOSE, traits: [] })).sections.at(-1)!.text

  // A project folder: the chat outline goes in the project.
  files['C:/dev/recipes/docs/outline.md'] = FILE
  expect(await compose()).toContain('C:\\dev\\recipes/docs/chat-outlines/chat-1.md')
  // A chat outline already kept outside stays there.
  files['C:/Users/k/.claude/chat-outlines/chat-1.md'] = CHAT
  expect(await compose()).toContain('C:\\Users\\k/.claude/chat-outlines/chat-1.md')

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The project tab shows first; the chat tab shows the chat's outline.
  expect(await ui.find({ type: 'Text', text: /Recipe App/ })).toBeDefined()
  await ui.press({ key: 'tab:chat' })
  expect(await ui.find({ type: 'Text', text: /Add the scanner/ })).toBeDefined()
  // A check-off on the chat tab edits the chat's file, never the project's.
  await ui.press({ key: 'chat:mark:3' })
  expect(files['C:/Users/k/.claude/chat-outlines/chat-1.md']!.split('\n')[3]).toBe('- ✓ Camera opens')
  expect(files['C:/dev/recipes/docs/outline.md']).toBe(FILE)

  // Rename and delete on the chat tab edit the chat's file too.
  await ui.press({ key: 'chat:title-edit' })
  await ui.input({ key: 'chat:title', text: 'Scanner work' })
  expect(files['C:/Users/k/.claude/chat-outlines/chat-1.md']!.split('\n')[0]).toBe('# Scanner work')
  // Its one job is done now, so the area folded: open it first.
  await ui.press({ key: 'chat:area:2:Scanner' })
  await ui.press({ key: 'chat:del:3' })
  await ui.press({ key: 'chat:yes:3' })
  expect(files['C:/Users/k/.claude/chat-outlines/chat-1.md']).not.toContain('Camera opens')
  expect(files['C:/dev/recipes/docs/outline.md']).toBe(FILE)

  // A rename box opened on one tab doesn't follow to the other.
  await ui.press({ key: 'chat:title-edit' })
  await ui.press({ key: 'tab:project' })
  expect(await ui.find({ key: 'title' })).toBeUndefined()
  expect(await ui.find({ key: 'title-edit' })).toBeDefined()
  await ui.unmount()
})

test('with no project outline the panel opens on the chat tab', async ($, on) => {
  on('session.cwd', () => ({ value: 'C:\\dev\\notes' }))
  on('session.id', () => ({ value: 'chat-2' }))
  on('env.get', () => ({ value: 'C:\\Users\\k' }))
  on('fs.exists', () => ({ value: false }))
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No chat outline yet/ })).toBeDefined()
  await ui.press({ key: 'tab:project' })
  expect(await ui.find({ type: 'Text', text: /No outline yet/ })).toBeDefined()
  await ui.unmount()
})

// Shared setup for the timestamp tests: an engine stand-in that streams each
// answer as one text chunk, a draw of one reply block, and a finished step.
// Each test stays short: a draw while a step is open waits for it.
const START = Date.UTC(2026, 9, 25, 22, 17)
const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

function timeKit($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) {
  const clock = mock.clock(on, { now: START })
  const state = { answer: '' }
  on('turn.step', async function* (_, e) {
    yield { kind: 'text', index: 0, text: state.answer, ref: 1 } as const
    return { turnId: e.turnId, index: e.index, answer: state.answer, toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('ui.render', ($, e) => {
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={String((e.props as { text: string }).text)} />
  })
  const mount = (text: string, isSummary?: true) =>
    $.ui.mount({
      plugin: 'project-outline',
      component: 'AssistantMessage',
      requestId: `msg_${text.length}-t0`,
      surface: 'desktop',
      props: { text, isFirstOfReply: true, ...(isSummary ? { isSummary } : {}) },
    })
  const draw = async (text: string, isSummary?: true) => {
    const ui = await mount(text, isSummary)
    const drawn = (await ui.find({ type: 'Markdown' }))?.text
    await ui.unmount()
    return drawn
  }
  const finish = async (text: string, agentId?: string) => {
    state.answer = text
    const chunks: string[] = []
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, ...(agentId ? { agentId } : {}) })
    let step = await stream.next()
    while (step.done !== true) {
      if (step.value.kind === 'text') chunks.push(step.value.text)
      step = await stream.next()
    }
    expect(chunks).toEqual([text])
    await clock.settle()
  }
  return { clock, state, mount, draw, finish }
}

test('a finished reply shows its time; others show none', async ($, on) => {
  const { draw, finish } = timeKit($, on)
  await finish('All   done here.')
  expect(await draw('All done here.')).toBe(`All done here.\n\n_${clockTime(START)}_`)
  // An unknown text, a summary, and a subagent's reply get no time.
  expect(await draw('Something else.')).toBe('Something else.')
  expect(await draw('All done here.', true)).toBe('All done here.')
  await finish('Agent words.', 'agent-1')
  expect(await draw('Agent words.')).toBe('Agent words.')
})

test('a block drawn while its reply streams gets its time once it ends', async ($, on) => {
  const { clock, state, mount, draw } = timeKit($, on)
  // "constructor" is just a text like any other, not a lookup of Object's.
  state.answer = 'constructor'
  const stream = $.turn.step({ turnId: 't', index: 1, model: 'm', messageCount: 1 })
  await stream.next()
  const live = await mount('constructor')
  expect((await live.find({ type: 'Markdown' }))?.text).toBe('constructor')
  while ((await stream.next()).done !== true) void 0
  await clock.settle()
  // Drawn again by the stamp it read, not mounted anew.
  expect((await live.find({ type: 'Markdown' }))?.text).toBe(`constructor\n\n_${clockTime(START)}_`)
  await live.unmount()
  expect(await draw('toString')).toBe('toString')
})

test('the same text in two replies shows no time at all', async ($, on) => {
  const { clock, state, draw, finish } = timeKit($, on)
  await finish('All done here.')
  // The second reply with that text, while it streams, doesn't borrow the
  // first one's time.
  state.answer = 'All done here.'
  const stream = $.turn.step({ turnId: 't', index: 1, model: 'm', messageCount: 1 })
  await stream.next()
  expect(await draw('All done here.')).toBe('All done here.')
  while ((await stream.next()).done !== true) void 0
  await clock.settle()
  expect(await draw('All done here.')).toBe('All done here.')
})
