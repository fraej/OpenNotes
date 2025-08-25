// OpenNotes - local documents viewer (file:// friendly)
// Notes:
// - Works when opening index.html directly in Edge/Chrome.
// - Uses an <input type="file" webkitdirectory> to read folder contents (no server needed).
// - All work is client-only; nothing is uploaded.

const ui = {
  openBtn: document.getElementById('openFolderBtn'),
  rootPath: document.getElementById('rootPath'),
  status: document.getElementById('status'),
  tree: document.getElementById('tree'),
  viewer: document.getElementById('viewer'),
  sidebar: document.getElementById('sidebar'),
  splitter: document.getElementById('splitter'),
  collapseAllBtn: document.getElementById('collapseAllBtn'),
  expandAllBtn: document.getElementById('expandAllBtn')
};

// In-memory virtual FS built from DataTransferItemList or input files
let vfsRoot = null; // { name, kind: 'directory', children: Map<string, node> }
let currentSelection = null; // {path, node}
let editorModule = null; // Editor module instance

const SUPPORTED = {
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  pdf: 'pdf'
};
// Audio & video files are intentionally NOT added to SUPPORTED so they are not opened standalone.
const EMBED_ONLY_AUDIO_EXTS = new Set(['mp3','wav','ogg','m4a','flac']);

function setStatus(msg) { ui.status.textContent = msg; }

function icon(kind, ext) {
  if (kind === 'directory') return '📁';
  switch (ext) {
    case 'md': case 'markdown': return '📝';
    case 'html': case 'htm': return '🌐';
    case 'pdf': return '📄';
  case 'mp3': case 'wav': case 'ogg': case 'm4a': case 'flac': return '🎵';
    default: return '📄';
  }
}

function extname(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isSupportedFile(name) {
  return SUPPORTED[extname(name)] !== undefined;
}

// --- Markdown block math helpers ---
function shieldBlockMath(mdText) {
  const blocks = [];
  let out = '';
  let i = 0;
  while (i < mdText.length) {
    const start = mdText.indexOf('$$', i);
    if (start === -1) {
      out += mdText.slice(i);
      break;
    }
    // Append text before $$
    out += mdText.slice(i, start);
    // Find closing $$
    const end = mdText.indexOf('$$', start + 2);
    if (end === -1) {
      // No closing delimiter; append rest and stop
      out += mdText.slice(start);
      break;
    }
    const content = mdText.slice(start + 2, end);
    const token = `[[[MATHBLOCK_${blocks.length}]]]`;
    blocks.push(content);
    out += token;
    i = end + 2;
  }
  return { text: out, blocks };
}

function unshieldBlockMath(html, blocks) {
  // Replace placeholder tokens back with $$...$$ content so auto-render / markdown-it-katex can process them
  let out = html;
  for (let idx = 0; idx < blocks.length; idx++) {
    const token = `[[[MATHBLOCK_${idx}]]]`;
    out = out.split(token).join(`$$${blocks[idx]}$$`);
  }
  return out;
}


// Build tree nodes lazily
function makeTreeItem(name, path, node) {
  const li = document.createElement('li');
  const item = document.createElement('div');
  item.className = 'item';
  item.dataset.path = path;

  const twisty = document.createElement('span');
  twisty.className = 'twisty';
  twisty.textContent = node.kind === 'directory' ? '▸' : '';

  const iconEl = document.createElement('span');
  iconEl.textContent = icon(node.kind, extname(name));

  const nameEl = document.createElement('span');
  nameEl.className = 'name';
  nameEl.textContent = name;

  item.appendChild(twisty);
  item.appendChild(iconEl);
  item.appendChild(nameEl);
  li.appendChild(item);

  if (node.kind === 'directory') {
    const ul = document.createElement('ul');
    ul.hidden = false; // Expand folders by default
    li.appendChild(ul);

    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isHidden = ul.hidden;
      if (isHidden) {
        twisty.textContent = '▾';
        if (!ul.dataset.loaded) {
          await populateDir(ul, node, path);
          ul.dataset.loaded = '1';
        }
        ul.hidden = false;
      } else {
        twisty.textContent = '▸';
        ul.hidden = true;
      }
    });

    // Auto-populate on creation since we're expanding by default
    setTimeout(async () => {
      if (!ul.dataset.loaded) {
        await populateDir(ul, node, path);
        ul.dataset.loaded = '1';
      }
      twisty.textContent = '▾';
    }, 0);
  } else {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      selectItem(item, node);
      await openFile(node, path);
    });
  }

  return li;
}

