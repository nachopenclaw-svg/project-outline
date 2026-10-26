import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Kind, Stamps } from '../types'
import { block, isDone, parse, remove, retitle, spans, toggle } from './outline'
import { chatRules, RULES } from './rules'

const PANE = 'outline'
const KINDS = ['project', 'chat'] as const

const text = atom({ plugin: 'project-outline', key: 'text' } as const, null)
const chatText = atom({ plugin: 'project-outline', key: 'chatText' } as const, null)
const tab = atom({ plugin: 'project-outline', key: 'tab' } as const, null)
const folds = atom({ plugin: 'project-outline', key: 'folds' } as const, {})
const confirming = atom({ plugin: 'project-outline', key: 'confirming' } as const, null)
const renaming = atom({ plugin: 'project-outline', key: 'renaming' } as const, false)
const stamps = atom({ plugin: 'project-outline', key: 'stamps' } as const, {} as Stamps)

// The engine gives a drawn message no time and no id matching the stored
// reply, so a reply is matched to its finish time by its exact text. A text
// two replies share gets no time, since the drawing can't tell which it is.
// ponytail: kept for this session only; after an app restart older replies
// show no time (never a wrong one). $.store per session id would keep them.
const flat = (words: string) => words.replace(/\s+/g, ' ').trim()
// The text of the reply streaming now: a block drawn from it has no stamp
// yet and must not borrow an older reply's.
let live = ''
const clockTime = (at: number) =>
  new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
// The engine lists a mod's state by reading each call's atom by name, so
// these pick between the two with the atom written at each call.
const readText = ($: EngineInterface, kind: Kind) =>
  kind === 'project' ? read($, text) : read($, chatText)
const setText = ($: EngineInterface, kind: Kind, value: string | null) =>
  kind === 'project' ? update($, text, () => value) : update($, chatText, () => value)

// Paths are built from the session's folder: a bare relative path resolves
// against the engine process's folder, which need not be the project's.
const trim = (path: string) => path.replace(/[\\/]+$/, '')
const projectPath = async ($: EngineInterface) => `${trim(await $.session.cwd())}/docs/outline.md`

// A chat's outline lives in the project (docs/chat-outlines/) when the folder
// has a project outline, else in ~/.claude/chat-outlines/. Once its file
// exists it stays where it is, so a project outline made mid-chat moves nothing.
async function chatPath($: EngineInterface): Promise<string> {
  const cwd = trim(await $.session.cwd())
  const id = await $.session.id()
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  // No home folder: no chat outline, rather than a guessed place for it.
  if (!home) throw new Error('no home folder')
  const inProject = `${cwd}/docs/chat-outlines/${id}.md`
  const outside = `${trim(home)}/.claude/chat-outlines/${id}.md`
  if (await $.fs.exists(inProject)) return inProject
  if (await $.fs.exists(outside)) return outside
  return (await $.fs.exists(`${cwd}/docs/outline.md`)) ? inProject : outside
}

const pathOf = ($: EngineInterface, kind: Kind) =>
  kind === 'project' ? projectPath($) : chatPath($)

