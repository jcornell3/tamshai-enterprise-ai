# Update Context - CLAUDE.md Management

Maintain context persistence by updating `CLAUDE.md` with the current implementation state.

## Purpose

This skill ensures continuity across sessions by creating "save points" in the project documentation. If a session is compacted or restarted, the agent can resume from this documented state.

## What to Update

Add or update the following section in `CLAUDE.md`:

```markdown
## Current Implementation State

**Last Updated**: [ISO timestamp]
**Active Phase**: [Phase number and name from plan]
**Working Branch**: [branch name if applicable]

### Completed in This Session
- [List of completed tasks]

### In Progress
- [Current task being worked on]
- [Blockers or open questions]

### Technical Debt Noted
- [Any shortcuts taken]
- [Items deferred for later]

### Next Steps
1. [Immediate next action]
2. [Following actions]
```

## When to Use This Skill

1. **Before starting a major task** - Document the starting state
2. **After completing a milestone** - Record achievements
3. **When encountering blockers** - Note issues for future sessions
4. **Before ending a session** - Create a resumption point

## Guidelines

- Be specific about file paths and line numbers
- Include any configuration changes made
- Note environment-specific details (dev vs stage vs prod)
- Reference relevant spec files in `.specify/`
- Keep entries concise but complete

## Output

After updating `CLAUDE.md`, confirm:
1. What section was updated
2. Summary of the state recorded
3. Any follow-up actions needed
