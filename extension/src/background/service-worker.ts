const NYT_RECIPE_RE = /^https:\/\/cooking\.nytimes\.com\/recipes\//;

// Auto-open the popup when the user lands on an NYT Cooking recipe page.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.active) return;
  if (!tab.url || !NYT_RECIPE_RE.test(tab.url)) return;

  void tabId; // active tab is the default
  chrome.action.openPopup().catch(() => {
    // openPopup can fail if the window isn't focused — silently ignore.
  });
});
