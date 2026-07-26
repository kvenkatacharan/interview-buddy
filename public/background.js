// Service worker: relay toolbar click → content script
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (err) {
    // Expected on chrome://, chrome-extension://, and Web Store pages
    console.warn('[InterviewBuddy]', err.message);
  }
});