function selectItem(el, node) {
  if (currentSelection) {
    const prev = ui.tree.querySelector(`.item[data-path="${CSS.escape(currentSelection.path)}"]`);
    if (prev) prev.classList.remove('active');
  }
  el.classList.add('active');
  currentSelection = { path: el.dataset.path, node: node };
  updateWindowExports(); // Update window exports when selection changes
}

async function populateDir(containerUl, dirNode, basePath) {
  containerUl.textContent = '';

  // Collect entries and sort: folders first, then files (supported first)
  const dirs = [];
  const files = [];
  for (const [name, child] of dirNode.children) {
    if (child.kind === 'directory') dirs.push([name, child]);
    else if (isSupportedFile(name)) files.push([name, child]);
  }
  dirs.sort((a,b) => a[0].localeCompare(b[0]));
  files.sort((a,b) => a[0].localeCompare(b[0]));

  for (const [name, node] of dirs) {
    const childPath = basePath ? `${basePath}/${name}` : name;
    containerUl.appendChild(makeTreeItem(name, childPath, node));
  }
  for (const [name, node] of files) {
    const childPath = basePath ? `${basePath}/${name}` : name;
    containerUl.appendChild(makeTreeItem(name, childPath, node));
  }

  if (!dirs.length && !files.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = '(empty)';
    const li = document.createElement('li');
    li.appendChild(empty);
    containerUl.appendChild(li);
  }
}

// Removed legacy buildVFSFromFileList fallback (File System Access API only)

async function chooseFolder() {
  // Primary: native File System Access API
  if ('showDirectoryPicker' in window) {
    try {
      setStatus('Opening directory picker...');
      const directoryHandle = await window.showDirectoryPicker();
      await loadDirectoryWithHandle(directoryHandle);
      return;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error opening directory:', error);
        setStatus('Error opening directory');
      } else {
        setStatus('Ready');
      }
      return; // Do not fallback automatically after explicit cancellation
    }
  }

  // Fallback: browser-fs-access (works in Firefox/Safari with directoryOpen)
  if (window.browserFsAccess && window.browserFsAccess.directoryOpen) {
    try {
      setStatus('Opening directory (fallback)...');
  const fileHandles = await window.browserFsAccess.directoryOpen({
        recursive: true,
        mode: 'read'
      });
      await loadDirectoryFromFileHandles(fileHandles);
      return;
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Fallback directory open failed', err);
        setStatus('Error opening directory');
      } else {
        setStatus('Ready');
      }
      return;
    }
  }

  alert('No supported folder selection API available in this browser.');
}

// Load directory using File System Access API with write permissions
async function loadDirectoryWithHandle(directoryHandle) {
  setStatus('Loading folder...');
  
  // Store the directory handle globally for saving files
  window.directoryHandle = directoryHandle;
  
  vfsRoot = await buildVFSFromDirectoryHandle(directoryHandle);
  updateWindowExports();
  
  ui.tree.textContent = '';
  const rootUl = document.createElement('ul');
  ui.tree.appendChild(rootUl);
  
  // Set the root path display
  ui.rootPath.textContent = `Selected folder: ${directoryHandle.name}`;
  
  // Populate the tree
  const dirs = [];
  const filesList = [];
  for (const [name, child] of vfsRoot.children) {
    if (child.kind === 'directory') dirs.push([name, child]);
    else if (isSupportedFile(name)) filesList.push([name, child]);
  }
  dirs.sort((a,b) => a[0].localeCompare(b[0]));
  filesList.sort((a,b) => a[0].localeCompare(b[0]));

  for (const [name, node] of dirs) {
    rootUl.appendChild(makeTreeItem(name, name, node));
  }
  for (const [name, node] of filesList) {
    rootUl.appendChild(makeTreeItem(name, name, node));
  }
  
  setStatus('Folder loaded');
}

