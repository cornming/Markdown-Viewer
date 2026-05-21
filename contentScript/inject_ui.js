(function () {
  'use strict';

  // 只在 file:// 頁面運作
  if (location.protocol !== 'file:') return;

  const pathname = decodeURIComponent(location.pathname || '');
  const lower = pathname.toLowerCase();
  const isMarkdown = lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt');
  if (!isMarkdown) return;

  // 保存原始的 file:// 完整路徑（在頁面被修改前）
  const originalFileUrl = location.href;

  // 取得原始文字內容（Chrome 會把本機檔案顯示在 <pre> 內）
  const pre = document.querySelector('pre');
  const rawText = (pre ? pre.textContent : document.body.textContent) || '';

  // 用檔名顯示（Windows file:///C:/... 會在 pathname 內）
  const inferredFilename = (pathname.split('/').pop() || 'document.md')
    .replace(/\+/g, ' ')
    .trim() || 'document.md';

  // 提供給 viewer.js 優先載入，包含原始檔案路徑
  window.__MDV_INITIAL__ = {
    content: rawText,
    filename: inferredFilename,
    fileUrl: originalFileUrl  // 保存原始的 file:// URL
  };

  // 清空頁面並注入我們的 UI
  document.documentElement.setAttribute('data-mdv', '1');
  document.head.innerHTML = '<meta charset="UTF-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';
  document.body.innerHTML = `
    <header class="toolbar">
      <div class="toolbar-left">
        <span class="logo">✨ Markdown Viewer</span>
        <span class="filename" id="filename">${escapeHtml(inferredFilename)}</span>
      </div>
      <div class="toolbar-right">
        <button id="openFileBtn" class="btn" title="開啟檔案 (Ctrl+O)">
          <span class="icon">📂</span>
          <span class="btn-text">開啟</span>
        </button>
        <button id="saveCurrentBtn" class="btn" title="儲存 (Ctrl+S)">
          <span class="icon">💾</span>
          <span class="btn-text">儲存</span>
        </button>
        <button id="saveFileBtn" class="btn" title="另存新檔 (Ctrl+Shift+S)">
          <span class="icon">💾</span>
          <span class="btn-text">另存</span>
        </button>
        <button id="loadImagesBtn" class="btn btn-disabled" disabled title="載入圖片 (需要授權資料夾)">
          <span class="icon">🖼️</span>
          <span class="btn-text">圖片</span>
        </button>
        <div class="toolbar-divider"></div>
        <div class="view-toggle">
          <button id="viewEdit" class="btn view-btn" title="僅編輯"><span class="icon">✏️</span></button>
          <button id="viewSplit" class="btn view-btn active" title="分割視圖"><span class="icon">📖</span></button>
          <button id="viewPreview" class="btn view-btn" title="僅預覽"><span class="icon">👁️</span></button>
        </div>
        <div class="toolbar-divider"></div>
        <button id="fullscreenBtn" class="btn" title="全螢幕 (F)"><span class="icon" id="fullscreenIcon">⛶</span></button>
        <button id="themeBtn" class="btn" title="切換主題"><span class="icon" id="themeIcon">🌙</span></button>
        <button id="clearDraftBtn" class="btn" title="清除草稿"><span class="icon">🗑️</span></button>
      </div>
    </header>

    <main class="container" id="container">
      <div class="dropzone-overlay" id="dropzoneOverlay">
        <div class="dropzone-content">
          <span class="dropzone-icon">📄</span>
          <p>拖放 .md 檔案到這裡</p>
        </div>
      </div>

      <section class="editor-panel" id="editorPanel">
        <div class="panel-header"><span>編輯器</span></div>
        <textarea id="editor" class="editor" spellcheck="false" placeholder="在此輸入 Markdown 內容..."></textarea>
      </section>

      <div class="resizer" id="resizer"></div>

      <section class="preview-panel" id="previewPanel">
        <div class="panel-header"><span>預覽</span></div>
        <div id="preview" class="preview markdown-body"></div>
      </section>

      <div class="resizer-right" id="resizerRight"></div>
    </main>

    <div class="modal-overlay" id="saveModal">
      <div class="modal">
        <div class="modal-header">
          <h3>💾 另存新檔</h3>
          <button class="modal-close" id="closeSaveModal">&times;</button>
        </div>
        <div class="modal-body">
          <label for="saveFilename">檔案名稱</label>
          <input type="text" id="saveFilename" placeholder="my-document.md" value="${escapeHtml(inferredFilename)}">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelSave">取消</button>
          <button class="btn btn-primary" id="confirmSave">儲存</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="filePickerModal">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h3>📂 選擇檔案</h3>
          <button class="modal-close" id="closeFilePickerModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="file-list" id="fileList">
            <p class="file-list-hint">載入中...</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelFilePicker">取消</button>
        </div>
      </div>
    </div>

    <input type="file" id="fileInput" accept=".md,.markdown,.txt" hidden>
  `;

  // viewer.js 會接手初始化（render、事件、storage、主題等）

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
