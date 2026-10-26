# project-outline

A Claude Code mod that keeps you from getting lost in a long project.

- **Outline panel.** A side panel with a bird's-eye outline of the project: its goal, its areas, the jobs (✓ done, ◐ in progress, ☐ not started), the big decisions, and every change of mind, crossed out with the reason. Claude writes and updates it in `docs/outline.md`. Click a mark to check a job off, ✕ to delete one, an area to fold it, and ✎ to rename the outline.
- **This chat tab.** A second tab with an outline of just the current chat's work. It's saved in the project (`docs/chat-outlines/`) when the folder has a project outline, else in `~/.claude/chat-outlines/`.
- **End-of-work report.** After long work, Claude ends with a short plain-English report: Needs your OK, Done, Still to do, Heads up.
- **Reply times.** The time each reply finished, under it.

Type `/outline` to open the panel again after closing it.

## Install

At the prompt of a terminal session:

```
/plugin install project-outline --marketplace nachopenclaw-svg/project-outline
```

Answer `y` to add the marketplace, then pick a scope (the user scope loads it in every project).

From a shell:

```
claude plugin install project-outline --marketplace nachopenclaw-svg/project-outline
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nachopenclaw-svg/project-outline`, then Add plugin.

## Notes

- A folder whose `CLAUDE.md` says it isn't a project gets no project outline; its chats still get a chat outline.
- Reply times last for the session: after a restart, older replies show no time, never a wrong one.
