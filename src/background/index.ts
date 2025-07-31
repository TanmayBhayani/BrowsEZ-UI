// Modern Background Script - Chrome Storage Based
import { TypedMessenger, BackgroundMessenger } from '@shared/utils/messaging';
import { apiClient } from '@shared/api';
import type { TabState } from '@shared/types/extension';
import { ExtensionStore } from './ExtensionStore';
import { initBackgroundSync } from './backgroundSyncer';

console.log('BrowsEZ: Modern background script loaded');

// Get the store instance
const store = ExtensionStore.getInstance();

// NEW: Initialize the BackgroundSyncer immediately so that
// its message listeners are registered even if `startUp` has
// not yet run (e.g. after a service-worker restart).
initBackgroundSync();

async function startUp() {
  
  // Initialize session with API client
  try {
    const sessionData = await apiClient.initializeSession();
    await initializeAllTabs();
    await injectContentScriptsToAllTabs();
    await embedHTMLOfAllActiveTabs();
  } catch (error) {
    console.error('Failed to initialize extension on startup:', error);
  }
  // Initialize background syncer
  // initBackgroundSync(); // Already initialized at top-level above.
}

// Utility Functions
function isDomainActive(url: string): boolean {
  if (!url) return false;
  try {
    const domain = new URL(url).hostname;
    const activeDomains = store.activeDomains;
    return activeDomains.some(activeDomain => 
      domain === activeDomain || 
      (activeDomain !== "" && domain.includes(activeDomain))
    );
  } catch (e) {
    return false;
  }
}

async function initializeAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    getOrInitializeTabState(tab.id, tab.url);
  }
}

async function injectContentScriptsToTab(tabId: number): Promise<boolean> {
  try {
    // First inject seedrandom.min.js
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['seedrandom.min.js']
    });
    
    // Then inject content.js
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    store.updateTabState.updateBasicInfo(tabId, { isContentScriptActive: true });
    console.log(`Successfully injected content scripts to tab ${tabId}`);
    return true;
  } catch (err) {
    console.log(`Error injecting content scripts to tab ${tabId}:`, err);
    return false;
  }
}

async function embedHTMLOfAllActiveTabs(): Promise<void> {
  try {
    console.log('Background: Starting to embed HTML for all active tabs');

    // Get all tabs in all windows
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;

      // Consider only domains where extension is active
      if (!isDomainActive(tab.url)) {
        continue;
      }

      // Ensure tab state exists
      const tabState = getOrInitializeTabState(tab.id, tab.url);

      // Skip if HTML already processed successfully
      if (tabState.htmlProcessingStatus === 'ready') {
        continue;
      }

      try {
        console.log(`Background: Requesting HTML from content script in tab ${tab.id}`);

        // Mark as processing
        store.updateTabState.updateHTMLProcessingStatus(tab.id, 'processing');

        // Ask content script for HTML
        const response = await BackgroundMessenger.getPageHTML(tab.id);

        if (response.success && response.data) {
          await apiClient.sendHTML(response.data.html, tab.id);
          store.updateTabState.updateHTMLProcessingStatus(tab.id, 'ready');
          console.log(`Background: HTML embedded for tab ${tab.id}`);
        } else {
          console.error(`Background: Could not retrieve HTML for tab ${tab.id}:`, response.error);
          store.updateTabState.updateHTMLProcessingStatus(tab.id, 'error');
        }
      } catch (err) {
        console.error(`Background: Error during HTML embed for tab ${tab.id}:`, err);
        store.updateTabState.updateHTMLProcessingStatus(tab.id, 'error');
      }
    }

    console.log('Background: Finished embedding HTML for active tabs');
  } catch (error) {
    console.error('Background: embedHTMLOfAllActiveTabs failed:', error);
  }
}

async function injectContentScriptsToAllTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        await injectContentScriptsToTab(tab.id!);
      }
    }
  } catch (err) {
    console.error('Error injecting content scripts to tabs:', err);
  }
}

async function sendMessageToTab(tabId: number, message: any): Promise<{ success: boolean; response?: any; error?: string }> {
  try {
    // Always include tabId so the message is routed to the correct content script context
    const response = await TypedMessenger.send(message.action as any, message, 'background', 'content', tabId);
    return response;
  } catch (error) {
    // Retry with injection
    const injected = await injectContentScriptsToTab(tabId);
    if (injected) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        const retryResponse = await TypedMessenger.send(message.action as any, message, 'background', 'content', tabId);
        return { success: retryResponse.success, response: retryResponse.data, error: retryResponse.error };
      } catch (retryError) {
        return { success: false, error: 'Failed after injection retry' };
      }
    }
    return { success: false, error: 'Failed to inject content scripts' };
  }
}

