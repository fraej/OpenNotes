# OpenNotes
### Local Folder Explorer + Markdown / HTML Editor (File System Access + Fallback Mode)

OpenNotes is a 100% client‑side web app that lets you pick a local directory, browse a live tree, preview & edit Markdown / HTML, view PDFs, and directly preview standalone images, video, and audio files. Rendering math (KaTeX) happens at view time. All file operations stay on your machine—no server, no upload.

> Full direct read/write works in Chromium browsers via the File System Access API. A portable fallback (using `browser-fs-access`) now enables Firefox / Safari usage with a virtual file set + "Save As" style writes (limitations noted below). You can open it directly via `file://` (double‑click `index.html`).

## ✨ Key Features
* Real folder access via File System Access API (Chromium) OR portable fallback (`browser-fs-access`) for non‑Chromium browsers.
* Lazy, expandable folder tree (incremental load for deep hierarchies).
* Instant preview:
	* Markdown (markdown-it + KaTeX inline & block after render)
	* HTML (sanitized + KaTeX auto-render)
	* PDF (mobile opens in a new tab for reliability; desktop inline with a floating "Open PDF" button)
	* Standalone Images (centered both axes)
	* Standalone Video (HTML5 player)
	* Standalone Audio (HTML5 player)
* Optional tree filter: toggle to show/hide media files (keeps tree focused on docs by default).
* Editing:
	* Markdown: Toast UI Editor (math rendered after save)
	* HTML: SunEditor (math rendered after save)
* Media pipeline: resolves relative media to Blob URLs (restores original paths on save).
* Fallback save path automatically uses `fileSave` (download-like) when direct write is not permitted.
* Floating UI buttons (Edit, Hide/Show Sidebar, PDF Open) for cleaner workspace.
* Draggable (mouse + touch) splitter and collapsible sidebar with animated show/hide.
* Offline-friendly after first CDN fetch (can vendor libraries locally).

## 🗂 Supported File Types
| Type | Preview | Editable | Notes |
|------|---------|----------|-------|
| `.md`, `.markdown` | Yes | Yes | Math after save |
| `.html`, `.htm` | Yes | Yes | Sanitized; math after save |
| `.pdf` | Yes | No | Mobile opens new tab; desktop inline + FAB |
| Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`) | Yes (standalone + embedded) | No | Centered; original paths preserved |
| Video (`.mp4`, `.webm`, `.ogg`) | Yes (standalone + embedded) | No | HTML5 player |
| Audio (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`) | Yes (standalone + embedded) | No | HTML5 player |
| Other text (`.txt`, `.csv`, etc.) | Basic (plain) | No | Treated as text (future enhancement) |

## 🔐 Privacy & Security Model
* Everything runs locally in your browser process—no network upload of file contents.
* The File System Access permission is scoped only to the directory you choose.
* HTML is sanitized (scripts, inline event handlers, style tags stripped) before display.
* Generated Blob URLs for images are revoked when no longer needed.

## ✅ Requirements
* **Best Experience:** Chromium 96+ (Chrome, Edge, Brave) for direct in-place read/write.
* **Fallback Browsers:** Firefox, Safari, etc. via `browser-fs-access` (loads a chosen directory's files into a virtual set; saves trigger a download dialog per file).
* **Launch:** Double‑click `index.html` (file://) or serve locally (optional).
* **Permissions:** Accept read/write prompts (Chromium) or file picker (fallback).
* **First Load Assets:** External CDN scripts (editors, KaTeX) need initial network; afterwards cached locally (subject to browser policies).

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
* Press the floating Edit button → Editor (Markdown or HTML) appears.
* Make changes → Save:
	* Chromium: writes in place via file handle.
	* Fallback: prompts a save dialog (defaulting to original name) using `fileSave`.
* Viewer refreshes immediately from updated content.

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
* Standalone files and embedded tags both supported now.
* Tree shows media only when the "Show media" toggle is enabled (default hidden to reduce noise).
* Sources remain original relative paths in saved files (Blob URLs only in-memory while viewing/editing).
* Missing media logs a console warning (future visual indicator planned).
* Video & audio with nested `<source>` tags processed uniformly.
* Centering: images are flex-centered horizontally & vertically.

## 🧱 Project Structure (excerpt)
```
index.html      # Entry point
app.js          # Folder picking, tree, rendering (markdown/html/pdf), media resolution
editor.js       # Editing lifecycle + media handling (math deferred to viewer)
styles.css      # Core styling
```

## 🔄 Future Ideas / Roadmap (Not Yet Implemented)
* Missing media indicator & retry UI
* Rename / delete / create files & folders
* Theme toggle (dark / light)
* KaTeX live preview toggle in editors
* Service worker to pin CDN assets offline
* Persist user prefs (sidebar state, media toggle)
* Basic text file editing for other extensions

## 🧪 Testing Tips
* Nested relative paths (`../images/foo.png`) in Markdown & HTML.
* Mixed media: image + video + audio tags in one HTML file.
* Math blocks at top / bottom / inside lists.
* Large folder to watch lazy expansion performance.
* Save edited HTML with images: verify original relative paths persisted (no `blob:` in source).

## ⚠️ Limitations
* Fallback mode (non‑Chromium): no true in-place overwrite; each save is a new download dialog.
* No bulk operations (rename/create/delete) yet.
* Very large directories: still no virtual scrolling (can be slow to expand huge nodes).
* PDF is view-only; no annotation features.
* No external change detection (last save wins if file altered outside app).
* Initial load requires network for CDN assets unless vendored locally.

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
| Folder tree & VFS (native) | `app.js`: `buildVFSFromDirectoryHandle`, `populateDir` |
| Folder load fallback | `app.js`: `chooseFolder`, `loadDirectoryFromFileHandles`, `buildVFSFromFileList` |
| File open routing | `app.js`: `openFile` |
| Markdown render | `app.js`: `renderMarkdown` |
| HTML render & sanitize | `app.js`: `renderHTML` |
| PDF viewer logic (mobile vs desktop) | `app.js`: `renderPDF` |
| Standalone media render | `app.js`: `renderImage`, `renderVideo`, `renderAudio` |
| Media resolution (embedded) | `app.js`: `processMediaInDOM` |
| Math rendering (viewer) | `app.js`: inside `renderMarkdown` & `renderHTML` KaTeX pass |
| Editors (Markdown / HTML) | `editor.js`: `_initToast`, `_initSun`, `startEditing` |
| Media in editors | `editor.js`: `_refreshMedia`, `_prepareHTMLContentForEditor`, `_normalizeHTMLMedia` |
| Save lifecycle + fallback | `editor.js`: `_save`, `finishEditing` |
| Sidebar collapse + FABs | `app.js`: `collapseSidebar`, `createFloatingSidebarRestore`, `ensureHideFab` |
| Splitter drag (mouse + touch) | `app.js`: splitter event listeners |
| Permissions / fallback detection | `app.js`: `chooseFolder` & setup section |

## 🤝 Contributing
Issues & PRs welcome—please keep changes lean (no heavy build pipeline). Open a PR with a concise description & rationale.

---
Enjoy fast local browsing & editing! If this helps you, consider starring the repo.

