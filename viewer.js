/**
 * Markdown Viewer - Chrome Extension
 * 主要功能：拖放 .md 檔案、即時預覽、編輯/預覽模式切換、深淺主題、自動儲存
 */

(function() {
  'use strict';

  // ===================================
  // DOM 元素
  // ===================================
  const elements = {
    container: document.getElementById('container'),
    editor: document.getElementById('editor'),
    preview: document.getElementById('preview'),
    editorPanel: document.getElementById('editorPanel'),
    previewPanel: document.getElementById('previewPanel'),
    resizer: document.getElementById('resizer'),
    resizerRight: document.getElementById('resizerRight'),
    dropzoneOverlay: document.getElementById('dropzoneOverlay'),
    filename: document.getElementById('filename'),
    
    // 按鈕
    openFileBtn: document.getElementById('openFileBtn'),
    saveCurrentBtn: document.getElementById('saveCurrentBtn'),
    saveFileBtn: document.getElementById('saveFileBtn'),
    loadImagesBtn: document.getElementById('loadImagesBtn'),
    themeBtn: document.getElementById('themeBtn'),
    themeIcon: document.getElementById('themeIcon'),
    clearDraftBtn: document.getElementById('clearDraftBtn'),
    viewEdit: document.getElementById('viewEdit'),
    viewSplit: document.getElementById('viewSplit'),
    viewPreview: document.getElementById('viewPreview'),

    // 縮放
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomResetBtn: document.getElementById('zoomResetBtn'),
    zoomLabel: document.getElementById('zoomLabel'),

    // 全螢幕
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    fullscreenIcon: document.getElementById('fullscreenIcon'),
    
    // Modal
    saveModal: document.getElementById('saveModal'),
    saveFilename: document.getElementById('saveFilename'),
    closeSaveModal: document.getElementById('closeSaveModal'),
    cancelSave: document.getElementById('cancelSave'),
    confirmSave: document.getElementById('confirmSave'),
    
    // 檔案選擇 Modal
    filePickerModal: document.getElementById('filePickerModal'),
    fileList: document.getElementById('fileList'),
    closeFilePickerModal: document.getElementById('closeFilePickerModal'),
    cancelFilePicker: document.getElementById('cancelFilePicker'),
    
    // 檔案輸入
    fileInput: document.getElementById('fileInput')
  };

  // ===================================
  // 狀態管理
  // ===================================
  const state = {
    currentFilename: 'document.md',
    currentFileUrl: '',  // 原始的 file:// URL
    currentDirHandle: null,  // File System Access API 的目錄 handle
    currentFileHandle: null,  // File System Access API 的檔案 handle（用於直接儲存）
    imageCache: {},  // 快取已載入的圖片 blob URL
    hasUnloadedImages: false,  // 是否有未載入的本地圖片
    isDragging: false,
    isResizing: false,
    isResizingRight: false,
    currentView: 'split', // 'edit', 'split', 'preview'
    theme: 'light',
    editorWidth: 50, // 編輯器寬度百分比
    previewMaxWidth: 100, // 預覽區最大寬度百分比
    zoom: 100, // (%). 只縮放 Mermaid 圖
    viewBeforeFullscreen: null,
    hoveredMermaid: null,
    // 同步滾動相關
    syncScroll: true,  // 是否啟用同步滾動
    isScrolling: false,  // 防止滾動事件循環
    scrollSource: null  // 'editor' | 'preview' | null
  };

  // ===================================
  // Mermaid 設定與渲染
  // ===================================
  let mermaidConfiguredTheme = null;

  function getMermaidTheme() {
    return state.theme === 'dark' ? 'dark' : 'default';
  }

  function configureMermaidIfNeeded() {
    if (typeof mermaid === 'undefined') return;

    const theme = getMermaidTheme();
    if (mermaidConfiguredTheme === theme) return;

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: 'strict',
        flowchart: {
          htmlLabels: true
        }
      });
      mermaidConfiguredTheme = theme;
    } catch (e) {
      console.error('Mermaid initialize error:', e);
    }
  }

  function normalizeMermaidSource(src) {
    // 一些資料會用 <br />，Mermaid 對換行較穩定的寫法是 <br/> 或 \n
    return String(src)
      .replace(/<br\s*\/>/gi, '<br/>')
      .replace(/<br\s*>/gi, '<br/>');
  }

  function renderMermaidIn(container) {
    if (!container) return;
    if (typeof mermaid === 'undefined') return;

    configureMermaidIfNeeded();

    // 找出 fenced code: ```mermaid
    const codeBlocks = container.querySelectorAll(
      'pre > code.language-mermaid, pre > code.lang-mermaid, pre > code[class*="language-mermaid"], pre > code[class*="lang-mermaid"]'
    );

    if (!codeBlocks || codeBlocks.length === 0) return;

    for (const codeEl of codeBlocks) {
      const pre = codeEl.parentElement;
      if (!pre) continue;

      const src = normalizeMermaidSource(codeEl.textContent || '');

      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrapper';

      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';
      toolbar.setAttribute('role', 'group');
      toolbar.setAttribute('aria-label', 'Mermaid 縮放');
      toolbar.innerHTML = `
        <button type="button" class="btn mermaid-zoom-btn" data-action="out" title="縮小">➖</button>
        <button type="button" class="btn mermaid-zoom-btn mermaid-zoom-reset" data-action="reset" title="重設 100%">
          <span class="mermaid-zoom-label">${state.zoom}%</span>
        </button>
        <button type="button" class="btn mermaid-zoom-btn" data-action="in" title="放大">➕</button>
      `;

      const mermaidDiv = document.createElement('div');
      mermaidDiv.className = 'mermaid';
      mermaidDiv.dataset.mermaid = src;
      mermaidDiv.textContent = src;

      wrapper.appendChild(toolbar);
      wrapper.appendChild(mermaidDiv);
      pre.replaceWith(wrapper);
    }

    // 讓 Mermaid 把 .mermaid 轉成 SVG
    try {
      const nodes = container.querySelectorAll('.mermaid');
      for (const node of nodes) {
        // 每次渲染前都先把 source 放回去，避免已經是 SVG 的狀態
        const src = node.dataset.mermaid;
        if (typeof src === 'string') {
          node.innerHTML = '';
          node.textContent = src;
        }
      }

      if (typeof mermaid.run === 'function') {
        mermaid.run({ nodes });
      } else if (typeof mermaid.init === 'function') {
        mermaid.init(undefined, nodes);
      }

      // 套用當前縮放到 Mermaid 容器（避免圖不跟著縮放）
      applyZoomToMermaid(container);
    } catch (e) {
      console.error('Mermaid render error:', e);
    }
  }

  function getMermaidBaseSize(svg) {
    // 盡可能用 viewBox 當作「原始尺寸」基準
    try {
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
      if (vb && vb.width > 0 && vb.height > 0) {
        return { w: vb.width, h: vb.height };
      }
    } catch (_) {
      // ignore
    }

    // fallback: bbox
    try {
      const bbox = svg.getBBox();
      if (bbox && bbox.width > 0 && bbox.height > 0) {
        return { w: bbox.width, h: bbox.height };
      }
    } catch (_) {
      // ignore
    }

    // 最後退回固定預設
    return { w: 800, h: 600 };
  }

  function applyZoomToMermaid(container) {
    if (!container) return;

    const scale = clampZoom(state.zoom) / 100;
    const mermaidBlocks = container.querySelectorAll('.mermaid');

    for (const block of mermaidBlocks) {
      const svg = block.querySelector('svg');
      if (!svg) continue;

      // 記住 base size，避免每次都重新計算
      if (!block.dataset.baseW || !block.dataset.baseH) {
        const base = getMermaidBaseSize(svg);
        block.dataset.baseW = String(base.w);
        block.dataset.baseH = String(base.h);
      }

      const baseW = Number(block.dataset.baseW) || 800;
      const baseH = Number(block.dataset.baseH) || 600;
      const newW = Math.max(1, Math.round(baseW * scale));
      const newH = Math.max(1, Math.round(baseH * scale));

      // Mermaid 常會塞 max-width，這裡要關掉，才能真的放大縮小
      svg.style.maxWidth = 'none';
      svg.setAttribute('width', String(newW));
      svg.setAttribute('height', String(newH));
    }
  }

  // ===================================
  // Storage 工具函數
  // ===================================
  const storage = {
    async get(key) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get([key], (result) => {
            resolve(result[key]);
          });
        } else {
          // 開發環境使用 localStorage
          const value = localStorage.getItem(key);
          resolve(value ? JSON.parse(value) : undefined);
        }
      });
    },
    
    async set(key, value) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ [key]: value }, resolve);
        } else {
          localStorage.setItem(key, JSON.stringify(value));
          resolve();
        }
      });
    },
    
    async remove(key) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.remove([key], resolve);
        } else {
          localStorage.removeItem(key);
          resolve();
        }
      });
    }
  };

  // ===================================
  // Markdown 渲染
  // ===================================

  /**
   * 取得 Obsidian 風格圖片的基礎路徑
   * Obsidian 會在檔案同目錄下建立 assets/檔名/ 資料夾存放圖片
   * 回傳絕對路徑，例如：file:///C:/path/assets/filename/
   */
  function getObsidianAssetsBasePath() {
    // 取得目前檔案的目錄路徑和檔名（不含副檔名）
    const filename = state.currentFilename || 'document.md';
    const filenameWithoutExt = filename.replace(/\.(md|markdown|txt)$/i, '');
    
    // 優先使用保存的原始 file:// URL
    const fileUrl = state.currentFileUrl || '';
    
    if (fileUrl && (fileUrl.startsWith('file:///') || fileUrl.startsWith('file://'))) {
      // 找到最後一個 / 的位置，取得目錄路徑
      const lastSlash = fileUrl.lastIndexOf('/');
      if (lastSlash > 0) {
        const dirPath = fileUrl.substring(0, lastSlash + 1);
        // 組成完整的 file:// 絕對路徑
        return `${dirPath}assets/${encodeURIComponent(filenameWithoutExt)}/`;
      }
    }
    
    // 備用方案：嘗試從 location.href 取得
    const href = location.href || '';
    if (href.startsWith('file:///') || href.startsWith('file://')) {
      const lastSlash = href.lastIndexOf('/');
      if (lastSlash > 0) {
        const dirPath = href.substring(0, lastSlash + 1);
        return `${dirPath}assets/${encodeURIComponent(filenameWithoutExt)}/`;
      }
    }
    
    // 最後備用：使用相對路徑
    return `assets/${encodeURIComponent(filenameWithoutExt)}/`;
  }

  /**
   * 將 Obsidian 風格的圖片語法 ![[filename.png]] 轉換為標準 Markdown 圖片語法
   * 使用特殊的 data 屬性標記，以便後續非同步載入
   */
  function convertObsidianImages(markdown) {
    // 匹配 ![[filename.ext]] 或 ![[filename.ext|alt text]] 格式
    const obsidianImageRegex = /!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;
    
    const assetsBasePath = getObsidianAssetsBasePath();
    
    return markdown.replace(obsidianImageRegex, (match, filename, altText) => {
      // 清理檔名
      const cleanFilename = filename.trim();
      
      // 判斷是否為圖片檔案
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      const ext = cleanFilename.substring(cleanFilename.lastIndexOf('.')).toLowerCase();
      
      if (!imageExtensions.includes(ext)) {
        // 非圖片檔案，保持原樣
        return match;
      }
      
      const alt = altText ? altText.trim() : cleanFilename;
      
      // 如果有完整的 file:// 路徑，直接使用
      if (assetsBasePath && assetsBasePath.startsWith('file:')) {
        const imagePath = assetsBasePath + encodeURIComponent(cleanFilename);
        return `![${alt}](${imagePath})`;
      }
      
      // 否則使用特殊標記，讓後續非同步處理
      // 使用 data-obsidian-image 屬性標記需要載入的圖片
      return `<img data-obsidian-image="${cleanFilename}" alt="${alt}" class="obsidian-image-placeholder">`;
    });
  }

  /**
   * 非同步載入本地圖片（透過 File System Access API）
   * 支援 Obsidian 風格和標準 Markdown 圖片
   */
  async function loadLocalImages(container) {
    if (!container) return;
    
    let hasUnloaded = false;
    
    // 1. 處理 Obsidian 風格圖片（有 data-obsidian-image 屬性）
    const obsidianImages = container.querySelectorAll('img[data-obsidian-image]');
    
    if (!state.currentDirHandle) {
      // 沒有目錄權限
      if (obsidianImages.length > 0) {
        hasUnloaded = true;
        for (const img of obsidianImages) {
          img.classList.add('obsidian-image-error');
          img.title = '點擊工具列的「圖片」按鈕載入本地圖片';
        }
      }
    } else {
      // 有目錄權限，嘗試載入
      for (const img of obsidianImages) {
        const imageName = img.dataset.obsidianImage;
        if (!imageName) continue;
        
        const blobUrl = await loadImageFromAssets(imageName);
        if (blobUrl) {
          img.src = blobUrl;
          img.classList.remove('obsidian-image-placeholder');
          img.classList.remove('obsidian-image-error');
        } else {
          img.classList.add('obsidian-image-error');
          img.title = `無法載入圖片: ${imageName}`;
          hasUnloaded = true;
        }
      }
    }
    
    // 2. 處理標準 Markdown 圖片
    const allImages = container.querySelectorAll('img:not([data-obsidian-image])');
    for (const img of allImages) {
      const src = img.getAttribute('src') || '';
      
      // 跳過網路圖片和已載入的 blob 圖片
      if (!src || src.startsWith('http://') || src.startsWith('https://') || 
          src.startsWith('data:') || src.startsWith('blob:')) {
        continue;
      }
      
      // file:// 圖片或相對路徑圖片
      const isFileProtocol = src.startsWith('file:');
      const imagePath = isFileProtocol ? src : decodeURIComponent(src);
      const imageName = imagePath.split('/').pop().split('?')[0];  // 移除查詢參數
      
      if (!state.currentDirHandle) {
        // 沒有目錄權限
        if (isFileProtocol) {
          // 對於 file:// 協定的圖片，監聽載入結果
          // 先標記為可能有問題
          hasUnloaded = true;
          
          img.onerror = () => {
            img.classList.add('local-image-error');
            img.title = '點擊工具列的「圖片」按鈕載入本地圖片';
          };
          
          img.onload = () => {
            // 圖片成功載入，移除錯誤狀態
            img.classList.remove('local-image-error');
            // 重新檢查是否還有未載入的圖片
            checkForUnloadedImages();
          };
          
          // 如果圖片已經載入失敗（naturalWidth 為 0 且 complete 為 true）
          if (img.complete && img.naturalWidth === 0) {
            img.classList.add('local-image-error');
            img.title = '點擊工具列的「圖片」按鈕載入本地圖片';
          }
        } else {
          // 相對路徑圖片
          hasUnloaded = true;
          img.classList.add('local-image-error');
          img.title = '點擊工具列的「圖片」按鈕載入本地圖片';
        }
      } else {
        // 有目錄權限，嘗試載入
        img.classList.add('local-image-loading');
        
        const blobUrl = await loadImageFromAssets(imageName);
        if (blobUrl) {
          img.src = blobUrl;
          img.classList.remove('local-image-loading');
          img.classList.remove('local-image-error');
          img.onerror = null;  // 清除錯誤處理器
          img.onload = null;
        } else {
          img.classList.remove('local-image-loading');
          img.classList.add('local-image-error');
          img.title = `無法載入圖片: ${imageName}`;
          hasUnloaded = true;
        }
      }
    }
    
    state.hasUnloadedImages = hasUnloaded;
    updateLoadImagesButton();
  }
  
  /**
   * 檢查是否還有未載入的圖片
   */
  function checkForUnloadedImages() {
    if (!elements.preview) return;
    
    let hasUnloaded = false;
    
    // 檢查 Obsidian 圖片（有 data-obsidian-image 屬性）
    const obsidianImages = elements.preview.querySelectorAll('img[data-obsidian-image]');
    if (obsidianImages.length > 0 && !state.currentDirHandle) {
      hasUnloaded = true;
      // 確保標記錯誤樣式
      for (const img of obsidianImages) {
        if (!img.src || !img.src.startsWith('blob:')) {
          img.classList.add('obsidian-image-error');
          img.title = '點擊工具列的「圖片」按鈕載入本地圖片';
        }
      }
    }
    
    // 檢查已標記錯誤的圖片
    const obsidianErrors = elements.preview.querySelectorAll('img.obsidian-image-error');
    if (obsidianErrors.length > 0) {
      hasUnloaded = true;
    }
    
    // 檢查標準圖片錯誤
    const localErrors = elements.preview.querySelectorAll('img.local-image-error');
    if (localErrors.length > 0) {
      hasUnloaded = true;
    }
    
    // 檢查所有圖片，找出需要載入的本地圖片
    const allImages = elements.preview.querySelectorAll('img:not([data-obsidian-image])');
    for (const img of allImages) {
      const src = img.getAttribute('src') || '';
      
      // 跳過網路圖片和已載入的圖片
      if (!src || src.startsWith('http://') || src.startsWith('https://') || 
          src.startsWith('data:') || src.startsWith('blob:')) {
        continue;
      }
      
      // 檢查圖片是否已載入失敗
      if (img.complete && img.naturalWidth === 0) {
        hasUnloaded = true;
        img.classList.add('local-image-error');
        img.title = '點擊工具列的「圖片」按鈕載入本地圖片';
      } else if (!state.currentDirHandle && !src.startsWith('file:')) {
        // 相對路徑圖片在沒有目錄權限時無法載入
        hasUnloaded = true;
        img.classList.add('local-image-error');
        img.title = '點擊工具列的「圖片」按鈕載入本地圖片';
      }
    }
    
    state.hasUnloadedImages = hasUnloaded;
    updateLoadImagesButton();
  }
  
  /**
   * 更新載入圖片按鈕狀態
   */
  function updateLoadImagesButton() {
    if (!elements.loadImagesBtn) return;
    
    if (state.hasUnloadedImages && !state.currentDirHandle) {
      elements.loadImagesBtn.disabled = false;
      elements.loadImagesBtn.classList.remove('btn-disabled');
      elements.loadImagesBtn.classList.add('btn-highlight');
      elements.loadImagesBtn.title = '載入圖片 (授權資料夾以顯示本地圖片)';
    } else if (state.currentDirHandle) {
      elements.loadImagesBtn.disabled = true;
      elements.loadImagesBtn.classList.add('btn-disabled');
      elements.loadImagesBtn.classList.remove('btn-highlight');
      elements.loadImagesBtn.title = '已授權資料夾';
    } else {
      elements.loadImagesBtn.disabled = true;
      elements.loadImagesBtn.classList.add('btn-disabled');
      elements.loadImagesBtn.classList.remove('btn-highlight');
      elements.loadImagesBtn.title = '載入圖片 (目前沒有本地圖片)';
    }
  }
  
  /**
   * 授權目錄並重新載入圖片
   */
  async function authorizeAndLoadImages() {
    if (!('showDirectoryPicker' in window)) {
      alert('您的瀏覽器不支援資料夾選擇功能');
      return;
    }
    
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read'
      });
      
      state.currentDirHandle = dirHandle;
      state.imageCache = {};  // 清除快取
      
      // 重新載入圖片
      await loadLocalImages(elements.preview);
      
      showSaveNotification('✅ 已授權資料夾');
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('授權目錄失敗:', e);
      }
    }
  }

  function renderMarkdown(markdown) {
    if (!markdown || markdown.trim() === '') {
      elements.preview.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📝</span>
          <p>開始輸入 Markdown 或拖放 .md 檔案</p>
          <p class="hint">支援 GitHub Flavored Markdown</p>
          <p class="hint">提示：若拖曳本機檔案到 Chrome 沒有自動套用，請到擴充功能「詳細資料」開啟「允許存取檔案網址」</p>
        </div>
      `;
      return;
    }

    try {
      // 設定 marked 選項
      if (typeof marked !== 'undefined') {
        marked.setOptions({
          gfm: true,           // GitHub Flavored Markdown
          breaks: true,        // 換行符轉換為 <br>
          headerIds: true,     // 標題添加 ID
          mangle: false        // 不混淆 email 連結
        });

        // 先轉換 Obsidian 風格的圖片語法
        const processedMarkdown = convertObsidianImages(markdown);

        let html = marked.parse(processedMarkdown);
        
        // 使用 DOMPurify 清理 XSS，允許 data 屬性
        if (typeof DOMPurify !== 'undefined') {
          html = DOMPurify.sanitize(html, {
            ADD_TAGS: ['input', 'img'],
            ADD_ATTR: ['checked', 'disabled', 'type', 'src', 'alt', 'data-obsidian-image', 'class', 'title'],
            // 允許 file:// 協定的 URI（用於本地圖片）
            ADD_URI_SAFE_ATTR: ['src'],
            ALLOWED_URI_REGEXP: /^(?:(?:https?|file|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
          });
        }
        
        elements.preview.innerHTML = html;

        // Mermaid 渲染（在 HTML 插入後）
        queueMicrotask(() => {
          renderMermaidIn(elements.preview);
        });

        // 非同步載入本地圖片（透過 File System Access API）
        queueMicrotask(() => {
          loadLocalImages(elements.preview);
        });
      }
    } catch (error) {
      console.error('Markdown 渲染錯誤:', error);
      elements.preview.innerHTML = `<p style="color: var(--danger-color);">渲染錯誤: ${error.message}</p>`;
    }
  }

  // ===================================
  // 檔案處理
  // ===================================
  
  // 暫存選擇的檔案清單
  let pendingFileHandles = [];
  
  /**
   * 顯示檔案選擇 Modal
   */
  function showFilePickerModal() {
    if (!elements.filePickerModal) return;
    elements.filePickerModal.classList.add('active');
  }
  
  /**
   * 隱藏檔案選擇 Modal
   */
  function hideFilePickerModal() {
    if (!elements.filePickerModal) return;
    elements.filePickerModal.classList.remove('active');
    pendingFileHandles = [];
  }
  
  /**
   * 格式化檔案大小
   */
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  
  /**
   * 使用 File System Access API 開啟檔案（一次選擇目錄，可存取圖片）
   */
  async function openFileWithDirectoryAccess() {
    // 檢查是否支援 File System Access API
    if (!('showDirectoryPicker' in window)) {
      // 不支援，使用傳統方式
      elements.fileInput.click();
      return;
    }

    try {
      // 讓用戶選擇資料夾
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read'
      });
      
      // 保存目錄 handle（用於載入圖片）
      state.currentDirHandle = dirHandle;
      
      // 列出資料夾中的 Markdown 檔案
      const mdFiles = [];
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const name = entry.name.toLowerCase();
          if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
            const file = await entry.getFile();
            mdFiles.push({
              handle: entry,
              name: entry.name,
              size: file.size,
              lastModified: file.lastModified
            });
          }
        }
      }

      if (mdFiles.length === 0) {
        alert('此資料夾中沒有找到 Markdown 檔案 (.md, .markdown, .txt)');
        return;
      }

      // 依檔名排序
      mdFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      // 如果只有一個檔案，直接開啟
      if (mdFiles.length === 1) {
        const file = await mdFiles[0].handle.getFile();
        await handleFileWithHandle(file, mdFiles[0].handle);
        return;
      }

      // 多個檔案，顯示 Modal 讓用戶選擇
      pendingFileHandles = mdFiles;
      renderFileList(mdFiles);
      showFilePickerModal();
      
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('開啟檔案錯誤:', e);
        // 回退到傳統方式
        elements.fileInput.click();
      }
    }
  }
  
  /**
   * 渲染檔案清單到 Modal
   */
  function renderFileList(files) {
    if (!elements.fileList) return;
    
    if (files.length === 0) {
      elements.fileList.innerHTML = `
        <div class="file-list-empty">
          <div class="empty-icon">📭</div>
          <p>沒有找到 Markdown 檔案</p>
        </div>
      `;
      return;
    }
    
    elements.fileList.innerHTML = files.map((file, index) => `
      <div class="file-item" data-index="${index}">
        <span class="file-icon">📄</span>
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="file-size">${formatFileSize(file.size)}</span>
      </div>
    `).join('');
    
    // 綁定點擊事件
    elements.fileList.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', async () => {
        const index = parseInt(item.dataset.index, 10);
        const fileInfo = pendingFileHandles[index];
        if (fileInfo) {
          hideFilePickerModal();
          const file = await fileInfo.handle.getFile();
          await handleFileWithHandle(file, fileInfo.handle);
        }
      });
    });
  }
  
  /**
   * 輔助函數：HTML 轉義
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 處理透過 File System Access API 開啟的檔案
   */
  async function handleFileWithHandle(file, fileHandle) {
    if (!file) return;
    
    const validExtensions = ['.md', '.markdown', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      alert('請選擇 .md、.markdown 或 .txt 檔案');
      return;
    }

    const content = await file.text();
    elements.editor.value = content;
    state.currentFilename = file.name;
    state.currentFileUrl = '';  // 清除舊的 file:// URL
    state.currentFileHandle = fileHandle;  // 保存檔案 handle 以便後續直接儲存
    state.imageCache = {};  // 清除圖片快取
    elements.filename.textContent = file.name;
    elements.saveFilename.value = file.name;
    updateSaveButtonState();  // 更新儲存按鈕狀態
    
    renderMarkdown(content);
    saveDraft();
  }

  /**
   * 從目錄載入圖片（使用 File System Access API）
   * 會嘗試多種可能的路徑結構
   */
  async function loadImageFromAssets(imageName) {
    if (!state.currentDirHandle) {
      console.log('沒有目錄權限，無法載入圖片:', imageName);
      return null;
    }
    
    // 檢查快取
    if (state.imageCache[imageName]) {
      return state.imageCache[imageName];
    }

    const filenameWithoutExt = state.currentFilename.replace(/\.(md|markdown|txt)$/i, '');
    
    // 定義可能的圖片路徑（按優先順序）
    const possiblePaths = [
      // 1. 直接在選擇的目錄下
      [imageName],
      // 2. assets/檔名/ 資料夾（Obsidian 風格）
      ['assets', filenameWithoutExt, imageName],
      // 3. assets/ 資料夾
      ['assets', imageName],
      // 4. images/ 資料夾
      ['images', imageName],
      // 5. img/ 資料夾
      ['img', imageName],
      // 6. 檔名/ 資料夾
      [filenameWithoutExt, imageName],
    ];

    for (const pathParts of possiblePaths) {
      try {
        let currentHandle = state.currentDirHandle;
        
        // 遍歷路徑的每個部分（除了最後一個是檔案）
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathParts[i], { create: false });
        }
        
        // 取得圖片檔案（最後一個部分）
        const imageHandle = await currentHandle.getFileHandle(pathParts[pathParts.length - 1], { create: false });
        const imageFile = await imageHandle.getFile();
        
        // 建立 blob URL
        const blobUrl = URL.createObjectURL(imageFile);
        state.imageCache[imageName] = blobUrl;
        console.log('成功載入圖片:', imageName, '路徑:', pathParts.join('/'));
        return blobUrl;
      } catch (e) {
        // 這個路徑不存在，嘗試下一個
        continue;
      }
    }
    
    console.log('所有路徑都找不到圖片:', imageName);
    return null;
  }

  function handleFile(file) {
    if (!file) return;
    
    // 檢查檔案類型
    const validExtensions = ['.md', '.markdown', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      alert('請選擇 .md、.markdown 或 .txt 檔案');
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (event) => {
      const content = event.target.result;
      elements.editor.value = content;
      state.currentFilename = file.name;
      state.currentFileUrl = '';  // 拖曳時無法取得完整路徑
      state.currentDirHandle = null;  // 拖曳時無法取得目錄 handle
      state.currentFileHandle = null;  // 拖曳時無法取得檔案 handle
      state.imageCache = {};  // 清除圖片快取
      state.hasUnloadedImages = false;  // 重置狀態
      elements.filename.textContent = file.name;
      elements.saveFilename.value = file.name;
      updateSaveButtonState();  // 更新儲存按鈕狀態
      
      renderMarkdown(content);
      saveDraft();
      
      // 延遲檢查未載入的圖片（確保 loadLocalImages 已經執行完）
      setTimeout(() => {
        checkForUnloadedImages();
      }, 500);
    };
    
    reader.onerror = () => {
      alert('讀取檔案時發生錯誤');
    };
    
    reader.readAsText(file);
  }

  // ===================================
  // 拖放功能
  // ===================================
  function initDragAndDrop() {
    // 防止預設行為
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.body.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // 拖入
    document.body.addEventListener('dragenter', (e) => {
      if (e.dataTransfer.types.includes('Files')) {
        state.isDragging = true;
        elements.dropzoneOverlay.classList.add('active');
      }
    });

    // 拖動中
    document.body.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) {
        elements.dropzoneOverlay.classList.add('active');
      }
    });

    // 拖離
    document.body.addEventListener('dragleave', (e) => {
      // 檢查是否真的離開了視窗
      if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
        state.isDragging = false;
        elements.dropzoneOverlay.classList.remove('active');
      }
    });

    // 放下
    document.body.addEventListener('drop', (e) => {
      state.isDragging = false;
      elements.dropzoneOverlay.classList.remove('active');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    });
  }

  // ===================================
  // 分隔線拖動調整
  // ===================================
  function initResizer() {
    let startX;
    let startWidth;

    elements.resizer.addEventListener('mousedown', (e) => {
      state.isResizing = true;
      startX = e.clientX;
      startWidth = elements.editorPanel.offsetWidth;
      elements.resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!state.isResizing) return;
      
      const containerWidth = elements.container.offsetWidth;
      const newWidth = startWidth + (e.clientX - startX);
      const percentage = (newWidth / containerWidth) * 100;
      
      // 限制範圍 0% - 100%，讓使用者可以完全隱藏任一面板
      const clampedPercentage = Math.max(0, Math.min(100, percentage));
      state.editorWidth = clampedPercentage;
      
      // 當拖到極端值時，隱藏對應面板
      if (clampedPercentage <= 2) {
        // 幾乎完全隱藏編輯器 -> 切換到僅預覽模式
        elements.editorPanel.style.flex = '0 0 0%';
        elements.editorPanel.style.display = 'none';
        elements.previewPanel.style.flex = '1 1 100%';
      } else if (clampedPercentage >= 98) {
        // 幾乎完全隱藏預覽 -> 切換到僅編輯模式
        elements.editorPanel.style.flex = '1 1 100%';
        elements.previewPanel.style.flex = '0 0 0%';
        elements.previewPanel.style.display = 'none';
      } else {
        // 正常分割模式
        elements.editorPanel.style.display = '';
        elements.previewPanel.style.display = '';
        elements.editorPanel.style.flex = `0 0 ${clampedPercentage}%`;
        elements.previewPanel.style.flex = `0 0 ${100 - clampedPercentage}%`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (state.isResizing) {
        state.isResizing = false;
        elements.resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // 根據最終位置決定視圖模式
        if (state.editorWidth <= 2) {
          // 切換到僅預覽模式
          setView('preview');
        } else if (state.editorWidth >= 98) {
          // 切換到僅編輯模式
          setView('edit');
        } else {
          // 保持分割模式，恢復正常顯示
          elements.editorPanel.style.display = '';
          elements.previewPanel.style.display = '';
          storage.set('editorWidth', state.editorWidth);
        }
      }
    });
  }

  // ===================================
  // 右側邊界拖動調整（調整預覽區最大寬度）
  // ===================================
  function initResizerRight() {
    if (!elements.resizerRight) return;

    let startX;
    let startMaxWidth;

    elements.resizerRight.addEventListener('mousedown', (e) => {
      state.isResizingRight = true;
      startX = e.clientX;
      startMaxWidth = state.previewMaxWidth;
      elements.resizerRight.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!state.isResizingRight) return;
      
      const containerWidth = elements.container.offsetWidth;
      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newMaxWidth = startMaxWidth + deltaPercent;
      
      // 限制範圍 30% - 100%
      if (newMaxWidth >= 30 && newMaxWidth <= 100) {
        state.previewMaxWidth = newMaxWidth;
        applyPreviewMaxWidth();
      }
    });

    document.addEventListener('mouseup', () => {
      if (state.isResizingRight) {
        state.isResizingRight = false;
        elements.resizerRight.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        storage.set('previewMaxWidth', state.previewMaxWidth);
      }
    });
  }

  function applyPreviewMaxWidth() {
    if (!elements.previewPanel) return;
    elements.previewPanel.style.maxWidth = `${state.previewMaxWidth}%`;
  }

  // ===================================
  // 視圖模式切換
  // ===================================
  function setView(view) {
    state.currentView = view;
    
    // 移除所有視圖類別
    elements.container.classList.remove('view-edit', 'view-split', 'view-preview');
    
    // 移除所有按鈕的 active 狀態
    elements.viewEdit.classList.remove('active');
    elements.viewSplit.classList.remove('active');
    elements.viewPreview.classList.remove('active');
    
    // 套用新視圖
    switch (view) {
      case 'edit':
        elements.container.classList.add('view-edit');
        elements.viewEdit.classList.add('active');
        break;
      case 'preview':
        elements.container.classList.add('view-preview');
        elements.viewPreview.classList.add('active');
        break;
      default:
        elements.viewSplit.classList.add('active');
    }
    
    storage.set('viewMode', view);
  }

  // ===================================
  // 主題切換
  // ===================================
  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    elements.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    storage.set('theme', theme);

    // 主題切換後重新渲染 Mermaid
    configureMermaidIfNeeded();
    queueMicrotask(() => {
      renderMermaidIn(elements.preview);
    });
  }

  // ===================================
  // 縮放
  // ===================================
  function clampZoom(value) {
    // 不限制上限（避免 200% 天花板），但仍保留下限避免變成 0 或負數。
    return Math.max(10, value);
  }

  function applyZoom() {
    // 舊版工具列 zoomLabel（若存在則同步）
    if (elements.zoomLabel) elements.zoomLabel.textContent = `${state.zoom}%`;

    // Mermaid 上方每張圖自己的 label
    if (elements.preview) {
      const labels = elements.preview.querySelectorAll('.mermaid-zoom-label');
      for (const label of labels) {
        label.textContent = `${state.zoom}%`;
      }
    }

    applyZoomToMermaid(elements.preview);
  }

  function setZoom(value) {
    state.zoom = clampZoom(value);
    applyZoom();
    storage.set('zoom', state.zoom);
  }

  // ===================================
  // 全螢幕
  // ===================================
  function isFullscreen() {
    return Boolean(document.fullscreenElement);
  }

  async function toggleFullscreen() {
    try {
      if (!isFullscreen()) {
        // 進全螢幕時，預設切到「僅預覽」讓內容自動變寬
        state.viewBeforeFullscreen = state.currentView;
        setView('preview');
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error('Fullscreen toggle failed:', e);
    }
  }

  function updateFullscreenIcon() {
    if (!elements.fullscreenIcon) return;
    // ⛶ 進入、🗗 退出
    elements.fullscreenIcon.textContent = isFullscreen() ? '🗗' : '⛶';

    // 退出全螢幕時，恢復原本視圖
    if (!isFullscreen() && state.viewBeforeFullscreen) {
      const restore = state.viewBeforeFullscreen;
      state.viewBeforeFullscreen = null;
      setView(restore);
    }
  }

  // ===================================
  // 同步滾動功能
  // ===================================
  
  /**
   * 根據編輯器滾動位置同步預覽區
   */
  function syncEditorToPreview() {
    if (!state.syncScroll || state.isScrolling || state.currentView !== 'split') return;
    
    const editor = elements.editor;
    const preview = elements.preview;
    
    // 使用滾動百分比來同步
    const maxScroll = editor.scrollHeight - editor.clientHeight;
    if (maxScroll <= 0) return;
    
    const editorScrollPercent = editor.scrollTop / maxScroll;
    
    if (isNaN(editorScrollPercent) || !isFinite(editorScrollPercent)) return;
    
    state.isScrolling = true;
    state.scrollSource = 'editor';
    
    const previewMaxScroll = preview.scrollHeight - preview.clientHeight;
    const targetScrollTop = editorScrollPercent * previewMaxScroll;
    preview.scrollTop = targetScrollTop;
    
    // 延遲重置狀態，避免反向觸發
    setTimeout(() => {
      state.isScrolling = false;
      state.scrollSource = null;
    }, 50);
  }

  /**
   * 根據預覽區滾動位置同步編輯器
   */
  function syncPreviewToEditor() {
    if (!state.syncScroll || state.isScrolling || state.currentView !== 'split') return;
    
    const editor = elements.editor;
    const preview = elements.preview;
    
    // 使用滾動百分比來同步
    const maxScroll = preview.scrollHeight - preview.clientHeight;
    if (maxScroll <= 0) return;
    
    const previewScrollPercent = preview.scrollTop / maxScroll;
    
    if (isNaN(previewScrollPercent) || !isFinite(previewScrollPercent)) return;
    
    state.isScrolling = true;
    state.scrollSource = 'preview';
    
    const editorMaxScroll = editor.scrollHeight - editor.clientHeight;
    const targetScrollTop = previewScrollPercent * editorMaxScroll;
    editor.scrollTop = targetScrollTop;
    
    // 延遲重置狀態，避免反向觸發
    setTimeout(() => {
      state.isScrolling = false;
      state.scrollSource = null;
    }, 50);
  }

  /**
   * 初始化同步滾動事件
   */
  function initSyncScroll() {
    if (!elements.editor || !elements.preview) return;
    
    // 編輯器滾動時同步預覽區
    elements.editor.addEventListener('scroll', () => {
      if (state.scrollSource !== 'preview') {
        requestAnimationFrame(syncEditorToPreview);
      }
    });
    
    // 預覽區滾動時同步編輯器
    elements.preview.addEventListener('scroll', () => {
      if (state.scrollSource !== 'editor') {
        requestAnimationFrame(syncPreviewToEditor);
      }
    });
  }

  // ===================================
  // 同步選取/高亮功能
  // ===================================
  
  /**
   * 取得編輯器中游標所在的行號
   */
  function getEditorCurrentLine() {
    const editor = elements.editor;
    const cursorPos = editor.selectionStart;
    const content = editor.value.substring(0, cursorPos);
    return content.split('\n').length - 1;
  }

  /**
   * 取得編輯器中選取的文字範圍（行號）
   */
  function getEditorSelectionLines() {
    const editor = elements.editor;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    
    const contentBefore = editor.value.substring(0, start);
    const contentSelected = editor.value.substring(0, end);
    
    const startLine = contentBefore.split('\n').length - 1;
    const endLine = contentSelected.split('\n').length - 1;
    
    return { startLine, endLine };
  }

  /**
   * 建立編輯器行號到預覽區元素的映射
   */
  function buildLineToElementMap() {
    const content = elements.editor.value;
    const lines = content.split('\n');
    const lineMap = [];
    
    // 取得預覽區中所有可定位的元素
    const previewElements = elements.preview.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, table, hr, .mermaid-wrapper'
    );
    
    let elementIndex = 0;
    let inCodeBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // 追蹤程式碼區塊狀態
      if (/^```/.test(trimmedLine)) {
        if (!inCodeBlock) {
          // 程式碼區塊開始
          inCodeBlock = true;
          for (let j = elementIndex; j < previewElements.length; j++) {
            const el = previewElements[j];
            if (el.tagName.toLowerCase() === 'pre' || el.classList.contains('mermaid-wrapper')) {
              lineMap.push({ element: el, line: i });
              elementIndex = j + 1;
              break;
            }
          }
          if (lineMap.length <= i) lineMap.push(null);
        } else {
          // 程式碼區塊結束
          inCodeBlock = false;
          lineMap.push(null);
        }
        continue;
      }
      
      // 在程式碼區塊內，跳過
      if (inCodeBlock) {
        lineMap.push(null);
        continue;
      }
      
      // 空行跳過
      if (!trimmedLine) {
        lineMap.push(null);
        continue;
      }
      
      // 嘗試匹配標題
      if (/^#{1,6}\s/.test(trimmedLine)) {
        const headingLevel = trimmedLine.match(/^(#{1,6})/)[1].length;
        for (let j = elementIndex; j < previewElements.length; j++) {
          const el = previewElements[j];
          if (el.tagName.toLowerCase() === `h${headingLevel}`) {
            lineMap.push({ element: el, line: i });
            elementIndex = j + 1;
            break;
          }
        }
        if (lineMap.length <= i) lineMap.push(null);
        continue;
      }
      
      // 嘗試匹配分隔線
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmedLine)) {
        for (let j = elementIndex; j < previewElements.length; j++) {
          const el = previewElements[j];
          if (el.tagName.toLowerCase() === 'hr') {
            lineMap.push({ element: el, line: i });
            elementIndex = j + 1;
            break;
          }
        }
        if (lineMap.length <= i) lineMap.push(null);
        continue;
      }
      
      // 其他內容（段落、列表等）
      for (let j = elementIndex; j < previewElements.length; j++) {
        const el = previewElements[j];
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'p' || tagName === 'li' || tagName === 'blockquote' || tagName === 'table') {
          lineMap.push({ element: el, line: i });
          elementIndex = j + 1;
          break;
        }
      }
      if (lineMap.length <= i) lineMap.push(null);
    }
    
    return lineMap;
  }

  /**
   * 在預覽區高亮對應的元素
   */
  function highlightPreviewElements(startLine, endLine) {
    if (!state.syncHighlight || state.currentView !== 'split') return;
    
    // 移除之前的高亮
    const previousHighlights = elements.preview.querySelectorAll('.sync-highlight');
    previousHighlights.forEach(el => el.classList.remove('sync-highlight'));
    
    // 如果行號沒變，不重新計算
    if (state.lastHighlightLine === startLine && startLine === endLine) {
      return;
    }
    state.lastHighlightLine = startLine;
    
    const lineMap = buildLineToElementMap();
    const highlightedElements = new Set();
    
    for (let i = startLine; i <= endLine; i++) {
      if (lineMap[i] && lineMap[i].element) {
        highlightedElements.add(lineMap[i].element);
      }
    }
    
    // 如果沒找到精確匹配，嘗試找最近的元素
    if (highlightedElements.size === 0) {
      // 向前找最近的有對應元素的行
      for (let i = startLine; i >= 0; i--) {
        if (lineMap[i] && lineMap[i].element) {
          highlightedElements.add(lineMap[i].element);
          break;
        }
      }
    }
    
    // 移除舊的特效類別
    const oldFlash = elements.preview.querySelectorAll('.sync-highlight-flash, .sync-highlight-active');
    oldFlash.forEach(el => {
      el.classList.remove('sync-highlight-flash', 'sync-highlight-active');
    });
    
    // 添加高亮和閃光特效
    highlightedElements.forEach(el => {
      el.classList.add('sync-highlight', 'sync-highlight-flash');
    });
    
    // 1.2秒後移除閃光效果，改為持續脈動
    setTimeout(() => {
      highlightedElements.forEach(el => {
        el.classList.remove('sync-highlight-flash');
        el.classList.add('sync-highlight-active');
      });
    }, 1200);
    
    // 注意：不自動滾動預覽區，讓同步滾動機制處理
    // 這樣可以避免點擊時的跳動問題
  }

  /**
   * 根據預覽區點擊位置定位編輯器
   */
  function syncPreviewClickToEditor(event) {
    if (!state.syncHighlight || state.currentView !== 'split') return;
    
    const target = event.target;
    const clickedElement = target.closest('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td, th, .mermaid-wrapper');
    
    if (!clickedElement) return;
    
    // 取得點擊元素的文字內容
    const clickedText = clickedElement.textContent.trim();
    if (!clickedText || clickedText.length < 3) return;  // 忽略太短的文字
    
    // 在編輯器中搜尋對應的文字
    const editorContent = elements.editor.value;
    const lines = editorContent.split('\n');
    
    // 搜尋文字（取前 50 個字元）
    const searchText = clickedText.substring(0, 50);
    
    let bestMatch = -1;
    let bestScore = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;  // 跳過空行
      
      // 移除 Markdown 語法後比較
      const cleanLine = line
        .replace(/^#{1,6}\s+/, '')  // 標題
        .replace(/^\s*[-*+]\s+/, '') // 列表
        .replace(/^\s*\d+\.\s+/, '') // 數字列表
        .replace(/^\s*>\s*/, '')     // 引用
        .replace(/\*\*|__/g, '')     // 粗體
        .replace(/\*|_/g, '')        // 斜體
        .replace(/`/g, '')           // 行內程式碼
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // 連結
        .trim();
      
      if (!cleanLine || cleanLine.length < 3) continue;  // 跳過太短的行
      
      // 計算匹配分數（需要更精確的匹配）
      let score = 0;
      
      // 完全匹配優先
      if (cleanLine === searchText || searchText.startsWith(cleanLine) || cleanLine.startsWith(searchText)) {
        score = 100;
      }
      // 包含關係（要求較長的匹配）
      else if (searchText.length >= 10 && cleanLine.includes(searchText.substring(0, Math.min(30, searchText.length)))) {
        score = 80;
      }
      else if (cleanLine.length >= 10 && searchText.includes(cleanLine.substring(0, Math.min(30, cleanLine.length)))) {
        // 只有當 cleanLine 夠長時才算有效匹配
        score = cleanLine.length >= 20 ? 60 : cleanLine.length >= 10 ? 40 : 0;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = i;
      }
      
      // 如果已經找到完全匹配，直接使用
      if (score === 100) break;
    }
    
    // 只有當找到足夠好的匹配時才執行
    if (bestMatch >= 0 && bestScore >= 40) {
      const i = bestMatch;
      
      // 找到對應行，計算游標位置
      let cursorPos = 0;
      for (let j = 0; j < i; j++) {
        cursorPos += lines[j].length + 1; // +1 for newline
      }
      
      // 暫時停用同步滾動，避免循環
      const prevSyncScroll = state.syncScroll;
      state.syncScroll = false;
      
      // 設定編輯器游標位置
      elements.editor.setSelectionRange(cursorPos, cursorPos + lines[i].length);
      
      // 滾動編輯器到該行（不使用 focus 避免觸發其他事件）
      const lineHeight = parseInt(getComputedStyle(elements.editor).lineHeight) || 24;
      const targetScroll = i * lineHeight - elements.editor.clientHeight / 2;
      elements.editor.scrollTop = Math.max(0, targetScroll);
      
      // === 添加編輯器游標行的視覺特效 ===
      addEditorLineHighlight(i, lineHeight);
      
      // === 在預覽區添加絢麗的高亮特效 ===
      const previousHighlights = elements.preview.querySelectorAll('.sync-highlight, .sync-highlight-flash, .sync-highlight-active');
      previousHighlights.forEach(el => {
        el.classList.remove('sync-highlight', 'sync-highlight-flash', 'sync-highlight-active');
      });
      
      // 添加閃光特效
      clickedElement.classList.add('sync-highlight', 'sync-highlight-flash');
      
      // 1.2秒後移除閃光效果，但保持持續的脈動效果
      setTimeout(() => {
        clickedElement.classList.remove('sync-highlight-flash');
        clickedElement.classList.add('sync-highlight-active');
      }, 1200);
      
      // 延遲恢復同步滾動
      setTimeout(() => {
        state.syncScroll = prevSyncScroll;
      }, 100);
    }
  }

  /**
   * 在編輯器中添加游標行的視覺高亮特效
   */
  function addEditorLineHighlight(lineIndex, lineHeight) {
    if (!elements.editor) return;
    
    // 移除之前的高亮
    const oldHighlight = elements.editor.querySelector('.editor-highlight-line');
    if (oldHighlight) {
      oldHighlight.remove();
    }
    
    // 創建新的高亮元素
    const highlight = document.createElement('div');
    highlight.className = 'editor-highlight-line';
    
    // 取得編輯器的 padding 和實際內容區域
    const editorStyle = getComputedStyle(elements.editor);
    const paddingTop = parseInt(editorStyle.paddingTop) || 0;
    const paddingLeft = parseInt(editorStyle.paddingLeft) || 0;
    const paddingRight = parseInt(editorStyle.paddingRight) || 0;
    
    // 計算位置（相對於編輯器的捲動位置）
    // lineIndex * lineHeight 是行的絕對位置
    // - elements.editor.scrollTop 是減去捲動偏移
    // + paddingTop 是加上上方的 padding
    const topPosition = lineIndex * lineHeight - elements.editor.scrollTop + paddingTop;
    
    highlight.style.top = `${topPosition}px`;
    highlight.style.left = `${paddingLeft}px`;
    highlight.style.right = `${paddingRight}px`;
    highlight.style.height = `${lineHeight}px`;
    highlight.style.width = `calc(100% - ${paddingLeft + paddingRight}px)`;
    
    // 將高亮元素添加到編輯器內部
    elements.editor.appendChild(highlight);
    
    // 監聽編輯器滾動，同步更新高亮位置
    const updatePosition = () => {
      if (highlight.parentNode) {
        const newTopPosition = lineIndex * lineHeight - elements.editor.scrollTop + paddingTop;
        highlight.style.top = `${newTopPosition}px`;
      }
    };
    
    elements.editor.addEventListener('scroll', updatePosition);
    
    // 1.5秒後自動移除（動畫結束後）
    setTimeout(() => {
      elements.editor.removeEventListener('scroll', updatePosition);
      if (highlight.parentNode) {
        highlight.remove();
      }
    }, 1500);
  }

  /**
   * 初始化同步選取/高亮功能
   */
  function initSyncHighlight() {
    if (!elements.editor || !elements.preview) return;
    
    // 編輯器游標移動或選取變化時
    elements.editor.addEventListener('click', () => {
      const { startLine, endLine } = getEditorSelectionLines();
      highlightPreviewElements(startLine, endLine);
      
      // 添加編輯器游標行的視覺特效
      const lineHeight = parseInt(getComputedStyle(elements.editor).lineHeight) || 24;
      addEditorLineHighlight(startLine, lineHeight);
    });
    
    elements.editor.addEventListener('keyup', (e) => {
      // 只在方向鍵、Home、End、PageUp、PageDown 時更新
      const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
      if (navKeys.includes(e.key) || e.ctrlKey || e.metaKey) {
        const { startLine, endLine } = getEditorSelectionLines();
        highlightPreviewElements(startLine, endLine);
      }
    });
    
    elements.editor.addEventListener('select', () => {
      const { startLine, endLine } = getEditorSelectionLines();
      highlightPreviewElements(startLine, endLine);
    });
    
    // 預覽區點擊時同步到編輯器
    elements.preview.addEventListener('click', syncPreviewClickToEditor);
    
    // 滑鼠移動時的臨時高亮（hover 效果）
    elements.preview.addEventListener('mouseover', (e) => {
      if (!state.syncHighlight || state.currentView !== 'split') return;
      
      const target = e.target;
      const hoverElement = target.closest('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td, th, .mermaid-wrapper');
      
      if (hoverElement && !hoverElement.classList.contains('sync-highlight')) {
        hoverElement.classList.add('sync-hover');
      }
    });
    
    elements.preview.addEventListener('mouseout', (e) => {
      const target = e.target;
      const hoverElement = target.closest('.sync-hover');
      if (hoverElement) {
        hoverElement.classList.remove('sync-hover');
      }
    });
  }

  // ===================================
  // Mermaid 圖拖曳平移（使用 transform 直接移動 SVG）
  // ===================================
  function initMermaidPanning() {
    if (!elements.preview) return;

    let active = null;
    let activeSvg = null;
    let startX = 0;
    let startY = 0;
    let startTranslateX = 0;
    let startTranslateY = 0;

    // 從 SVG 的 transform 取得目前偏移量
    function getTranslate(svg) {
      const style = svg.style.transform || '';
      const match = style.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
      if (match) {
        return { x: parseFloat(match[1]) || 0, y: parseFloat(match[2]) || 0 };
      }
      return { x: 0, y: 0 };
    }

    elements.preview.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const target = e.target;
      const block = target && target.closest ? target.closest('.mermaid') : null;
      if (!block) return;

      const svg = block.querySelector('svg');
      if (!svg) return;

      active = block;
      activeSvg = svg;
      startX = e.clientX;
      startY = e.clientY;
      
      const currentTranslate = getTranslate(svg);
      startTranslateX = currentTranslate.x;
      startTranslateY = currentTranslate.y;

      block.classList.add('dragging');
      block.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!active || !activeSvg) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newX = startTranslateX + dx;
      const newY = startTranslateY + dy;
      
      activeSvg.style.transform = `translate(${newX}px, ${newY}px)`;
    });

    window.addEventListener('mouseup', () => {
      if (!active) return;
      active.classList.remove('dragging');
      active.style.userSelect = '';
      active = null;
      activeSvg = null;
    });

    // 追蹤滑鼠是否停在 Mermaid（讓快捷鍵只作用在 Mermaid）
    elements.preview.addEventListener('mousemove', (e) => {
      const t = e.target;
      const block = t && t.closest ? t.closest('.mermaid') : null;
      state.hoveredMermaid = block;
    });

    elements.preview.addEventListener('mouseleave', () => {
      state.hoveredMermaid = null;
    });

    // Ctrl/Cmd + 滑鼠滾輪：只縮放 Mermaid 圖，並阻止瀏覽器整頁縮放
    elements.preview.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target;
      const block = t && t.closest ? t.closest('.mermaid') : null;
      if (!block) return;

      e.preventDefault();

      // deltaY > 0 通常代表往下滾（縮小）；往上滾（放大）
      const delta = e.deltaY > 0 ? -10 : 10;
      changeZoom(delta);
    }, { passive: false });

    // Mermaid 上方縮放按鈕（只會出現在 Mermaid 圖上方）
    elements.preview.addEventListener('click', (e) => {
      const target = e.target;
      const btn = target && target.closest ? target.closest('.mermaid-zoom-btn') : null;
      if (!btn) return;

      const wrapper = btn.closest ? btn.closest('.mermaid-wrapper') : null;
      const block = wrapper ? wrapper.querySelector('.mermaid') : null;
      if (block) state.hoveredMermaid = block;

      const action = btn.dataset ? btn.dataset.action : null;
      if (action === 'reset') {
        setZoom(100);
      } else if (action === 'in') {
        changeZoom(10);
      } else if (action === 'out') {
        changeZoom(-10);
      }
    });
  }

  function changeZoom(delta) {
    setZoom(state.zoom + delta);
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  // ===================================
  // 草稿儲存與恢復
  // ===================================
  let saveTimeout;
  
  function saveDraft() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const content = elements.editor.value;
      await storage.set('draft', {
        content: content,
        filename: state.currentFilename,
        timestamp: Date.now()
      });
    }, 500); // 延遲 500ms 儲存
  }

  async function loadDraft() {
    const draft = await storage.get('draft');
    if (draft && draft.content) {
      elements.editor.value = draft.content;
      state.currentFilename = draft.filename || 'document.md';
      state.currentDirHandle = null;  // 草稿沒有目錄權限
      state.currentFileHandle = null;  // 草稿沒有檔案權限
      state.imageCache = {};  // 清除圖片快取
      state.hasUnloadedImages = false;  // 重置狀態
      elements.filename.textContent = state.currentFilename;
      elements.saveFilename.value = state.currentFilename;
      renderMarkdown(draft.content);
    }
  }

  async function clearDraft() {
    if (confirm('確定要清除草稿嗎？這將清空編輯器內容。')) {
      await storage.remove('draft');
      elements.editor.value = '';
      state.currentFilename = 'document.md';
      elements.filename.textContent = '未開啟檔案';
      elements.saveFilename.value = 'document.md';
      renderMarkdown('');
    }
  }

  // ===================================
  // 另存新檔
  // ===================================
  function showSaveModal() {
    elements.saveModal.classList.add('active');
    elements.saveFilename.focus();
    elements.saveFilename.select();
  }

  function hideSaveModal() {
    elements.saveModal.classList.remove('active');
  }

  function saveFile() {
    let filename = elements.saveFilename.value.trim();
    
    if (!filename) {
      filename = 'document.md';
    }
    
    // 確保有 .md 副檔名
    if (!filename.endsWith('.md') && !filename.endsWith('.markdown')) {
      filename += '.md';
    }
    
    const content = elements.editor.value;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    state.currentFilename = filename;
    elements.filename.textContent = filename;
    hideSaveModal();
  }

  // ===================================
  // 儲存目前檔案（覆寫原檔案）
  // ===================================
  
  /**
   * 更新儲存按鈕狀態
   * 當有 fileHandle 時啟用儲存按鈕，否則禁用並顯示提示
   */
  function updateSaveButtonState() {
    if (!elements.saveCurrentBtn) return;
    
    if (state.currentFileHandle) {
      elements.saveCurrentBtn.disabled = false;
      elements.saveCurrentBtn.title = '儲存 (Ctrl+S)';
      elements.saveCurrentBtn.classList.remove('btn-disabled');
    } else {
      elements.saveCurrentBtn.disabled = true;
      elements.saveCurrentBtn.title = '儲存 (需使用「開啟」按鈕開啟檔案才能直接儲存)';
      elements.saveCurrentBtn.classList.add('btn-disabled');
    }
  }

  /**
   * 儲存目前檔案（直接覆寫原檔案）
   * 需要透過 File System Access API 開啟的檔案才能使用
   */
  async function saveCurrentFile() {
    if (!state.currentFileHandle) {
      // 沒有 fileHandle，提示用戶使用另存新檔
      alert('無法直接儲存：請使用「開啟」按鈕開啟檔案，或使用「另存」功能。\n\n提示：透過拖放或 file:// 開啟的檔案無法直接覆寫儲存。');
      return;
    }

    try {
      // 請求寫入權限
      const permission = await state.currentFileHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        const requestResult = await state.currentFileHandle.requestPermission({ mode: 'readwrite' });
        if (requestResult !== 'granted') {
          alert('需要寫入權限才能儲存檔案');
          return;
        }
      }

      // 寫入檔案
      const writable = await state.currentFileHandle.createWritable();
      const content = elements.editor.value;
      await writable.write(content);
      await writable.close();

      // 顯示儲存成功提示
      showSaveNotification('✅ 已儲存');
    } catch (e) {
      if (e.name === 'AbortError') {
        // 用戶取消了權限請求
        return;
      }
      console.error('儲存檔案錯誤:', e);
      alert('儲存失敗: ' + e.message);
    }
  }

  /**
   * 顯示儲存成功的短暫提示
   */
  function showSaveNotification(message) {
    // 移除舊的提示
    const oldNotification = document.querySelector('.save-notification');
    if (oldNotification) {
      oldNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'save-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // 觸發動畫
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // 2 秒後移除
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  // ===================================
  // 開啟檔案
  // ===================================
  function openFile() {
    // 優先使用 File System Access API（可存取同目錄的圖片）
    openFileWithDirectoryAccess();
  }

  // ===================================
  // 初始化
  // ===================================
  async function init() {
    // 載入儲存的設定
    const [savedTheme, savedView, savedWidth, savedDraft, savedPreviewMaxWidth] = await Promise.all([
      storage.get('theme'),
      storage.get('viewMode'),
      storage.get('editorWidth'),
      storage.get('draft'),
      storage.get('previewMaxWidth')
    ]);

    const savedZoom = await storage.get('zoom');

    // 套用主題（預設跟隨系統）
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }

    // 套用視圖模式
    if (savedView) {
      setView(savedView);
    }

    // 套用編輯器寬度
    if (savedWidth) {
      state.editorWidth = savedWidth;
      elements.editorPanel.style.flex = `0 0 ${savedWidth}%`;
      elements.previewPanel.style.flex = `0 0 ${100 - savedWidth}%`;
    }

    // 套用縮放
    if (typeof savedZoom === 'number') {
      state.zoom = clampZoom(savedZoom);
    }
    applyZoom();

    // 若是由 content script 傳入初始內容（例如 file://*.md），優先載入它
    const initial = (typeof window !== 'undefined' && window.__MDV_INITIAL__) ? window.__MDV_INITIAL__ : null;
    if (initial && typeof initial.content === 'string') {
      elements.editor.value = initial.content;
      state.currentFilename = initial.filename || state.currentFilename;
      state.currentFileUrl = initial.fileUrl || '';  // 保存原始的 file:// URL
      state.currentFileHandle = null;  // file:// 開啟的檔案沒有 handle
      state.currentDirHandle = null;  // file:// 開啟的檔案沒有目錄 handle
      state.hasUnloadedImages = false;  // 重置狀態
      elements.filename.textContent = state.currentFilename;
      elements.saveFilename.value = state.currentFilename;
      renderMarkdown(initial.content);
    } else {
      // 載入草稿
      await loadDraft();
    }

    // 更新儲存按鈕狀態
    updateSaveButtonState();
    
    // 更新載入圖片按鈕狀態（延遲確保圖片載入檢查完成）
    setTimeout(() => {
      checkForUnloadedImages();
    }, 500);

    // 初始化拖放
    initDragAndDrop();

    // 初始化分隔線拖動
    initResizer();

    // 初始化右側邊界拖動
    initResizerRight();

    // 套用預覽區最大寬度
    if (typeof savedPreviewMaxWidth === 'number') {
      state.previewMaxWidth = savedPreviewMaxWidth;
    }
    applyPreviewMaxWidth();

    // 綁定事件
    bindEvents();

    // Mermaid 拖曳平移
    initMermaidPanning();

    // 初始化同步滾動
    initSyncScroll();

    // 全螢幕狀態變化
    document.addEventListener('fullscreenchange', updateFullscreenIcon);

    // 監聽系統主題變化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // 只有在使用者沒有手動設定主題時才自動切換
      storage.get('theme').then(savedTheme => {
        if (!savedTheme) {
          setTheme(e.matches ? 'dark' : 'light');
        }
      });
    });
  }

  // ===================================
  // 事件綁定
  // ===================================
  function bindEvents() {
    // 編輯器即時預覽
    elements.editor.addEventListener('input', () => {
      renderMarkdown(elements.editor.value);
      saveDraft();
    });

    // 開啟檔案
    elements.openFileBtn.addEventListener('click', openFile);
    elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
      e.target.value = ''; // 重置，允許再次選擇同一檔案
    });

    // 儲存目前檔案
    if (elements.saveCurrentBtn) {
      elements.saveCurrentBtn.addEventListener('click', saveCurrentFile);
    }

    // 載入圖片
    if (elements.loadImagesBtn) {
      elements.loadImagesBtn.addEventListener('click', authorizeAndLoadImages);
    }

    // 另存新檔
    elements.saveFileBtn.addEventListener('click', showSaveModal);
    elements.closeSaveModal.addEventListener('click', hideSaveModal);
    elements.cancelSave.addEventListener('click', hideSaveModal);
    elements.confirmSave.addEventListener('click', saveFile);
    elements.saveFilename.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveFile();
      } else if (e.key === 'Escape') {
        hideSaveModal();
      }
    });

    // 點擊 Modal 背景關閉
    elements.saveModal.addEventListener('click', (e) => {
      if (e.target === elements.saveModal) {
        hideSaveModal();
      }
    });

    // 檔案選擇 Modal
    if (elements.closeFilePickerModal) {
      elements.closeFilePickerModal.addEventListener('click', hideFilePickerModal);
    }
    if (elements.cancelFilePicker) {
      elements.cancelFilePicker.addEventListener('click', hideFilePickerModal);
    }
    if (elements.filePickerModal) {
      elements.filePickerModal.addEventListener('click', (e) => {
        if (e.target === elements.filePickerModal) {
          hideFilePickerModal();
        }
      });
    }

    // 主題切換
    elements.themeBtn.addEventListener('click', toggleTheme);

    // 清除草稿
    elements.clearDraftBtn.addEventListener('click', clearDraft);

    // 視圖切換
    elements.viewEdit.addEventListener('click', () => setView('edit'));
    elements.viewSplit.addEventListener('click', () => setView('split'));
    elements.viewPreview.addEventListener('click', () => setView('preview'));

    // 舊版工具列縮放按鈕（若存在則保留相容）
    if (elements.zoomOutBtn) elements.zoomOutBtn.addEventListener('click', () => changeZoom(-10));
    if (elements.zoomInBtn) elements.zoomInBtn.addEventListener('click', () => changeZoom(10));
    if (elements.zoomResetBtn) elements.zoomResetBtn.addEventListener('click', () => setZoom(100));

    // 全螢幕
    if (elements.fullscreenBtn) elements.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // 鍵盤快捷鍵
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + S 儲存（直接覆寫）
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (state.currentFileHandle) {
          saveCurrentFile();
        } else {
          showSaveModal();
        }
      }
      // Ctrl/Cmd + Shift + S 另存新檔
      if ((e.ctrlKey || e.metaKey) && e.key === 'S' && e.shiftKey) {
        e.preventDefault();
        showSaveModal();
      }
      // Ctrl/Cmd + O 開啟
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        openFile();
      }
      // Escape 關閉 Modal
      if (e.key === 'Escape') {
        hideSaveModal();
      }

      // Ctrl/Cmd + + / - / 0 縮放
      if (e.ctrlKey || e.metaKey) {
        // 只在滑鼠停在 Mermaid 圖上時，才攔截並縮放 Mermaid。
        // 否則交給瀏覽器預設行為（整頁縮放）。
        if (!state.hoveredMermaid) {
          return;
        }

        if (e.key === '0') {
          e.preventDefault();
          setZoom(100);
        }
        // Windows: Ctrl + '=' 通常是放大（配合 Shift 會是 '+')
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          changeZoom(10);
        }
        if (e.key === '-') {
          e.preventDefault();
          changeZoom(-10);
        }
      }

      // F: 全螢幕
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        // 若目前在輸入框內，避免干擾輸入（例如輸入字母 f）
        const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
        if (tag !== 'textarea' && tag !== 'input') {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    });
  }

  // 啟動應用程式
  init();
})();