function getOrInitializeTabState(tabId: number, tabUrl: string): TabState {
  let tabState = store.tabStates[tabId];
  
  if (tabState) {
    return tabState;
  }

  console.log(`Background: No state for tab ${tabId}, initializing.`);
  const isActive = tabUrl ? isDomainActive(tabUrl) : false;

  // Initialize tab state in store
  store.initializeTabState(tabId); // This creates a default TabState
  // Now update it with available info
  store.updateTabState.updateBasicInfo(tabId, { isContentScriptActive: false, isActive, url: tabUrl }); 
  
  tabState = store.tabStates[tabId];
  return tabState;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    return tabs[0];
  }
  console.error("Background: No active tab could be determined.");
  return null;
}

// Event Listeners
chrome.runtime.onInstalled.addListener(startUp);

chrome.runtime.onStartup.addListener(startUp);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    (chrome.sidePanel as any).open({ tabId: tab.id });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Clean up from store
  store.clearTabState(tabId);
  console.log(`Cleaned up data for tab ${tabId}`);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log("Background: Tab activated:", activeInfo);
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.id) {
      // Always make sure we have a tab state before announcing the change
      getOrInitializeTabState(tab.id, tab.url ?? '');
      store.setCurrentTabId(tab.id);
    } else {
      store.setCurrentTabId(null);
    }
  } catch (error) {
    console.error("Error in onActivated listener:", error);
    store.setCurrentTabId(null);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // store.setCurrentTabId(null); // Optionally clear current tab when no window is focused
    return; 
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tab && tab.id) {
      console.log("Background: Window focused, processing active tab:", tab.id);
      // Ensure state exists before setting current
      getOrInitializeTabState(tab.id, tab.url);
      store.setCurrentTabId(tab.id);
    } else {
      store.setCurrentTabId(null); // Optionally clear if no suitable tab found
    }
  } catch (error) {
    console.error("Background: Error processing focused window's active tab:", error);
    // store.setCurrentTabId(null); // Optionally clear on error
  }
});

// Modern Message Handling using TypedMessenger
TypedMessenger.onMessage('GET_TAB_ID', async (payload, sender) => {
  if (sender.tab && sender.tab.id) {
    return { success: true, data: sender.tab.id };
  } else {
    const tab = await getActiveTab();
    return { success: true, data: tab ? tab.id : null };
  }
});

TypedMessenger.onMessage('UI_REQUEST_INITIAL_STATE', async (payload, sender) => {
  const tab = await getActiveTab(); 
  if (tab && tab.id && tab.url) {
    try {
      const tabState = getOrInitializeTabState(tab.id, tab.url);
      // store.setCurrentTabId(tab.id);
      return { 
        success: true, 
        data: { 
          currentTabId: tab.id, // Send currentTabId
          tabState: tabState 
        } 
      };
    } catch (e: any) {
      console.error("Error in UI_REQUEST_INITIAL_STATE handling:", e);
      const errorTabState = store.tabStates[tab.id] || { // use tab.id consistently
        tabId: tab.id, // ensure tabId is set
        url: tab.url, // include url if available
        title: tab.title, // include title if available
        isContentScriptActive: false,
        isActive: false,
        htmlProcessingStatus: 'error' as const,
        lastProcessedHTML: null,
        searchState: {
          lastSearch: null,
          currentPosition: 0,
          totalResults: 0,
          searchStatus: 'error' as const,
          searchResults: [],
          llmAnswer: '',
          navigationLinks: [],
        }
      };
      return { success: false, error: e.message, data: { tabState: errorTabState } };
    }
  } else {
    store.setCurrentTabId(null); // Clear currentTabId if no active tab
    console.error("UI_REQUEST_INITIAL_STATE: Could not get active tab info.");
    return { success: false, error: "Could not get active tab info for UI initialization." };
  }
});

