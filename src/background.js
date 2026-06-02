/**
 * Background Service Worker
 * Handles extension lifecycle and message routing
 */

console.log('[RTK] Background service worker starting...');

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set up side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[RTK] Side panel setup error:', error));

// Message routing between content script and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[RTK] Background received message:', message);
  
  // Route messages between sidepanel and content script
  if (message.source === 'sidepanel') {
    // Forward to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { ...message, target: 'content' })
          .then(response => sendResponse(response))
          .catch(error => sendResponse({ success: false, error: error.message }));
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true; // Keep channel open
  }
  
  if (message.source === 'content') {
    // Forward to sidepanel (broadcast to all)
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open, silent fail
    });
  }
});

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[RTK] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[RTK] Extension updated');
  }
});

console.log('[RTK] Background service worker ready');
