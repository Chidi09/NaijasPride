// Background script - handles communication between content script and NaijasPride API

const API_BASE_KEY = 'naijaspride_api_base';
const DEFAULT_API_BASE = 'http://localhost:3001';

// Get API base URL from storage
const getApiBase = async () => {
  const result = await chrome.storage.sync.get(API_BASE_KEY);
  return result[API_BASE_KEY] || DEFAULT_API_BASE;
};

// Store extracted sources temporarily
let pendingSources = [];

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    switch (request.type) {
      case 'VIDEO_SOURCE_FOUND':
        console.log('[NaijasPride Background] Video source found:', request.data);
        pendingSources.push(request.data);
        
        // Keep only last 50 sources
        if (pendingSources.length > 50) {
          pendingSources = pendingSources.slice(-50);
        }
        
        sendResponse({ success: true });
        break;

      case 'GET_PENDING_SOURCES':
        sendResponse({ sources: pendingSources });
        break;

      case 'CLEAR_SOURCES':
        pendingSources = [];
        sendResponse({ success: true });
        break;

      case 'SEND_TO_API':
        try {
          const apiBase = await getApiBase();
          const response = await fetch(`${apiBase}/api/v1/anime/browser-sources`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request.data),
          });
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }
          
          const result = await response.json();
          sendResponse({ success: true, data: result });
        } catch (error) {
          console.error('[NaijasPride Background] Failed to send to API:', error);
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
        break;

      case 'SET_API_BASE':
        await chrome.storage.sync.set({ [API_BASE_KEY]: request.data });
        sendResponse({ success: true });
        break;

      case 'GET_API_BASE':
        const apiBase = await getApiBase();
        sendResponse({ apiBase });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  
  return true; // Keep message channel open for async
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // The popup will handle this
});

console.log('[NaijasPride Background] Service worker initialized');