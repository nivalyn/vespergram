# Vesper — message archive

A local-first reader for your Instagram Direct Messages export. Vesper imports the official
JSON archive, reconstructs every conversation, and lets you read from the newest message all the
way back to the absolute first one — without logging in, calling Instagram, or uploading chat
content anywhere.

> Vesper is an independent project. It is not affiliated with Instagram or Meta.

## Why

Instagram's export is technically complete but practically hard to read: conversations are split
across numbered `message_N.json` shards, arrays are newest-first, text is sometimes mojibake,
media paths are relative, and timestamps appear in several shapes. Vesper normalizes all of it
into a private, searchable timeline that stays in your browser.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the production build
npm test           # Vitest suite
```

Open the app, choose **Import archive**, and select the extracted Instagram export folder (the
folder containing `your_instagram_activity/messages` or `messages/inbox`). If your browser does
not support a directory picker, select the JSON files directly or drag the extracted folder onto
the import dialog.

### Getting your export

In Instagram: **Accounts Center → Your information and permissions → Download your information →
Messages**. Request a JSON export (not HTML), download it, and unzip it before importing. Vesper
does not open `.zip` files directly.

## What is supported

- **Archive layout:** `messages/inbox/` and `messages/message_requests/`, `message_1.json`,
  `message_2.json`, … with arbitrary path prefixes such as `your_instagram_activity/`.
- **Merging:** numbered shards in one folder are merged into one conversation; overlapping
  fragments are de-duplicated; ordering is deterministic across identical timestamps.
- **Text:** Unicode, emoji, multiline messages, links, malformed/missing fields, and the common
  UTF-8-decoded-as-Latin-1 mojibake in Instagram exports.
- **Participants:** direct chats, groups, message requests, former participants, and senders that
  are missing from the participant list.
- **Message types:** text, photos, videos, audio, voice notes, GIFs, stickers, files, shared
  posts/reels with previews, audio/video calls, unsent messages, deleted/unavailable messages,
  and geo-blocked media placeholders.
- **Metadata:** reactions, replies' attachment references, call duration, source shard and index,
  and import warnings.
- **Ownership detection:** `personal_information.json`, then the username in the export folder
  name, then inference from participants/activity. You can override it in Settings.
- **Multiple archives:** import several exports and switch between them. Each can be removed
  independently.
- **Media:** files are never copied into IndexedDB. They are resolved in place from a linked
  folder (persistent in Chromium via the File System Access API) or from the files selected for
  the current session. External URLs are shown as references and are never fetched.

## Reading and navigation

- Opens at the latest message of the most recently active conversation.
- Virtualized timeline with a **Beginning of conversation** marker and an end-of-timeline marker.
- Jump to the beginning or latest message from the header or with `Home` / `End`.
- Date navigator lists every active day and jumps to its first message.
- The complete conversation is loaded — there is no pagination or arbitrary message cap.
- Read position is remembered per conversation.
- Text size, density, media-gallery visibility, and motion preferences are adjustable.
- Responsive three-panel layout: conversations, messages, and optional details, with a mobile
  conversation view and details drawer.

## Search

- Conversation search in the sidebar, with case- and accent-insensitive matching.
- In-conversation message search with highlighted hits, result counts, and Enter / Shift+Enter
  navigation.
- Global command palette (`Ctrl/Cmd+K`) for conversations and messages in the open conversation.
- Unicode-aware matching and snippets; no search index leaves the browser.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl/Cmd+K` | Open global search |
| `/` | Search the current conversation |
| `Enter` / `Shift+Enter` | Next / previous message result |
| `Home` / `End` | Jump to first / latest message |
| `Esc` | Close search, dialog, details, or media viewer |
| `←` / `→` | Move through media in the viewer |

## Privacy and storage

- Parsing runs in a Web Worker when available, with a main-thread fallback.
- Normalized messages, conversation metadata, settings, and read positions are stored in
  IndexedDB under the database name `vesper-archive`.
