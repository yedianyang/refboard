# Research: Figma CLI for OpenClaw

## Summary

Building a CLI to control Figma is feasible. The critical insight: Figma's REST API is mostly read-only for design content, so write operations require the Plugin API (runs inside Figma desktop, communicates via WebSocket).

## Peter Steinberger / OpenClaw Approach

- CLI-first, not MCP-first. He explicitly states CLIs are better for LLMs because "models already know how to use them, and pay zero context tax"
- Pattern: Thin CLI wrappers around service APIs. LLM discovers capabilities via `--help`
- His CLI portfolio: `go-cli` (Google), `bird` (Twitter), `spogo` (Spotify), `Peekaboo` (macOS GUI automation)
- OpenClaw itself is closed-source, transferring to a foundation as Peter joins OpenAI

## Figma API Capabilities

### REST API (Read-heavy, Limited Writes)

**Can do:**
- Read file structure, nodes, properties
- Export as PNG/SVG/JPG/PDF
- List components, styles, versions
- Manage comments (CRUD)
- Webhooks (CRUD)
- Variables CRUD (Enterprise only)

**Cannot do:**
- Create or delete frames, text, shapes, etc.
- Move, resize, or modify design elements
- Apply fills, strokes, effects
- Auto-layout operations

**Rate limits:** 10-20 req/min (Tier 1), 25-100 (Tier 2), 50-150 (Tier 3)

### Plugin API (Full Read/Write, Requires Figma Desktop)

- Can create ANY node type (Frame, Text, Rectangle, Ellipse, Component, etc.)
- Modify all properties (position, size, fills, strokes, effects, auto-layout)
- Create/apply styles
- Runs in Figma's JavaScript sandbox, communicates outward via WebSocket bridge

## Existing Tools

| Tool | Stars | Type | Read/Write |
|------|-------|------|------------|
| Figma-Context-MCP (GLips) | 13.1k | MCP | Read-only |
| Figma Official MCP | - | MCP | Read-only |
| cursor-talk-to-figma-mcp (Grab) | 6.3k | MCP + Plugin | Read/Write |
| figma-console-mcp | 355 | MCP + Plugin | Read/Write (56 tools) |

**Gap: No pure CLI tool exists.** All are MCP servers for IDE integration.

## Architecture Options

### Option A: REST-only CLI

```
CLI → Figma REST API → Cloud
```

Simple, no desktop needed. Read-only for design content.

### Option B: Plugin Bridge CLI

```
CLI → WebSocket → Figma Plugin → Plugin API → Canvas
```

Full read/write. Requires Figma desktop running.

### Option D: Hybrid (Recommended)

```
CLI → REST API (reads, exports, comments)
    → WebSocket → Plugin (create/modify designs)
```

Auto-detect whether Figma desktop + plugin is running.

## Recommended Roadmap

| Phase | Content | Effort |
|-------|---------|--------|
| P1 | REST API CLI (read, export, inspect) | 1-2 weeks |
| P2 | Plugin Bridge (create/modify elements) | 2-4 weeks |
| P3 | MCP adapter layer | 1 week |

## References

- cursor-talk-to-figma-mcp: https://github.com/grab/cursor-talk-to-figma-mcp
- Figma-Context-MCP: https://github.com/GLips/Figma-Context-MCP
- figma-console-mcp: https://github.com/southleft/figma-console-mcp
- Figma REST API: https://developers.figma.com/docs/rest-api/
- Peter Steinberger blog: https://steipete.me/posts/just-talk-to-it
