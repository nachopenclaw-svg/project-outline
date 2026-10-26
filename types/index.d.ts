// Which outline the panel shows: the project's or this chat's.
export type Kind = 'project' | 'chat'
// Areas the person opened or closed in the panel, by name (a chat area's
// name carries a "chat:" prefix): true open, false closed.
export type Folds = Record<string, boolean>
// Each reply text this session, flattened, with when Claude last finished it
// and how many replies had exactly that text.
export type Stamps = Record<string, { at: number; count: number }>

declare module 'claude-code' {
  interface PluginState {
    'project-outline': {
      // The project outline file's text; null when the project has none yet.
      text: string | null
      // This chat's outline file's text; null when the chat has none yet.
      chatText: string | null
      // The tab the person picked; null until they pick one.
      tab: Kind | null
      folds: Folds
      // The job waiting for "Delete?" to be answered, as its panel key.
      confirming: string | null
      // Whether the title shows as a text box to rename it.
      renaming: boolean
      stamps: Stamps
    }
  }
}
