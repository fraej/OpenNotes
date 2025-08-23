# OpenNotes
### Local Folder Explorer + Markdown / HTML Editor (Chromium + File System Access API)


OpenNotes is a 100% client‑side web app that lets you pick a local directory, browse a live tree, preview Markdown / HTML / PDF files, play embedded images / videos / audio (only when referenced inside documents), and edit Markdown & HTML in place. Rendering math (KaTeX) happens at view time. All file operations stay on your machine—no server, no upload.

> Important: The app is **Chromium-only** (Chrome, Edge, Brave, etc.) because it uses the File System Access API (`showDirectoryPicker`). You can open it directly via `file://` (double‑click `index.html`) — a local server is optional, not required.

## ✨ Key Features
* Real folder access via the File System Access API (no legacy `<input webkitdirectory>` fallback)
* Lazy, expandable folder tree (incremental load of deep structures)
* Instant preview:
	* Markdown (markdown-it + KaTeX for inline & block math after render)
	* HTML (sanitized; KaTeX auto-render pass)
	* PDF (native browser viewer)
	* Embedded Audio (HTML5 `<audio>` inside Markdown/HTML docs only; no standalone audio file preview)
* Editing:
	* Markdown: Toast UI Editor (math not live-rendered while typing now; appears after save in viewer)
	* HTML: SunEditor (media paths preserved; math rendered after save)
* Media pipeline: resolves relative images / video / audio to Blob URLs without breaking original source paths on save
* Deferred media processing eliminates transient 404s for unresolved relative assets
* Direct save back to original file via File System Access handles
* Offline-friendly after first CDN fetch (optionally vendor libraries)