// Fallback: build VFS from array of File objects returned by browser-fs-access directoryOpen
async function loadDirectoryFromFileHandles(fileHandles) {
  setStatus('Loading folder (fallback)...');
  // Derive a pseudo-root name from first file path segment
  const first = fileHandles[0];
  let rootName = 'folder';
  if (first && first.webkitRelativePath) {
    rootName = first.webkitRelativePath.split('/')[0] || rootName;
  }
  vfsRoot = await buildVFSFromFileList(fileHandles, rootName);
  window.directoryHandle = null; // no writable root
  updateWindowExports();

  ui.tree.textContent = '';
  const rootUl = document.createElement('ul');
  ui.tree.appendChild(rootUl);
  ui.rootPath.textContent = `Selected (fallback): ${rootName}`;

  const dirs = [];
  const filesList = [];
  for (const [name, child] of vfsRoot.children) {
    if (child.kind === 'directory') dirs.push([name, child]);
    else if (isSupportedFile(name)) filesList.push([name, child]);
  }
  dirs.sort((a,b) => a[0].localeCompare(b[0]));
  filesList.sort((a,b) => a[0].localeCompare(b[0]));
  for (const [name, node] of dirs) rootUl.appendChild(makeTreeItem(name, name, node));
  for (const [name, node] of filesList) rootUl.appendChild(makeTreeItem(name, name, node));
  setStatus('Folder loaded (fallback)');
}

async function buildVFSFromFileList(fileList, rootName = 'root') {
  const root = { name: rootName, kind: 'directory', children: new Map(), path: '' };
  for (const file of fileList) {
    const rel = file.webkitRelativePath || file.name; // directoryOpen supplies webkitRelativePath in all browsers
    const parts = rel.split('/').filter(Boolean);
    let dir = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        dir.children.set(part, { name: part, kind: 'file', file, handle: null, path: parts.slice(0, i+1).join('/') });
      } else {
        if (!dir.children.has(part)) {
          dir.children.set(part, { name: part, kind: 'directory', children: new Map(), path: parts.slice(0, i+1).join('/') });
        }
        dir = dir.children.get(part);
      }
    }
  }
  return root;
}

// Build VFS from directory handle with file handles for writing
async function buildVFSFromDirectoryHandle(directoryHandle, path = '') {
  const children = new Map();
  
  for await (const [name, handle] of directoryHandle.entries()) {
    const fullPath = path ? `${path}/${name}` : name;
    
    if (handle.kind === 'directory') {
      const subDir = await buildVFSFromDirectoryHandle(handle, fullPath);
      children.set(name, {
        name,
        kind: 'directory',
        children: subDir.children,
        handle: handle,
        path: fullPath
      });
    } else if (handle.kind === 'file') {
      const file = await handle.getFile();
      children.set(name, {
        name,
        kind: 'file',
        file: file,
        handle: handle, // Store the file handle for writing
        path: fullPath
      });
    }
  }
  
  return {
    name: directoryHandle.name,
    kind: 'directory',
    children: children,
    handle: directoryHandle,
    path: path
  };
}