TypedMessenger.onMessage('PERFORM_SEARCH', async (payload) => {
  const tabId = payload.tabId;
  const currentTabState = store.tabStates[tabId];
  if (!currentTabState || !currentTabState.url) {
     return { success: false, error: "No active tab state or URL in store" };
  }

  if (!currentTabState.isActive) {
    return { success: false, error: "Extension not active for this tab" };
  }
  if (currentTabState.htmlProcessingStatus !== 'ready') {
    return { success: false, error: "Tab is not ready to search" };
  }
  try {

    // Mark the search as in-progress without altering the existing conversation (React UI has already handled it)
    store.updateTabState.updateSearchState(tabId, {
      searchStatus: 'searching'
    });

    const useLlmFiltering = payload.searchType === 'smart';

    try {
      // Get the current conversation with the new user message
      // Filter to only include user and assistant messages
      const currentConversation = (currentTabState.searchState.conversation || [])
        .filter(msg => msg.role === 'user' || msg.role === 'assistant');
      
      const serverData = await apiClient.search(
        payload.searchString, 
        tabId, 
        useLlmFiltering,
        currentConversation
      );

      const searchResults = serverData.searchResults?.metadatas?.[0] ?? [];
      const totalResults = searchResults.length;

      const refreshedState = store.tabStates[tabId];
      const updatedConversation = [...(refreshedState.searchState.conversation || [])];
      updatedConversation.push({
        role: 'assistant',
        content: serverData.llmAnswer || '',
        timestamp: new Date().toISOString()
      });
      

      store.updateTabState.updateSearchState(tabId, {
        currentPosition: totalResults > 0 ? 1 : 0,
        totalResults,
        searchStatus: 'showing_results',
        searchResults,
        navigationLinks: serverData.navigationLinks || [],
        llmAnswer: serverData.llmAnswer || '',
        conversation: updatedConversation
      });

      return { success: true };
    } catch (error: any) {
      if (error.message === 'Unauthorized') {
        // Attempt session re-initialization & retry once after embedding HTML
        try {
          const htmlResponse = await BackgroundMessenger.getPageHTML(tabId);
          if (htmlResponse.success && htmlResponse.data) {
            await apiClient.sendHTML(htmlResponse.data.html, tabId);
            
            // Get the current conversation for retry
            // Filter to only include user and assistant messages
            const retryConversation = (store.tabStates[tabId].searchState.conversation || [])
              .filter(msg => msg.role === 'user' || msg.role === 'assistant');
            
            const retryData = await apiClient.search(
              payload.searchString, 
              tabId, 
              useLlmFiltering,
              retryConversation
            );

            const retryResults = retryData.searchResults?.metadatas?.[0] ?? [];
            const retryTotal = retryResults.length;

            const refreshedStateAfterRetry = store.tabStates[tabId];
            const cleanedConversationAfterRetry = (refreshedStateAfterRetry.searchState.conversation || []).filter(
              (msg: any) => !(msg.role === 'system' && msg.content === 'Searching...')
            );

            store.updateTabState.updateSearchState(tabId, {
              currentPosition: retryTotal > 0 ? 1 : 0,
              totalResults: retryTotal,
              searchStatus: 'showing_results',
              searchResults: retryResults,
              navigationLinks: retryData.navigationLinks || [],
              llmAnswer: retryData.llmAnswer || '',
              conversation: cleanedConversationAfterRetry
            });

            if (retryTotal > 0 && retryResults.length > 0) {
              const firstResultElement = retryResults[0];
              const isLink = firstResultElement.tag === 'a' || firstResultElement.attributes?.href || (firstResultElement.attributes && 'href' in firstResultElement.attributes);
              await sendMessageToTab(tabId, {
                action: 'highlightElement',
                element: firstResultElement,
                isLink
              });
            }

            return { success: true };
          }
        } catch (embeddedErr) {
          console.error('Error during unauthorized retry flow:', embeddedErr);
          // fall through to error handling below
        }
      }

      console.error('Error during search operation:', error);

      // Append error message to conversation
      try {
        const refreshedStateForError = store.tabStates[tabId];
        const errorConversation = (refreshedStateForError.searchState.conversation || []).filter(
          (msg: any) => !(msg.role === 'system' && msg.content === 'Searching...')
        );
        errorConversation.push({
          role: 'system',
          content: `Search failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });

        store.updateTabState.updateSearchState(tabId, {
          searchStatus: 'error',
          conversation: errorConversation
        });
      } catch (stateError) {
        console.error('Error updating tab state after failed search:', stateError);
      }

      return { success: false, error: error.message };
    }
  } catch (e: any) {
    console.error("Error in PERFORM_SEARCH handler:", e);
    return { success: false, error: e.message };
  }
});


TypedMessenger.onMessage('CLEANUP_SESSION', async (payload, sender) => {
  if (payload.sessionId) {
    await apiClient.cleanupSession(payload.sessionId);
  }
  return { success: true };
});

console.log('BrowsEZ: Modern background script fully initialized'); 