// null when there is no file yet; undefined when the file is there but can't
// be read right now (locked, too big), so the panel keeps what it shows.
async function load($: EngineInterface, kind: Kind): Promise<string | null | undefined> {
  try {
    const path = await pathOf($, kind)
    if (!(await $.fs.exists(path))) return null
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

// ponytail: polls both files every 3s to catch edits from Claude, an editor or
// another agent; a file watch would be instant if $ ever offers one.
async function refresh($: EngineInterface) {
  for (const kind of KINDS) {
    const now = await load($, kind)
    if (now === undefined || (await readText($, kind)) === now) continue
    await setText($, kind, now)
    // The jobs may have moved: a "Delete?" left showing would point at another.
    await update($, confirming, () => null)
  }
}

// Re-reads the file, applies one panel edit to it, and writes it back.
async function edit($: EngineInterface, kind: Kind, change: (now: string) => string | undefined) {
  const now = await load($, kind)
  if (now === null || now === undefined) return
  const out = change(now)
  if (out !== undefined) await $.fs.write(await pathOf($, kind), out)
  await setText($, kind, out ?? now)
  await update($, confirming, () => null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'outline',
      description: 'Open the outline panel: this project and this chat',
    })
    await refresh($)
    $.clock.every(3000, () => void refresh($).catch(() => undefined))
    void $.ui.open({ id: PANE, title: 'Outline' }).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'outline' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Outline' })

    return { text: 'Outline panel opened.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.traits.includes('teammate')) return composed
    const path = await chatPath($).catch(() => undefined)

    return {
      sections: [
        ...composed.sections,
        { id: 'project-outline:rules', text: RULES, scope: 'session' },
        ...(path === undefined
          ? []
          : [{ id: 'project-outline:chat', text: chatRules(path), scope: 'session' as const }]),
      ],
    }
  })

  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    const stream = next(e)
    let step = await stream.next()
    try {
      // Every chunk passes on unchanged; the main reply's text is watched.
      while (step.done !== true) {
        if (isMain && step.value.kind === 'text') live += step.value.text
        yield step.value
        step = await stream.next()
      }
      const result = step.value
      // A response with two text blocks draws them apart, matches neither, and
      // shows no time: rare, and never wrong.
      const text = flat(result.answer)
      if (isMain && text !== '') {
        const at = await $.clock.now()
        await update($, stamps, all => {
          const { [text]: old, ...rest } = all
          // Newest last; the oldest go past 300 texts.
          const kept = Object.entries(rest).slice(-299)
          return { ...Object.fromEntries(kept), [text]: { at, count: (old?.count ?? 0) + 1 } }
        })
      }
      return result
    } finally {
      // Only once the stamp is in, so no block of this reply borrows an older one.
      if (isMain) live = ''
      // Stopped early (an interrupt): close the request beneath too.
      // There is no result to hand back then, hence the cast.
      if (step.done !== true) await stream.return?.(undefined as never)
    }
  })

  // The time Claude finished a reply, under it; nothing for a reply with no
  // known time, a text two replies share, or a reply still streaming.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // Read first: the read is what redraws this block once its time is in.
    const all = await read($, stamps)
    const shown = flat(e.props.text)
    if (e.props.isSummary || shown === '' || flat(live).includes(shown)) return next(e)
    const stamp = Object.hasOwn(all, shown) ? all[shown] : undefined
    if (stamp === undefined || stamp.count > 1) return next(e)

    return next({ ...e, props: { ...e.props, text: `${e.props.text}\n\n_${clockTime(stamp.at)}_` } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    // The phone app draws no text box, so it gets no rename control.
    const Input = e.surface !== 'mobile' && 'Input' in elements ? elements.Input : undefined
    const project = await read($, text)
    // No tab picked yet: the project's outline when there is one.
    const kind: Kind = (await read($, tab)) ?? (project === null ? 'chat' : 'project')
    const file = kind === 'project' ? project : await read($, chatText)
    // Keys of the chat tab carry a prefix, so a press always edits the file it drew.
    const at = (key: string) => (kind === 'project' ? key : `chat:${key}`)

    const tabs = (
      <Box flexDirection="row" gap={1}>
        {KINDS.map(one => (
          <Button
            key={`tab:${one}`}
            plain
            dimColor={one !== kind}
            label={one === kind ? `[ ${one === 'project' ? 'Project' : 'This chat'} ]` : one === 'project' ? 'Project' : 'This chat'}
            onPress={async () => {
              // A rename box left open belongs to the tab it was opened on.
              await update($, renaming, () => false)
              await update($, tab, () => one)
            }}
          />
        ))}
      </Box>
    )

    if (file === null) {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Text bold>{kind === 'project' ? 'No outline yet' : 'No chat outline yet'}</Text>
          <Text dimColor>
            {kind === 'project'
              ? 'Claude writes docs/outline.md the first time it does real work in this project.'
              : 'Claude starts one once this chat does real work.'}
          </Text>
        </Box>
      )
    }

    const outline = parse(file)
    const opened = await read($, folds)
    const pending = await read($, confirming)
    const isRenaming = Input !== undefined && (await read($, renaming))
    const title = outline.title || (kind === 'project' ? 'Outline' : 'This chat')
    const styled = (line: string) =>
      spans(line).map(one => (
        <Text {...(one.strike ? { strikethrough: true } : {})} {...(one.bold ? { bold: true } : {})}>
          {one.text}
        </Text>
      ))

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        <Box flexDirection="column">
          {isRenaming && Input ? (
            <Box flexDirection="row" alignItems="flex-start" gap={1}>
              <Box flexGrow={1} flexShrink={1}>
                <Input
                  key={at('title')}
                  value={title}
                  submitLabel="save"
                  autoFocus
                  onSubmit={async value => {
                    await edit($, kind, now => retitle(now, value))
                    await update($, renaming, () => false)
                  }}
                />
              </Box>
              <Button
                key={at('title-cancel')}
                plain
                dimColor
                label="Cancel"
                onPress={() => update($, renaming, () => false)}
              />
            </Box>
          ) : (
            <Box flexDirection="row" alignItems="flex-start" gap={1}>
              <Box flexShrink={1}>
                <Text bold>{title}</Text>
              </Box>
              {Input && (
                <Button
                  key={at('title-edit')}
                  plain
                  dimColor
                  label="✎"
                  onPress={() => update($, renaming, () => true)}
                />
              )}
            </Box>
          )}
          {outline.goal !== '' && <Text dimColor>Goal: {outline.goal}</Text>}
        </Box>
        {outline.areas.length === 0 && <Text dimColor>No areas yet.</Text>}
        {outline.areas.map(area => {
          const done = isDone(area)
          const fold = at(area.name)
          const isOpen = opened[fold] ?? !done

          return (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Button
                  key={at(`area:${area.line}:${area.name}`)}
                  plain
                  label={`${isOpen ? '▾' : '▸'} ${area.name}`}
                  onPress={() => update($, folds, all => ({ ...all, [fold]: !isOpen }))}
                />
                {done && <Text color="success">✓</Text>}
                {!isOpen && <Text dimColor>({area.items.length})</Text>}
              </Box>
              {isOpen && (
                <Box flexDirection="column">
                {area.items.map(item => {
                  const raw = block(file, item.line)
                  const asking = at(String(item.line))

                  // flex-start keeps the mark and ✕ on the job's first line,
                  // not halfway down its notes.
                  return (
                    <Box flexDirection="row" alignItems="flex-start" gap={1} paddingLeft={2}>
                      {item.mark === null ? (
                        <Text dimColor>•</Text>
                      ) : (
                        <Button
                          key={at(`mark:${item.line}`)}
                          plain
                          label={item.mark}
                          onPress={() => edit($, kind, now => toggle(now, item.line, raw))}
                        />
                      )}
                      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                        <Text>{styled(item.text)}</Text>
                        {item.notes.map(note => (
                          <Box
                            flexDirection="row"
                            alignItems="flex-start"
                            paddingLeft={note.depth * 2 - 1}
                            gap={1}
                          >
                            <Text dimColor>–</Text>
                            <Box flexShrink={1}>
                              <Text dimColor>{styled(note.text)}</Text>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                      {pending === asking ? (
                        <Box flexDirection="row" gap={1}>
                          <Text dimColor>Delete?</Text>
                          <Button
                            key={at(`yes:${item.line}`)}
                            plain
                            label="Yes"
                            onPress={() => edit($, kind, now => remove(now, item.line, raw))}
                          />
                          <Button
                            key={at(`no:${item.line}`)}
                            plain
                            label="No"
                            onPress={() => update($, confirming, () => null)}
                          />
                        </Box>
                      ) : (
                        <Button
                          key={at(`del:${item.line}`)}
                          plain
                          dimColor
                          label="✕"
                          onPress={() => update($, confirming, () => asking)}
                        />
                      )}
                    </Box>
                  )
                })}
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
