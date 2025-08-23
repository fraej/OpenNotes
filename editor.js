// Clean rebuilt EditorModule (math removed) — refactored for readability.
class EditorModule {
  constructor() {
    // Session state
    this.isEditing = false;
    this.currentEditor = null;
    this.currentNode = null;       // VFS node reference
    this.currentPath = '';         // Path of current file within virtual FS
    this.currentFileType = '';     // 'markdown' | 'html'
    this.originalViewerContent = '';
    // Lazy-load flags
    this.libs = { toast: false, sun: false };
    // Build static shell
    this._buildShell();
  }

  /* =============================
   * Shell / UI helpers
   * ===========================*/
  _buildShell() {
    this.container = document.createElement('div');
    this.container.id = 'editor-container';
    this.container.style.cssText = 'display:none;flex-direction:column;height:100%;width:100%;';

    this.toolbar = document.createElement('div');
    this.toolbar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#f5f5f5;border-bottom:1px solid #ddd;';

    this.title = document.createElement('span');
    this.title.style.fontWeight = 'bold';
    this.title.textContent = 'Editing';

    this.btnRow = document.createElement('div');
    this.btnRow.style.cssText = 'display:flex;gap:8px;';

    this.toolbar.appendChild(this.title);
    this.toolbar.appendChild(this.btnRow);

    this.wrapper = document.createElement('div');
    this.wrapper.style.cssText = 'flex:1;overflow:hidden;';

    this.container.appendChild(this.toolbar);
    this.container.appendChild(this.wrapper);
  }

  _button(style, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = style;
    b.onclick = onClick;
    return b;
  }

  _clearButtons() { this.btnRow.innerHTML = ''; }

  _showDone() {
    this._clearButtons();
    this.btnRow.appendChild(
      this._button(
        'background:#28a745;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;',
        'Done Editing',
        () => this._showSaveCancel()
      )
    );
  }

  _showSaveCancel() {
    this._clearButtons();
    this.btnRow.appendChild(
      this._button('background:#28a745;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;', 'Save', () => this.finishEditing())
    );
    this.btnRow.appendChild(
      this._button('background:#dc3545;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;', 'Cancel', () => this.cancelEditing())
    );
  }

