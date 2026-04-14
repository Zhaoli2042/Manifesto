<table align="center">
  <tr>
    <!-- Image 1 -->
    <td align="center">
      <img src="programmer.png?v=1" width="200" alt="Programmers Before" />
    </td>
    <!-- Image 2 -->
    <td align="center">
      <img src="call.jpeg?v=1" width="200" alt="Programmers After" />
    </td>
  </tr>
  <tr>
    <!-- Caption 1 -->
    <td align="center">
      <strong>Programmers Before</strong>
    </td>
    <!-- Caption 2 -->
    <td align="center">
      <strong>Programmers After</strong>
    </td>
  </tr>
</table>

<p align="center">
  <img src="icons/icon128.png" width="80" height="80" alt="Manifesto icon" />
</p>

<h1 align="center">Manifesto</h1>

<p align="center">
  <strong>Speak your mind, send it right.</strong><br/>
  A Chrome extension that gives you a chance to fix what you said before the AI reads it.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/chrome-extension-yellow" alt="Chrome Extension" />
</p>

<p align="center">
  If Manifesto saves you time, consider giving it a ⭐ — it helps others find it!
</p>

---
## The Problem

Your voice is faster than your fingers — but it's not as precise. When you're explaining a technical concept, describing a bug, or outlining an architecture, typing lets you choose every word carefully. Speaking doesn't. You ramble, repeat yourself, use filler words, and lose structure.

That's why most developers still type into AI chats, even though speaking would be 3-4x faster. The tradeoff between speed and accuracy forces you to pick one.

**Manifesto gives you both.** Speak at the speed of thought, then review and fix your words before the AI sees them. Get the speed of voice with the precision of typing.

## How It Works

1. **Click the 💎 mic button** — a floating button appears on supported AI chat sites
2. **Speak naturally** — Chrome's built-in speech recognition transcribes in real time
3. **Review your sentences** — your speech is broken into individual sentence chips
4. **Fix what needs fixing:**
   - ✦ **Auto-clean** a sentence to strip filler words and fix grammar (free, no API)
   - 🎤 **Re-record** a sentence by speaking again
   - ✎ **Edit** the text by hand
   - ↕ **Drag** to reorder sentences
   - ✕ **Delete** sentences that don't belong
5. **Send it** — the cleaned text goes into the chat input and sends

Recording auto-stops after 2.5 seconds of silence, so you don't have to click a stop button.

## Supported Sites

| Platform | URL |
|----------|-----|
| Claude | claude.ai |
| ChatGPT | chatgpt.com |
| Gemini | gemini.google.com |
| Grok | grok.com |
| Kimi | kimi.com |
| Copilot | copilot.microsoft.com |

## Installation

### From source (Developer mode)

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the repository folder

The 💎 icon appears in your toolbar, and a floating mic button shows up on supported sites.

### Settings

Click the 💎 extension icon in your toolbar to access settings:

- **Enable/disable** the extension
- **API key** (optional) — add an Anthropic API key to enable AI-powered polish, which restructures your speech more intelligently than the local auto-clean
- **Language** — set a speech recognition language (e.g., `en-US`, `zh-CN`, `ja-JP`). Leave blank to auto-detect

## Features

### Sentence Chips

Your speech is split into individual sentences displayed as draggable cards. This is the core idea — editing a paragraph of transcribed speech is painful, but scanning and fixing individual sentences is fast.

### Auto-Clean (Free, No API)

The ✦ button runs a smart local cleanup that:

- Removes 30+ filler words and phrases (um, uh, like, you know, basically, "at the end of the day", etc.)
- Detects and removes false starts ("I want to — I need to" → "I need to")
- Collapses repeated phrases
- Strips hedging openers (so, well, okay, yeah)
- Merges short fragments into proper sentences
- Fixes punctuation and capitalization

Available per-sentence (✦ button on each chip) and for the full message (✦ Auto-Clean button in the footer).

### AI Polish (Optional)

If you add an Anthropic API key in settings, the **AI Polish** button sends your text to Claude for deeper restructuring — rewriting for clarity while preserving your meaning. This is optional and costs API tokens.

### Inline Re-recording

Every sentence chip has a 🎤 button. Click it to re-record just that one sentence without affecting the others. The "Speak a sentence" button at the bottom lets you keep adding to your message by voice.

### Editable Polish Preview

After auto-cleaning or AI polishing, the result is fully editable — click into it and make final tweaks before sending.

## Privacy

- **No data collection.** Manifesto does not send any data to any server (unless you configure an API key for the optional AI Polish feature, in which case only the text you explicitly polish is sent to the Anthropic API).
- **Speech recognition** uses Chrome's built-in Web Speech API, which processes audio through Google's servers. This is the same system Chrome uses natively — Manifesto does not add any additional audio processing or storage.
- **All processing is local.** Auto-clean runs entirely in your browser with no network calls.
- **Settings are stored locally** in Chrome's sync storage (synced across your Chrome profiles, not sent to third parties).

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## File Structure

```
manifesto/
├── manifest.json      # Chrome extension manifest (v3)
├── content.js         # Main logic — mic, speech recognition, editor overlay
├── overlay.css        # Styles for the floating button, listening overlay, and editor
├── popup.html         # Extension popup with settings
├── icons/
│   ├── icon48.png     # Toolbar icon
│   └── icon128.png    # Extension page icon
├── README.md
├── LICENSE
└── PRIVACY.md
```

## Requirements

- **Google Chrome** (or any Chromium-based browser like Edge, Brave, Arc)
- A working microphone
- Internet connection (required for Chrome's speech recognition)

## Contributing

Contributions are welcome! Some ideas for future work:

- Support for more AI chat platforms
- Custom filler word lists per language
- Keyboard shortcuts to trigger recording
- A companion CLI tool for terminal-based AI tools (Claude Code, Codex, etc.)

## License

MIT — see [LICENSE](LICENSE) for details.
