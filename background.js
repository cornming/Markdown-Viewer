(function () {
  'use strict';

  // 點擊擴充功能圖示 → 開啟 viewer.html 新分頁
  chrome.action.onClicked.addListener(() => {
    const url = chrome.runtime.getURL('viewer.html');
    chrome.tabs.create({ url });
  });
})();