- Media files remain in the folder you selected. Only their relative paths and match status are
  indexed.
- The app makes no network requests with your messages. Fonts are self-hosted; there are no
  analytics, trackers, or third-party APIs.
- Archive removal and **Clear all Vesper data** are available in Settings. Deleting an archive
  removes its conversations, messages, and derived indexes from the browser. Your original export
  is untouched.
- Browser storage can be evicted under pressure. Settings includes a persistent-storage request;
  keep your original export as the source of truth.

## Architecture

```
src/
  App.tsx                  application shell, landing page, shortcuts, dialogs
  state/AppContext.tsx     archive/conversation state, media access, settings, notices
  components/
    sidebar/               archive switcher and conversation list
    chat/                  chat header, in-conversation search, virtualized timeline
    messages/              bubbles, attachments, audio/video, shares, highlights
    details/               participants, archive stats, media gallery, provenance
    import/                folder/file/drag import, progress, summary
    settings/              identity, reading preferences, storage, deletion
    search/                global command palette
    media/                 lightbox viewer
  lib/
    instagram/parse.ts     schema normalization, shard merge, dedupe, ordering, owner detection
    db/database.ts         IndexedDB schema, chunked writes, loading, deletion
    search.ts              Unicode folding, highlights, message search, date buckets
    fs/archiveSource.ts    directory picker, drag-and-drop traversal, file indexing
    import/                worker orchestration, media matching, persistence
  workers/import.worker.ts parsing worker
  test/                    parser, persistence, search, timeline, and app smoke tests
```

### Ordering and deduplication

Messages are ordered by `timestamp_ms` when present (seconds-based `timestamp`, `created_at`, and
`creation_timestamp` are normalized), then by shard number (higher shard numbers contain older
messages), then by original array position, then by a stable ID. Duplicate detection uses
timestamp, sender, text, attachment URIs, share link, and call duration, and only removes matches
that occur in different shard files. The original normalized message record is always retained;
nothing is hidden from the timeline.

### Owner detection

1. `personal_information.json` (highest confidence).
2. Username embedded in the export folder name (`instagram-<username>-YYYY-MM-DD-…`).
3. Inference from participants and message activity.
4. Manual override in Settings.

## Tests

The suite uses synthetic fixtures only. It covers:

- realistic parsing, mojibake repair, missing fields, unsent/unavailable/call/media messages;
- message requests, groups, empty conversations, malformed JSON, and loose JSON files;
- numbered shard merging, chronological ordering, identical timestamps, and de-duplication;
- owner detection from personal information, folder name, and participant activity;
- persistence, ordered loading, settings defaults, chunked 5,000-message writes, and archive
  deletion from IndexedDB;
- Unicode/case-insensitive search, emoji/multiline snippets, highlight ranges, date buckets, and
  result wraparound;
- timeline opening at latest, read-position restoration, first/last jumps, and search/deep-link
  scrolling;
- a 100,000-message synthetic export with no truncation;
- application boot, import, summary retention, and clear-data controls.

Run `npm test`. The production build is verified with `npm run build`.

## Limitations

- The full conversation is loaded into memory for rendering. Virtualization keeps the DOM small,
  but extremely large threads still consume memory proportional to their message count. The
  100,000-message test covers parsing and ordering, not a browser performance benchmark.
- Global search covers all conversation names but only the message history of the currently open
  conversation. There is no cross-archive full-text index yet.
- Persistent folder access uses the File System Access API. Chromium-based browsers support it;
  Firefox and Safari fall back to file selection, where media is available for that tab session
  only and can be relinked later.
- Media previews depend on the extracted files still being present. Missing files are shown as
  explicit placeholders rather than silently omitted.
- Instagram's export formats change over time. Unknown fields are ignored, malformed files are
  reported as import warnings, and the original normalized records are kept for debugging.
- The reader is read-only: it cannot send messages, mark conversations as read on Instagram, or
  modify the original export.
- HEIC/HEIF images render only when the browser supports them.