async function openFile(node, path) {
  try {
    // Close any existing editor session before opening a new file
    if (editorModule && editorModule.isEditing) {
      console.log('Closing existing editor session...');
      editorModule.cleanupEditor();
    }
    
    setStatus(`Opening ${path}`);
  // Always refresh file from handle if available to avoid stale content
  let file = node.file;
  if (node.handle && node.handle.getFile) {
    try {
      file = await node.handle.getFile();
      // Replace cached file object so future reads use latest
      node.file = file;
    } catch (e) {
      console.warn('Failed to refresh file from handle, using cached version', e);
    }
  }
  const ext = extname(node.name || file.name);
    const type = SUPPORTED[ext];

    if (type === 'markdown') {
      const text = await file.text();
      renderMarkdown(text);
    } else if (type === 'html') {
      const text = await file.text();
      renderHTML(text);
    } else if (type === 'pdf') {
      const blobUrl = URL.createObjectURL(file);
      renderPDF(blobUrl);
    } else if (EMBED_ONLY_AUDIO_EXTS.has(ext)) {
      // Explicit message guiding user to embed audio inside documents instead of standalone view
      renderMessage('Audio files are not opened standalone. Embed them in a Markdown or HTML document.');
    } else {
      renderMessage('Unsupported file selected');
    }

    setStatus('Ready');
  } catch (err) {
    console.error(err);
    renderMessage('Failed to open file. Check console.');
    setStatus('Error');
  }
}

function clearViewer() {
  ui.viewer.textContent = '';
  // Remove any existing edit button
  const existingEditBtn = document.querySelector('.edit-button');
  if (existingEditBtn) {
    existingEditBtn.remove();
  }
  // Remove any existing save/cancel container
  const existingSaveCancel = document.querySelector('.save-cancel-container');
  if (existingSaveCancel) {
    existingSaveCancel.remove();
  }
}

