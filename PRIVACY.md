# Privacy Policy — Manifesto

**Last updated:** April 2026

## What Manifesto Does

Manifesto is a Chrome extension that intercepts voice input on AI chat platforms, lets you review and edit your transcription, and then sends the cleaned text to the chat. It runs entirely in your browser.

## Data Collection

**Manifesto collects no data.** We do not operate any servers, databases, or analytics. No telemetry, no tracking, no cookies.

## Speech Recognition

Manifesto uses Chrome's built-in Web Speech API (`webkitSpeechRecognition`) for speech-to-text. This API is provided by Google and processes audio through Google's servers. Manifesto does not control, store, or have access to this audio data. This is the same speech recognition system used by Chrome natively.

For Google's privacy practices regarding speech recognition, see [Google's Privacy Policy](https://policies.google.com/privacy).

## AI Polish (Optional)

If you choose to configure an Anthropic API key in Manifesto's settings, the "AI Polish" feature sends the text you are currently editing to the Anthropic API for restructuring. This is entirely opt-in:

- No text is sent to any API unless you explicitly click the "AI Polish" button.
- Only the text visible in the editor at that moment is sent.
- The API key is stored in Chrome's sync storage and is never shared with anyone other than Anthropic's API endpoint.
- If you do not configure an API key, no network requests are made by Manifesto at all (beyond Chrome's own speech recognition).

## Local Storage

Manifesto stores the following in Chrome's sync storage:

- Whether the extension is enabled or disabled (boolean)
- Your API key, if you choose to enter one (string)
- Your preferred speech recognition language, if set (string)

No conversation content, transcriptions, or personal data is ever stored.

## Permissions

Manifesto requests the following Chrome permissions:

- **activeTab** — to inject the floating mic button and editor overlay on supported AI chat sites
- **storage** — to save your settings (enabled/disabled, API key, language)

Manifesto does not request access to browsing history, bookmarks, downloads, or any other browser data.

## Third-Party Services

| Service | When Used | What Is Sent |
|---------|-----------|--------------|
| Google Speech Recognition (via Chrome) | Every time you record | Audio from your microphone |
| Anthropic API | Only when you click "AI Polish" with an API key configured | The text in your editor |

## Contact

For questions or concerns about privacy, please open an issue on the [GitHub repository](https://github.com/your-username/manifesto).
