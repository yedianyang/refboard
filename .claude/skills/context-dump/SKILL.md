---
name: context-dump
description: Dump last 7 days of git history and project status for quick context recovery
disable-model-invocation: false
---

# Context Dump Skill

Quickly recover project context after a fresh session start or context compaction.

## What it generates

1. **Recent commits** (last 7 days)
   - Commit hash, date, message
   - Changed files summary

2. **Active branches**
   - Local and remote branches
   - Current branch indicator

3. **Uncommitted changes**
   - Staged files
   - Modified but unstaged
   - Untracked files

4. **Recent file changes**
   - Top 10 most changed files (by line count)
   - File size changes

5. **Project statistics**
   - Total commits in last 7 days
   - Contributors (if team project)
   - Lines added/removed

## When to auto-invoke

- At the start of new sessions
- After `/compact` context compression
- When Claude asks "What was I working on?"
- After coming back from a break (>24h)

## Manual trigger

```bash
/context-dump
```

Or in conversation:
```
Dump context for last week
```

## Output format

Markdown summary suitable for Claude to quickly understand:
- What features were recently added
- What's currently in progress
- What needs attention next