function createEditButton(fileType, content) {
  // Only show edit button for supported editable types
  if (fileType !== 'markdown' && fileType !== 'html') {
    return null;
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'edit-button';
  editBtn.textContent = 'Edit';
  // Store the file type as a data attribute for later access
  editBtn.dataset.fileType = fileType;
  editBtn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    padding: 10px 20px;
    background: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;

  editBtn.addEventListener('click', async () => {
    if (!editorModule) {
      console.error('Editor module not initialized');
      alert('Editor module not initialized');
      return;
    }
    
    if (!currentSelection) {
      console.error('No file selected');
      alert('No file selected');
      return;
    }

    // Get the file type from the button's data attribute
    const buttonFileType = editBtn.dataset.fileType;

    console.log('Starting editor for:', {
      path: currentSelection.path,
      fileType: buttonFileType,
      contentLength: content.length,
      node: currentSelection.node
    });

    try {
      // Hide the edit button while editing
      editBtn.style.display = 'none';
      
      await editorModule.startEditing(
        currentSelection.node, 
        currentSelection.path, 
        content, 
        buttonFileType
      );
    } catch (error) {
      console.error('Failed to start editing:', error);
      alert('Failed to start editing: ' + error.message);
      // Show the edit button again on error
      editBtn.style.display = 'block';
    }
  });

  // Add to document body so it floats over everything
  document.body.appendChild(editBtn);
  return editBtn;
}

function renderMessage(msg) {
  clearViewer();
  // Restore normal viewer scrolling for message content
  ui.viewer.style.overflowY = 'auto';
  ui.viewer.style.overflowX = 'hidden';
  
  const div = document.createElement('div');
  div.className = 'placeholder';
  div.textContent = msg;
  ui.viewer.appendChild(div);
}

// Function to process images in a rendered DOM element
function processImagesInDOM(container, currentPath) {
  // Backward-compatible alias that now processes images AND videos
  processMediaInDOM(container, currentPath);
}

function processMediaInDOM(container, currentPath) {
  if (!vfsRoot) return;

  console.log('Processing media (images/videos) in DOM for path:', currentPath);

  const handleElement = (el, attr = 'src') => {
    let src = el.getAttribute(attr);
    // If src missing (we may have deferred it), fallback to data-src
    if ((!src || src === '') && el.hasAttribute('data-src')) {
      src = el.getAttribute('data-src');
    }
    if (!src) return;
    // Skip if already an absolute/external/data/blob URL
    if (/^(https?:|data:|blob:)/i.test(src)) {
      // Ensure we still tag original filename for later recovery if needed
      if(!el.getAttribute('data-file-name')){
        try { const namePart = (new URL(src)).pathname.split('/').pop(); if(namePart) el.setAttribute('data-file-name', namePart); } catch {}
      }
      return;
    }
    let resolvedPath = src;
    if (src.startsWith('../')) {
      const currentDir = currentPath.split('/').slice(0, -1);
      const parts = src.split('/');
      for (const part of parts) {
        if (part === '..') currentDir.pop();
        else if (part !== '.' && part !== '') currentDir.push(part);
      }
      resolvedPath = currentDir.join('/');
    } else if (!src.startsWith('/')) {
      const currentDir = currentPath.split('/').slice(0, -1);
      resolvedPath = [...currentDir, src].join('/');
    } else if (src.startsWith('/')) {
      // Strip leading slash to treat as root-relative within selected folder
      resolvedPath = src.slice(1);
    }

    const mediaFile = findFileInVFS(resolvedPath);
    if (mediaFile && mediaFile.kind === 'file') {
      try {
        // Preserve the original attribute value (as written in content) only once
        if (!el.getAttribute('data-original-src')) {
          el.setAttribute('data-original-src', src);
          el.setAttribute('data-resolved-path', resolvedPath);
          if(!el.getAttribute('data-file-name')){
            const baseName = resolvedPath.split('/').pop();
            if(baseName) el.setAttribute('data-file-name', baseName);
          }
        }
        const blobUrl = URL.createObjectURL(mediaFile.file);
        el.setAttribute(attr, blobUrl);
        // If inside a <video>, force reload metadata
        if (el.tagName.toLowerCase() === 'source' && el.parentElement && el.parentElement.tagName.toLowerCase() === 'video') {
          try { el.parentElement.load(); } catch {}
        }
      } catch (e) {
        console.warn('Failed to create blob URL for media:', resolvedPath, e);
      }
    } else {
      console.warn('Media file not found in VFS:', resolvedPath);
    }
  };

  // Images
  container.querySelectorAll('img').forEach(img => handleElement(img, 'src'));
  // Videos with direct src
  container.querySelectorAll('video').forEach(video => handleElement(video, 'src'));
  // Video sources
  container.querySelectorAll('video source').forEach(source => handleElement(source, 'src'));
  // Audio with direct src
  container.querySelectorAll('audio').forEach(audio => handleElement(audio, 'src'));
  // Audio sources
  container.querySelectorAll('audio source').forEach(source => handleElement(source, 'src'));
}

// Function to process images and replace relative paths with blob URLs (legacy - kept for compatibility)
async function processImagesInContent(content, currentPath) {
  // This function is now simplified and just returns the content as-is
  // Image processing will happen after DOM rendering
  return content;
}

// Helper function to resolve image path and create blob URL
async function resolveImagePath(imagePath, currentPath) {
  // This function is kept for compatibility but not used in the new approach
  return null;
}

// Helper function to find a file in VFS by path
function findFileInVFS(path) {
  if (!vfsRoot) return null;
  
  console.log('Searching for file in VFS:', path);
  console.log('VFS root children:', Array.from(vfsRoot.children.keys()));
  
  const parts = path.split('/').filter(p => p && p !== '.');
  let current = vfsRoot;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    console.log(`Looking for part "${part}" in:`, Array.from(current.children?.keys() || []));
    
    if (current.kind !== 'directory' || !current.children.has(part)) {
      console.log(`Part "${part}" not found at level ${i}`);
      return null;
    }
    current = current.children.get(part);
    console.log(`Found part "${part}", current node:`, { name: current.name, kind: current.kind });
  }
  
  console.log('Final resolved node:', { name: current.name, kind: current.kind, hasFile: !!current.file });
  return current;
}

