# pi-token-speed

A [Pi Coding Agent](https://pi.dev/) extension that displays real-time **tokens-per-second (TPS)** performance metrics in the status bar while the AI is streaming responses.

## Features

- **Real-time TPS tracking** — measures token throughput as the assistant generates text and thinking content
- **Time-to-first-token (TTFT)** — measures latency from user message to the first token being generated
- **Configurable sliding window** — adjust the window size to suit your server speed (default: 1s)
- **Color-coded speed indicators** — visual feedback based on performance thresholds
- **Provider-reported counting** — opt in to using provider-reported counts (e.g. Anthropic, OpenAI) instead of the extension's own counter
- **Fully configurable** — customize display, thresholds and colors via `~/.pi/agent/settings.json`

## Speed Tiers

| Tier       | TPS   | Color              |
| ---------- | ----- | ------------------ |
| 🟥 Slow    | 0–15  | `#ff4444` (red)    |
| 🟨 Medium  | 15–30 | `#ffaa00` (orange) |
| 🟩 Fast    | 30–45 | `#00ff88` (green)  |
| 🟦 Blazing | 45+   | `#44ddff` (cyan)   |

## Installation

This package is a Pi extension. Install it with

```bash
npm install pi-token-speed
```

or

```bash
pi install https://github.com/gsanhueza/pi-token-speed
```

## Configuration

You can customize the display, speed thresholds and colors by adding a `tokenSpeed` section to your `~/.pi/agent/settings.json`:

```json
{
  "tokenSpeed": {
    "tpsSlow": 0,
    "tpsMedium": 15,
    "tpsFast": 30,
    "tpsBlazing": 45,
    "colorSlow": "#ff4444",
    "colorMedium": "#ffaa00",
    "colorFast": "#00ff88",
    "colorBlazing": "#44ddff",
    "slidingWindow": 1000,
    "display": "tps",
    "useProviderTokens": false,
    "countStrategy": "direct",
    "endTpsBehavior": "average"
  }
}
```

### Configuration Validation

Invalid configuration values are automatically corrected to their defaults. A warning notification is displayed in the Pi status bar at session start listing any corrections made. The `slidingWindow` value is also clamped between `100ms` and `30000ms` (30s).

### Configuration Options

| Option              | Type                           | Default     | Description                                                      |
| ------------------- | ------------------------------ | ----------- | ---------------------------------------------------------------- |
| `tpsSlow`           | number                         | `0`         | Minimum TPS threshold ("slow")                                   |
| `tpsMedium`         | number                         | `15`        | TPS above this is "medium"                                       |
| `tpsFast`           | number                         | `30`        | TPS above this is "fast"                                         |
| `tpsBlazing`        | number                         | `45`        | TPS above this is "blazing"                                      |
| `colorSlow`         | string                         | `"#ff4444"` | Color for slow tier                                              |
| `colorMedium`       | string                         | `"#ffaa00"` | Color for medium tier                                            |
| `colorFast`         | string                         | `"#00ff88"` | Color for fast tier                                              |
| `colorBlazing`      | string                         | `"#44ddff"` | Color for blazing tier                                           |
| `slidingWindow`     | number                         | `1000`      | Sliding window duration in ms                                    |
| `display`           | `tps`, `ttft`, `stats`, `full` | `tps`       | Display mode (see below)                                         |
| `useProviderTokens` | boolean                        | `false`     | Opt-in: use provider-reported count instead of the extension one |
| `countStrategy`     | `estimate`, `direct`           | `direct`    | Token counting strategy used by the extension's own counter      |
| `endTpsBehavior`    | `average`, `last`              | `average`   | What to show after streaming ends                                |

### Interactive Menu

A small interactive menu is available when running `/tps` in the editor, where you can adjust:

- **Display mode** — what to show in the status bar
- **Use provider tokens** — use provider-reported counts instead of the extension's counter
- **Count strategy** — how the extension counts tokens (`estimate` or `direct`)
- **End-of-stream TPS** — what to show after streaming ends (`average` or `last`)

### Sliding Window

The sliding window determines how many recent tokens are used to calculate TPS. A larger window produces smoother readings at the cost of responsiveness; a smaller window reacts faster but can be noisier. To avoid burst spikes, the time span used in the calculation is clamped to a minimum threshold.

| Server speed        | Recommended window | Why                                                       |
| ------------------- | ------------------ | --------------------------------------------------------- |
| Fast (30+ tok/s)    | `1000` (default)   | Plenty of tokens in the window — accurate and responsive  |
| Medium (5–30 tok/s) | `1000`–`3000`      | Enough tokens for stable readings                         |
| Slow (< 5 tok/s)    | `5000`–`15000`     | Captures more tokens, avoiding spiky or unreliable values |

For example, if your server streams at ~1 tok/s, a 10-second window gives ~10 tokens per window — enough for a reasonable calculation:

```json
{
  "tokenSpeed": {
    "slidingWindow": 10000
  }
}
```

### Provider Token Counts

By default, this extension uses its own token counter — the same engine behind `countStrategy`. As an alternative, you can opt in to using the provider's own reported counts instead:

| Value             | Behavior                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `false` (default) | Use this extension's own counter (controlled by `countStrategy`)                            |
| `true`            | Use the provider's reported counts instead; fall back to `countStrategy` when not available |

The extension's own counter is the default and always available. Enable `useProviderTokens: true` when your provider reports accurate token counts and you'd prefer to use them instead.

### Count Strategy

When `useProviderTokens` is `false` (default) or when the provider doesn't report counts, the `countStrategy` determines how the extension's own counter works:

| Strategy           | Behavior                            |
| ------------------ | ----------------------------------- |
| `direct` (default) | Counts each delta as 1 token        |
| `estimate`         | Approximates tokens from delta text |

The `direct` strategy is fast and preserves the original behavior — it counts each streaming delta as 1 token, including toolcalls for `edit` and `write` operations. Use `estimate` when your server streams in small chunks — it approximates the real token count from the delta text, giving a more meaningful TPS reading.

> **Note:** Only `edit` and `write` tool call deltas are counted. Other tool calls (prompt processing) are excluded from token counting.

### Timer Pausing

The extension automatically pauses the TPS timer when a prompt processing tool call ends (any tool other than `edit` or `write`). This prevents tool processing time from skewing the TPS calculation. The timer resumes when the next token delta arrives.

### End-of-Stream TPS Behavior

After streaming ends, the `endTpsBehavior` option controls what TPS value is displayed:

| Behavior            | Behavior                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `average` (default) | Returns the overall average TPS (`total tokens / total elapsed seconds`). Consistent with the stats display.                                      |
| `last`              | Returns the last sliding window TPS measurement from the moment streaming stopped. Useful for seeing how fast the model was streaming at the end. |

This is also configurable via the `/tps` interactive menu.

## Display Modes

| Mode    | Description                                                                 |
| ------- | --------------------------------------------------------------------------- |
| `tps`   | `⚡ TPS: 25.0 tok/s` — TPS with color-coded speed tier                      |
| `ttft`  | `⚡ TPS: 25.0 tok/s (TTFT: 450 ms)` — TPS + time-to-first-token             |
| `stats` | `⚡ TPS: 25.0 tok/s (150 tok in 6.0s)` — TPS + token count and elapsed time |
| `full`  | `⚡ TPS: 25.0 tok/s (150 tok in 6.0s · TTFT: 450 ms)` — everything          |

## Commands

| Command | Description                                                                               |
| ------- | ----------------------------------------------------------------------------------------- |
| `/tps`  | Open settings menu — configure options described in [Interactive Menu](#interactive-menu) |

## How It Works

1. **Session Start** — Renders the initial status bar entry showing `⚡ TPS: --`
2. **Message Start** — When a user message starts, TTFT measurement begins
3. **First Token & Streaming Start** — The moment the first content block starts (`text_start`, `thinking_start`, or `toolcall_start`), the TTFT is recorded and the streaming engine starts tracking
4. **Token Update** — Each text/thinking delta is recorded. If `useProviderTokens` is `true` and the provider reports token counts, those are used directly; otherwise the extension's own counter (controlled by `countStrategy`) is used
5. **Sliding Window** — TPS is calculated using a configurable time window of token timestamps. When streaming ends, behavior depends on `endTpsBehavior`:
   - `average` (default): returns the overall average TPS for consistency with stats.
   - `last`: returns the last sliding window measurement.
6. **Agent End** — The authoritative token count (if available) is used to snap the total, ensuring the final average is exact. Streaming is stopped.

## Dependencies

| Peer dependency                   | Purpose             |
| --------------------------------- | ------------------- |
| `@earendil-works/pi-coding-agent` | Pi Coding Agent SDK |
| `@earendil-works/pi-tui`          | Pi TUI SDK          |