## 🗂 Supported File Types
| Type | Preview | Editable | Notes |
|------|---------|----------|-------|
| `.md` | Yes | Yes (Markdown + WYSIWYG) | Math rendered after save |
| `.markdown` | Yes | Yes | Alias of Markdown |
| `.html`, `.htm` | Yes | Yes (WYSIWYG) | Sanitized; math after save |
| `.pdf` | Yes | No | Native viewer (no annotations) |
| Audio (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`) embedded in docs | Yes (when embedded) | Via doc | No standalone open |
| Embedded video (`<video>` tags) | Yes | In doc | Relative sources resolved |
| Standalone video files (`.mp4`, `.webm`, etc.) | Indirect | No | Play via embed in HTML/MD |
| Images (`.png`, `.jpg`, `.svg`, etc.) | Via embed | No | Resolved to Blob at runtime |

## 🔐 Privacy & Security Model
* Everything runs locally in your browser process—no network upload of file contents.
* The File System Access permission is scoped only to the directory you choose.
* HTML is sanitized (scripts, inline event handlers, style tags stripped) before display.
* Generated Blob URLs for images are revoked when no longer needed.

## ✅ Requirements
* **Browser:** Chromium 96+ (Chrome, Edge, Brave, etc.) with File System Access API.
* **Launch:** Either double‑click `index.html` (file://) or serve locally (optional). Both work in current Chromium builds.
* **Permissions:** Grant read/write access to the chosen folder when prompted.
* **First Load Assets:** External CDN scripts (editors, KaTeX) need initial network access; afterward the app can function offline (subject to browser caching policies).

## 🚀 Quick Start
1. Clone or download this repository.
2. Double‑click `index.html` (opens via `file://` in Chrome/Edge/Brave).
3. Click **Open Folder** and pick a directory.
4. Browse → select a file to preview → (optionally) **Edit** → **Save**.

### Optional: Run a Local Server
Only needed if you prefer a localhost URL or want tighter control over caching:
* Python: `python -m http.server 8080`
* Node: `npx http-server -p 8080` or `npx serve .`

Then visit `http://localhost:8080/`.

> If you see an “Unsupported Browser” banner, you are likely on a non‑Chromium browser.

## ✏️ Editing Workflow
* Click a file → Preview loads.
* Press the edit button → Appropriate editor (Markdown dual-mode or HTML WYSIWYG) appears.
* Make changes → Save writes directly back to the file handle.
* View refreshes using the just-saved content (order of operations avoids stale caching).

## 🧮 Math / LaTeX
Math is rendered with KaTeX in the viewer (after save). While editing:
* Markdown editor: raw `$...$` / `$$...$$` remains visible (no live transform) for performance & simplicity.
* HTML editor: raw delimiters remain; rendered after save.

Example block:
```
$$
\int_a^b f(x)\,dx = F(b) - F(a)
$$
```

Example inline: `$E=mc^2$`.

## 🖼 Media Handling Details (Images / Video / Audio)
* Sources in documents stay as original relative paths in saved files.
* At render time, each relative path is resolved inside the chosen root, replaced in-DOM with a Blob URL (metadata attributes retain original path for restoration on save).
* Missing media quietly logs a console warning; enhancement: surface a visual badge.
* Video & audio tags with nested `<source>` elements are processed the same way.
* During editing, blob substitution prevents the browser from firing failing `file://` requests.

## 🧱 Project Structure (excerpt)
```
index.html      # Entry point
app.js          # Folder picking, tree, rendering (markdown/html/pdf), media resolution
editor.js       # Editing lifecycle + media handling (math deferred to viewer)
styles.css      # Core styling
```

## 🔄 Future Ideas / Roadmap (Not Yet Implemented)
* Image/video/audio missing indicator & retry UI
* Rename / delete / create files & folders
* Theme toggle (dark / light)
* KaTeX live preview toggle in editors
* Service worker to pin CDN assets offline
* Standalone video file direct viewer

## 🧪 Testing Tips
* Nested relative paths (`../images/foo.png`) in Markdown & HTML.
* Mixed media: image + video + audio tags in one HTML file.
* Math blocks at top / bottom / inside lists.
* Large folder to watch lazy expansion performance.
* Save edited HTML with images: verify original relative paths persisted (no `blob:` in source).

## ⚠️ Limitations
* Non-Chromium browsers are blocked (no polyfill provided).
* Initial load needs network for CDN assets (unless you vendor them locally).
* Very large directories: initial expansion can still be costly (lazy, but no virtualization/virtual scrolling yet).
* PDF is view-only; no annotation features.
* Standalone audio/video files are not opened directly; embed them inside Markdown/HTML.
* No conflict detection if files change on disk outside the app (last save wins).

## 🛠 Local Development Notes
No build step: plain HTML/JS/CSS.

Enhancement workflow:
1. (Optional) Run a local server (see Quick Start) for cleaner console paths.
2. Edit `app.js` / `editor.js` (see annotations below).
3. Refresh; changes apply immediately (no bundler).

If you want to vendor external CDN scripts for offline use, download them into a `vendor/` directory and update the `<script>` / `<link>` tags in `index.html`.

## ❓ Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Unsupported banner shows | Non-Chromium browser | Use Chrome / Edge / Brave |
| Images / audio not appearing | Path outside selected root or typo | Verify relative path, check console warning |
| Opening audio file shows message | Standalone audio disabled | Embed `<audio>` in a Markdown/HTML file |
| Math raw in editor | Live math intentionally disabled in editor | Save & view to render |
| Math not rendering in viewer | KaTeX CDN blocked | Check network, reload page |
| Save fails | Permission revoked or handle stale | Re-open folder (grants fresh handles) |
| PDF not showing | Browser blocks viewer params | Remove hash params or try different Chromium build |

## 📄 License
Distributed under the GNU GPL v3 (see `LICENSE`).

## 🧩 Implementation Annotations
| Feature | Key Code Locations |
|---------|--------------------|
| Folder tree & VFS | `app.js`: `buildVFSFromDirectoryHandle`, `populateDir` |
| File open routing | `app.js`: `openFile` |
| Markdown render | `app.js`: `renderMarkdown` |
| HTML render & sanitize | `app.js`: `renderHTML` |
| Media resolution (img/video/audio) | `app.js`: `processMediaInDOM`, `processImagesInDOM` alias |
| Math rendering (viewer) | `app.js`: inside `renderMarkdown` & `renderHTML` KaTeX pass |
| Editors (Markdown / HTML) | `editor.js`: `_initToast`, `_initSun`, `startEditing` |
| Media in editors | `editor.js`: `_refreshMedia`, `_prepareHTMLContentForEditor`, `_normalizeHTMLMedia` |
| Save lifecycle | `editor.js`: `finishEditing`, `_save` |
| PDF viewer | `app.js`: `renderPDF` |
| (Embedded audio handled) | `app.js`: `processMediaInDOM` |
| Permissions / unsupported banner | `app.js`: DOMContentLoaded section |

## 🤝 Contributing
Issues & PRs welcome—please keep changes lean (no heavy build pipeline). Open a PR with a concise description & rationale.

---
Enjoy fast local browsing & editing! If this helps you, consider starring the repo.