function renderMarkdown(mdText) {
  clearViewer();
  // Restore normal viewer scrolling for markdown content
  ui.viewer.style.overflowY = 'auto';
  ui.viewer.style.overflowX = 'hidden';
  
  const container = document.createElement('div');
  container.className = 'content markdown';

  // --- Custom block math shielding (to preserve matrix row separators) ---
  const { text: shielded, blocks } = shieldBlockMath(mdText);

  // Configure markdown-it for inline math only (leave $$ blocks shielded)
  let md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
  });
  // Use katex plugin if available – it will render inline $...$ but not our block placeholders
  if (window.markdownitKatex) {
    md = md.use(window.markdownitKatex, { throwOnError: false, strict: false });
  }

  let rawHtml = md.render(shielded);

  // Replace block placeholders with KaTeX-rendered HTML manually (display mode)
  if (blocks.length && typeof katex !== 'undefined' && katex.renderToString) {
    blocks.forEach((body, idx) => {
      let latex = body.trim();
      // Normalize Windows line endings
      latex = latex.replace(/\r\n/g, '\n');
      let html;
      try {
        html = katex.renderToString(latex, { displayMode: true, throwOnError: false, strict: false });
      } catch (e) {
        const esc = latex.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
        html = `<pre class="katex-error">${esc}</pre>`;
      }
      rawHtml = rawHtml.split(`[[[MATHBLOCK_${idx}]]]`).join(html);
    });
  } else if (blocks.length) {
    // Fallback: unshield into $$...$$ so later auto-render (if any) could pick them up
    blocks.forEach((body, idx) => {
      rawHtml = rawHtml.split(`[[[MATHBLOCK_${idx}]]]`).join(`$$${body}$$`);
    });
  }

  // IMPORTANT: Skip sanitization for now to preserve full KaTeX bracket structure.
  // All content is from local files; risk is minimal. If sanitization is reintroduced,
  // it must not break nested <span> structure (use a DOM parser, not regex narrowing).
  container.innerHTML = rawHtml;
  // Debug: log presence of bmatrix blocks and whether brackets appear
  try {
    container.querySelectorAll('.katex-display').forEach(el => {
      if (el.textContent && /1\s+2\s+3/.test(el.textContent)) {
        console.debug('[MATRIX DEBUG] Raw text:', el.textContent);
      }
    });
  } catch(e) {}
  ui.viewer.appendChild(container);

  // Process images after DOM is ready
  const currentPath = currentSelection ? currentSelection.path : '';
  processImagesInDOM(container, currentPath);
  // Fallback inline math auto-render (in case markdown-it-katex missed some $...$ segments)
  try {
    if (typeof renderMathInElement === 'function') {
      renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
        strict: false
      });
    }
  } catch (e) {
    console.warn('Inline math fallback render failed', e);
  }

  // Add edit button for markdown files
  createEditButton('markdown', mdText);
}

function renderHTML(htmlText) {
  clearViewer();
  // Restore normal viewer scrolling for HTML content
  ui.viewer.style.overflowY = 'auto';
  ui.viewer.style.overflowX = 'hidden';
  
  const container = document.createElement('div');
  container.className = 'content html';

  // Sanitize local HTML for safety
  const safe = DOMPurify.sanitize(htmlText, {
    ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msqrt', 'mfrac', 'mtable', 'mtr', 'mtd'],
    ADD_ATTR: ['class', 'style']
  });
  // Parse into a detached DOM to defer relative media loads
  const temp = document.createElement('div');
  temp.innerHTML = safe;
  // Convert relative media src -> data-src (leave absolute/data/blob alone) so browser doesn't attempt file:// load before we map them
  temp.querySelectorAll('img,video,source').forEach(el => {
    const src = el.getAttribute('src');
    if(!src) return;
    if(/^(https?:|data:|blob:)/i.test(src)) return; // leave external or already mapped
    // Store original then remove src so no immediate fetch
    if(!el.hasAttribute('data-original-src')) el.setAttribute('data-original-src', src);
    el.setAttribute('data-src', src);
    el.removeAttribute('src');
  });
  // Move children into container (still not appended to document)
  while(temp.firstChild) container.appendChild(temp.firstChild);
  ui.viewer.appendChild(container);

  // Process images after DOM is ready
  const currentPath = currentSelection ? currentSelection.path : '';
  processImagesInDOM(container, currentPath);

  // Auto-render math if delimited like $...$ or $$...$$ (after attach)
  try {
    if (typeof renderMathInElement !== 'function') return;
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
      strict: false
    });
  } catch (e) {
    console.warn('KaTeX auto-render (html) failed', e);
  }

  // Add edit button for HTML files
  createEditButton('html', htmlText);
}

