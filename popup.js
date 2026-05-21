(function () {
  'use strict';

  const stepsText = [
    '拖曳本機 .md 需要啟用「允許存取檔案網址」。',
    '',
    '操作步驟：',
    '1) 打開 chrome://extensions/',
    '2) 找到「Markdown Viewer」→ 點「詳細資料」',
    '3) 開啟「允許存取檔案網址」',
    '',
    '完成後，把 .md 檔案拖進 Chrome 視窗即可預覽。'
  ].join('\n');

  function setStatus(message) {
    const status = document.getElementById('status');
    if (!status) return;
    status.textContent = message;
    status.style.opacity = '1';
    window.clearTimeout(setStatus._t);
    setStatus._t = window.setTimeout(() => {
      status.style.opacity = '0';
    }, 1800);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function openExtensionDetailsPage() {
    const id = (chrome && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : '';
    const url = id ? `chrome://extensions/?id=${id}` : 'chrome://extensions/';

    try {
      if (chrome && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
        return true;
      }
    } catch (_) {
      // ignore
    }

    try {
      window.open(url, '_blank');
      return true;
    } catch (_) {
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('openViewer');
    const settingsBtn = document.getElementById('openSettings');
    const copyBtn = document.getElementById('copySteps');

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        try {
          const url = chrome.runtime.getURL('viewer.html');
          if (chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url });
          } else {
            window.open(url, '_blank');
          }
        } catch (_) {
          // no-op
        }
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        const ok = openExtensionDetailsPage();
        if (!ok) {
          setStatus('無法自動開啟，請手動到 chrome://extensions');
        }
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await copyToClipboard(stepsText);
          setStatus('已複製指引');
        } catch (_) {
          setStatus('複製失敗，請手動操作');
        }
      });
    }
  });
})();
