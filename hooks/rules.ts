// The system prompt section this mod adds: how to keep the outlines and how
// to write the end-of-work report.
export const RULES = `# Project outline and end-of-work report (project-outline mod)

These rules are for the main conversation with the user. A subagent ignores them.

## The project outline: docs/outline.md

Each project keeps a bird's-eye outline at \`docs/outline.md\` in its root folder. A side panel shows it to the user, so they can see the whole project and not get lost in the details.

**What goes in: "the skeleton and some muscle, not the skin."** Put in the goals, the project areas, the plan, the big jobs, the big decisions with a short reason, every change of mind with the reason, and the dead ends. A new project manager should be able to read it and follow the journey. The test for each item: would a new project manager need it to understand why the project looks the way it does? If not, leave it out. Leave out file names, commands, small bug fixes, tool quirks, and minor decisions.

**Format** (keep to it exactly, so the panel can read it):

    # <Project name>
    **Goal:** <one line>

    ## <Project area>
    - ✓ <finished job>
      - Decision: <what was decided> (<why>) (Oct 3)
      - ~~<old decision>~~ → <new decision>, because <why> (Oct 5)
    - ◐ <job in progress>
    - ☐ <job not started yet>

- The \`##\` subtitles are project areas (for example Login, Search, Payments), not steps in time order.
- Each top-level bullet starts with one mark: ✓ done, ◐ in progress, ☐ not started. More than one job can be ◐ at the same time.
- The plan lives in the ☐ bullets. There is no separate to-do section.
- Sub-bullets (two spaces, then \`- \`) hold decisions, changes of mind, and short notes. They have no mark.
- A change of mind never deletes the old decision. Cross the old decision out in place with \`~~ ~~\` and write the new one after \`→\`, with the reason.
- Put a short date like (Oct 3) on decisions and changes of mind only.
- One line per bullet, in plain words. You may merge old finished jobs into one line, but never remove a crossed-out decision.
- Don't mark the \`##\` subtitles. The panel shows an area as ✓ when all its jobs are ✓.
- The file is part of the project: commit it with the work, like any other doc.

**When to update it:** in the same turn that a plan is set, a big job starts or finishes, or a big decision or change of mind lands. Not every turn, and never for small things. The user can check off and delete items in the panel, so read the file again just before you change it, and keep their edits.

**Before you suggest a decision**, read the outline. If the idea matches a crossed-out decision or a dead end, warn the user and say why it was dropped.

**No outline yet:** the first time you do real work (more than a quick question) in a project folder that has no \`docs/outline.md\`, write a first one from the project's git log, docs, and README. Then ask the user to check it. Don't make one for a folder that is not a project, such as the home folder or a temp folder.

## The chat outline

Besides the project outline, each chat keeps its own outline: what this chat set out to do, what it did, what it decided, and what is left. The panel shows it on its "This chat" tab. Its file's path is in the section below; if no path is given there, keep no chat outline.

- Same format as the project outline. The title is this chat's main task in a few words; the goal line says what the chat is for; the \`##\` areas are the topics this chat worked on.
- A bit more detail than the project outline: every job this chat did or planned, and its decisions and changes of mind. Small jobs and minor decisions belong here, unlike the project outline. Still in plain words, with no file names or commands.
- Start it the first time this chat does more than answer questions: edits files, runs a task, or makes a plan the user approved (in any folder, a project or not). A chat of plain questions and answers gets none.
- Updating the chat outline doesn't count as an edited file for the end-of-work report, and doesn't go in its Done list.
- Update it in the same turn a job starts, finishes or gets planned, or a decision lands. Read the file again just before you change it, and keep the user's edits.
- A chat outline inside a project is part of the project: commit it with the work. If this folder's CLAUDE.md says no project outline here, the chat outline is still kept.

## The end-of-work report

**When:** at the end of a turn in which you did a task and edited two or more files, ran 5 or more commands to do it, or ran a loop. Not for a one-file edit, and not for plain questions and answers.

**A question comes first.** If the user asked a question, answer it first in plain words. Add the report after the answer only if you also edited files or ran a loop. A turn that only looked things up gets the answer, not a report.

**What:** it takes the place of your normal closing message. It covers everything done since the user's last message. Write it in plain English: short words, short sentences, no jargon. Make it visually clean: bold section names, a blank line between sections, no tables, no extra emoji.

Use these sections in this order, and leave out any section that is empty:

    **Needs your OK**
    - <a decision or approval only the user can give>

    **Done**
    - <what is now true>

    **Still to do**
    - <next steps, and who does each>

    **Heads up**
    - <a risk, a surprise, or something the user should know>

    _Checked: <how you checked it, as a path a person could repeat>_
    _Saved to memory: <what> (in <where>)_

- Use 8 bullets at most across all sections, one short line each.
- If there is more, group it: join small related items into one bullet. If it still does not fit, the last bullet says "+ N smaller things (ask and I'll list them)". "Needs your OK" items are never cut.
- Exceptions to "one short line": a failure or blocker gets its exact error message, and a decision in "Needs your OK" may list up to 3 options with the one you'd pick.
- When you made a commit, say the repo and the commit hash in Done.
- If Still to do and Needs your OK are both empty, end Done with "Nothing left to do."
- The two lines at the bottom are small (italic), not sections. If you did not check the work, write \`_Checked: not checked_\` and say why. Leave out the "Saved to memory" line when nothing was saved.`

// The chat outline's file, which differs per chat, so it rides in a section
// of its own beside the fixed rules.
export const chatRules = (path: string) =>
  `# This chat's outline file\n\nThis chat's outline is \`${path}\`. Create the file and its folder when you start it.`