function renderPDF(blobUrl) {
  clearViewer();
  // Hide scrollbars but keep overflow detection for splitter
  ui.viewer.style.overflowY = 'hidden';
  ui.viewer.style.overflowX = 'hidden';
  
  const iframe = document.createElement('iframe');
  iframe.className = 'pdf-frame';
  // Add #toolbar=0 to hide PDF viewer toolbar and controls
  iframe.src = blobUrl + '#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&scrollbar=0&view=FitH';
  // Note: no sandbox applied so the built-in PDF viewer can function correctly.
  ui.viewer.appendChild(iframe);
}



ui.openBtn.addEventListener('click', chooseFolder);

// Splitter drag functionality
let isDragging = false;
let startX = 0;
let startWidth = 0;

ui.splitter.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX;
  startWidth = ui.sidebar.offsetWidth;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const deltaX = e.clientX - startX;
  const newWidth = Math.max(150, Math.min(800, startWidth + deltaX));
  document.querySelector('.layout').style.gridTemplateColumns = `${newWidth}px 4px 1fr`;
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Re-enable pointer events on iframe if PDF is displayed
    const iframe = ui.viewer.querySelector('.pdf-frame');
    if (iframe) {
      iframe.style.pointerEvents = 'auto';
    }
  }
});

// Prevent iframe from capturing mouse events during drag
document.addEventListener('mousedown', (e) => {
  if (e.target === ui.splitter) {
    const iframe = ui.viewer.querySelector('.pdf-frame');
    if (iframe) {
      iframe.style.pointerEvents = 'none';
    }
  }
});

// Collapse/Expand all folders functionality
function collapseAllFolders() {
  // Find all directory items (not the root ul)
  const directoryItems = ui.tree.querySelectorAll('.item');
  directoryItems.forEach(item => {
    const twisty = item.querySelector('.twisty');
    const ul = item.parentElement.querySelector('ul');
    
    // Only collapse if this is a directory (has a twisty with content)
    if (twisty && twisty.textContent === '▾' && ul) {
      ul.hidden = true;
      twisty.textContent = '▸';
    }
  });
}

function expandAllFolders() {
  // Find all directory items
  const directoryItems = ui.tree.querySelectorAll('.item');
  
  directoryItems.forEach(async (item) => {
    const twisty = item.querySelector('.twisty');
    const ul = item.parentElement.querySelector('ul');
    
    // Only process if this is a directory (has a twisty with content)
    if (twisty && twisty.textContent && ul) {
      // Load content if not already loaded
      if (!ul.dataset.loaded) {
        const path = item.dataset.path;
        
        // Find the node in VFS for this path
        let node = vfsRoot;
        if (path) {
          const parts = path.split('/');
          for (const part of parts) {
            if (node.children && node.children.has(part)) {
              node = node.children.get(part);
            }
          }
        }
        
        if (node && node.kind === 'directory') {
          await populateDir(ul, node, path);
          ul.dataset.loaded = '1';
        }
      }
      
      // Expand the folder
      ul.hidden = false;
      twisty.textContent = '▾';
    }
  });
}

ui.collapseAllBtn.addEventListener('click', collapseAllFolders);
ui.expandAllBtn.addEventListener('click', expandAllFolders);