  /* =============================
   * Dynamic loader utilities
   * ===========================*/
  async _css(url) {
    if (document.querySelector(`link[href="${url}"]`)) return;
    await new Promise((res, rej) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = url;
      l.onload = res; l.onerror = rej;
      document.head.appendChild(l);
    });
  }

  async _js(url) {
    if (document.querySelector(`script[src="${url}"]`)) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async _toastLib() {
    if (this.libs.toast) return;
    await this._css('https://uicdn.toast.com/editor/latest/toastui-editor.min.css');
    await this._js('https://uicdn.toast.com/editor/latest/toastui-editor-all.min.js');
    this.libs.toast = true;
  }

  async _sunLib() {
    if (this.libs.sun) return;
    await this._css('https://unpkg.com/suneditor@2.44.9/dist/css/suneditor.min.css');
    await this._js('https://unpkg.com/suneditor@2.44.9/dist/suneditor.min.js');
    this.libs.sun = true;
  }

  /* =============================
   * Entry point
   * ===========================*/
  async startEditing(node, path, content, type) {
    if (this.isEditing) this.cleanupEditor();

    this.isEditing = true;
    this.currentNode = node;
    this.currentPath = path;
    this.currentFileType = type;
    this.title.textContent = `Editing: ${path}`;

    const viewer = document.getElementById('viewer');
    if (!viewer) throw new Error('viewer not found');

    this.originalViewerContent = viewer.innerHTML;
    viewer.innerHTML = '';
    viewer.appendChild(this.container);
    this.container.style.display = 'flex';
    this.wrapper.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:320px;color:#555;">Loading editor...</div>';

    try {
      if (type === 'markdown') {
        await this._toastLib();
        await this._initToast(content);
      } else if (type === 'html') {
        await this._sunLib();
        const prepared = this._prepareHTMLContentForEditor(content || '');
        await this._initSun(prepared);
      } else {
        throw new Error('Unsupported type');
      }
      this._showDone();
    } catch (e) {
      console.error(e);
      alert('Editor load failed: ' + e.message);
      this.cancelEditing();
    }
  }

  /**
   * Convert relative media sources to blob URLs (with metadata) before loading HTML editor
   * to avoid browser 404s on file:// scheme.
   */
  _prepareHTMLContentForEditor(html) {
    if (!window.processImagesInDOM) return html;
    try {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      window.processImagesInDOM(temp, this.currentPath || '');
      return temp.innerHTML;
    } catch (e) {
      console.warn('prepare HTML for editor failed', e);
      return html;
    }
  }

  /* =============================
   * Editor initializers
   * ===========================*/
  async _initSun(content) {
    const S = window.SUNEDITOR;
    if (!S) throw new Error('SunEditor missing');

    this.wrapper.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.style.display = 'none';
    this.wrapper.appendChild(ta);

    this.currentEditor = S.create(ta, {
      height: '520px',
      value: content,
      buttonList: [
        ['undo', 'redo'],
        ['font', 'fontSize', 'formatBlock'],
        ['bold', 'underline', 'italic', 'strike'],
        ['align', 'list'],
        ['table', 'image', 'link'],
        ['fullScreen', 'codeView']
      ]
    });

    setTimeout(() => this._refreshMedia(), 400);
    try {
      this.currentEditor.onChange = () => this._scheduleMediaRefresh();
    } catch { /* no-op */ }
  }

  async _initToast(content) {
    const T = window.toastui?.Editor;
    if (!T) throw new Error('ToastUI missing');

    this.wrapper.innerHTML = '';
    this.currentEditor = new T({
      el: this.wrapper,
      height: '520px',
      initialEditType: 'markdown',
      previewStyle: 'vertical',
      initialValue: content,
      usageStatistics: false,
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'image', 'link'],
        ['code', 'codeblock'],
        ['scrollSync']
      ]
    });

    this._onToastChange = () => { this._scheduleMediaRefresh(); };
    if (this.currentEditor.on) this.currentEditor.on('change', this._onToastChange);
    this._scheduleMediaRefresh(400);
  }

  /* =============================
   * Media handling
   * ===========================*/
  _refreshMedia() {
    if (!window.processImagesInDOM || !this.currentPath) return;
    try {
      const panes = new Set();
      this.wrapper.querySelectorAll('.toastui-editor-md-preview').forEach(el => panes.add(el));
      this.wrapper.querySelectorAll('.toastui-editor-ww-container .toastui-editor-contents').forEach(el => panes.add(el));
      this.wrapper.querySelectorAll('.toastui-editor-contents').forEach(el => panes.add(el));
      this.wrapper.querySelectorAll('.sun-editor-editable').forEach(el => panes.add(el));
      if (panes.size === 0) return;
      panes.forEach(p => {
        try { window.processImagesInDOM(p, this.currentPath); } catch (e) { console.warn('media refresh pane failed', e); }
      });
    } catch (e) {
      console.warn('media refresh failed', e);
    }
  }

  _scheduleMediaRefresh(delay = 350) {
    if (this._mediaDebounceTimer) clearTimeout(this._mediaDebounceTimer);
    this._mediaDebounceTimer = setTimeout(() => this._refreshMedia(), delay);
  }

  /* =============================
   * Save / lifecycle
   * ===========================*/
  _normalizeHTMLMedia(html) {
    try {
      const div = document.createElement('div');
      div.innerHTML = html;
      div.querySelectorAll('img,video,source').forEach(el => {
        const current = el.getAttribute('src') || '';
        const origAttr = el.getAttribute('data-original-src');
        let targetPath = '';

        if (origAttr) {
          targetPath = origAttr;
          el.removeAttribute('data-original-src');
        } else if (/^blob:/i.test(current)) {
          targetPath = el.getAttribute('data-resolved-path') || el.getAttribute('data-file-name') || '';
        } else {
          const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(current.trim());
          targetPath = uuidLike ? (el.getAttribute('data-resolved-path') || el.getAttribute('data-file-name') || '') : current;
        }

        if (targetPath) {
          el.setAttribute('data-src', targetPath);
          el.removeAttribute('src');
        }
        el.removeAttribute('data-resolved-path');
      });
      return div.innerHTML;
    } catch (e) {
      console.warn('normalize media failed', e);
      return html;
    }
  }

  async finishEditing() {
    if (!this.isEditing || !this.currentEditor) return;
    try {
      let text = '';
      if (this.currentFileType === 'markdown') {
        text = this.currentEditor.getMarkdown();
      } else if (this.currentFileType === 'html') {
        text = this.currentEditor.getContents();
        text = this._normalizeHTMLMedia(text);
      }
      await this._save(text);
      await this.restoreViewer(text);
      this.cleanupEditor();
    } catch (e) {
      console.error(e);
      alert('Save failed: ' + e.message);
      this.restoreViewerFromBackup();
    }
  }

  async _save(content) {
    if (!this.currentNode || !this.currentNode.file) throw new Error('File handle missing');
    const name = this.currentNode.file.name;

    if (this.currentNode.handle) {
      const w = await this.currentNode.handle.createWritable();
      await w.write(content); await w.close();
    } else if ('showSaveFilePicker' in window) {
      const h = await window.showSaveFilePicker({ suggestedName: name });
      const w = await h.createWritable();
      await w.write(content); await w.close();
    } else {
      throw new Error('FSA API unsupported');
    }

    const blob = new Blob([content], { type: this.currentNode.file.type || 'text/plain' });
    this.currentNode.file = new File([blob], name, { type: blob.type });
    this._toast('Saved: ' + name);
  }

  _toast(msg) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:16px;right:16px;background:#28a745;color:#fff;padding:8px 14px;border-radius:4px;box-shadow:0 3px 8px rgba(0,0,0,.25);font-weight:600;z-index:9999;';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => {
      d.style.transition = 'opacity .3s';
      d.style.opacity = '0';
      setTimeout(() => d.remove(), 300);
    }, 1600);
  }

  async restoreViewer(newContent) {
    const v = document.getElementById('viewer');
    if (!v) return;
    v.innerHTML = '';
    if (newContent) {
      if (this.currentFileType === 'markdown' && window.renderMarkdown) window.renderMarkdown(newContent);
      else if (this.currentFileType === 'html' && window.renderHTML) window.renderHTML(newContent);
      else v.textContent = newContent;
    } else {
      v.innerHTML = this.originalViewerContent;
    }
    setTimeout(() => { const b = document.querySelector('.edit-button'); if (b) b.style.display = 'block'; }, 100);
  }

  cancelEditing() { this.cleanupEditor(); this.restoreViewerFromBackup(); }
  restoreViewerFromBackup() { this.restoreViewer(null); }

  cleanupEditor() {
    if (this._mediaDebounceTimer) { clearTimeout(this._mediaDebounceTimer); this._mediaDebounceTimer = null; }
    if (this.currentEditor && this._onToastChange && this.currentEditor.off) {
      try { this.currentEditor.off('change', this._onToastChange); } catch { /* ignore */ }
    }
    this._onToastChange = null;
    if (this.currentEditor && this.currentEditor.destroy) {
      try { this.currentEditor.destroy(); } catch { /* ignore */ }
    }
    this.currentEditor = null;
    this.isEditing = false;
    this.currentNode = null;
    this.currentPath = '';
    this.currentFileType = '';
    this._clearButtons();
  }

  forceReset() { this.cleanupEditor(); }
}

window.EditorModule = EditorModule;