// Initialize editor module when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // Feature detection
  const supportsNativeFSA = 'showDirectoryPicker' in window && window.isSecureContext;
  const hasFallback = !!(window.browserFsAccess && window.browserFsAccess.directoryOpen);
  if (!supportsNativeFSA && !hasFallback) {
    // Hard stop (no capability at all)
    if (!localStorage.getItem('openNotes_hideFsaWarning')) {
      const warn = document.createElement('div');
      warn.id = 'fsa-warning-banner';
      warn.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2000;background:#b00020;color:#fff;padding:12px 16px 12px 20px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.4;display:flex;align-items:flex-start;gap:14px;box-shadow:0 2px 6px rgba(0,0,0,.25);`;
      const msg = document.createElement('div');
      msg.innerHTML = `⚠️ <strong>Unsupported Browser:</strong> No folder selection API available. Please use a modern Chromium, Firefox (with directory upload), or Safari version.`;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button'; closeBtn.ariaLabel = 'Dismiss warning'; closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'margin-left:auto;background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;padding:4px 8px;';
      closeBtn.addEventListener('click', () => { warn.style.transition='opacity .25s'; warn.style.opacity='0'; setTimeout(()=>warn.remove(),250); localStorage.setItem('openNotes_hideFsaWarning','1'); });
      warn.appendChild(msg); warn.appendChild(closeBtn); document.body.appendChild(warn);
    }
    setStatus('Unsupported browser – cannot run');
  } else if (!supportsNativeFSA && hasFallback) {
    // Degraded mode banner
    if (!localStorage.getItem('openNotes_hideFallbackWarning')) {
      const warn = document.createElement('div');
      warn.id = 'fallback-warning-banner';
      warn.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2000;background:#d17b00;color:#fff;padding:12px 16px 12px 20px;font:14px system-ui,sans-serif;display:flex;gap:14px;align-items:flex-start;box-shadow:0 2px 6px rgba(0,0,0,.25)';
      const msg = document.createElement('div');
      msg.innerHTML = 'ℹ️ <strong>Limited Mode:</strong> Native File System Access API not available. Using fallback; editing saves will prompt downloads instead of in-place writes.';
      const closeBtn = document.createElement('button');
      closeBtn.type='button'; closeBtn.textContent='✕'; closeBtn.style.cssText='margin-left:auto;background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;padding:4px 8px;';
      closeBtn.addEventListener('click',()=>{warn.style.transition='opacity .25s';warn.style.opacity='0';setTimeout(()=>warn.remove(),250);localStorage.setItem('openNotes_hideFallbackWarning','1');});
      warn.appendChild(msg); warn.appendChild(closeBtn); document.body.appendChild(warn);
    }
  }
  try { editorModule = new EditorModule(); console.log('Editor module initialized'); } catch(e){ console.error('Failed to initialize editor module:', e); }
});

// Also initialize if DOMContentLoaded has already fired
if (document.readyState === 'loading') {
  // Already handled by event listener above
} else {
  try {
    editorModule = new EditorModule();
    console.log('Editor module initialized (immediate)');
  } catch (error) {
    console.error('Failed to initialize editor module (immediate):', error);
  }
}

// Export render functions for use by editor module
window.renderMarkdown = renderMarkdown;
window.renderHTML = renderHTML;
// Video renderer exported for potential future use

// Export VFS and utility functions for editor module
window.vfsRoot = vfsRoot;
window.currentSelection = currentSelection;
window.findFileInVFS = findFileInVFS;
window.processImagesInDOM = processImagesInDOM;
window.processMediaInDOM = processMediaInDOM;
window.directoryHandle = window.directoryHandle || null;

// Update exports when VFS changes
function updateWindowExports() {
  window.vfsRoot = vfsRoot;
  window.currentSelection = currentSelection;
  window.directoryHandle = window.directoryHandle || null;
}

// Export editor reset function for emergency use
window.resetEditor = function() {
  if (editorModule) {
    editorModule.forceReset();
    console.log('Editor forcefully reset');
  } else {
    console.log('No editor module to reset');
  }
};
