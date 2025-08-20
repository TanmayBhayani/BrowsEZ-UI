// Modern Background Script - Chrome Storage Based
import { TypedMessenger, BackgroundMessenger } from '@shared/utils/messaging';
import { apiClient } from '@shared/api';
import { ExtensionStore } from './ExtensionStore';
import { initBackgroundSync } from './backgroundSyncer';
import { getTabManager } from './TabManager';
import { initialTabState } from '@shared/state/tabStore';
import { isDomainActive } from './utils/utils';

console.log('BrowsEZ: Modern background script loaded');

// Get the store instance
const store = ExtensionStore.getInstance();

// NEW: Initialize the BackgroundSyncer immediately so that
// its message listeners are registered even if `startUp` has
// not yet run (e.g. after a service-worker restart).
initBackgroundSync();
const tabManager = getTabManager();

// Prevent duplicate startup flows
let hasInitialized = false;
let initInProgress = false;

async function startUp() {
  // Guard against concurrent or repeated initialization
  if (initInProgress) {
    console.log('StartUp already in progress, skipping');
    return;
  }
  if (hasInitialized) {
    console.log('StartUp already completed, skipping');
    return;
  }
  initInProgress = true;
  
  // Check authentication status first
  try {
    const authStatus = await apiClient.checkAuth();
    
    if (!authStatus.authenticated) {
      console.warn('User not authenticated, extension will wait for authentication');
      // Don't automatically trigger login - let the UI handle it
      // The extension will initialize when the user manually logs in
      return; // Leave hasInitialized=false so we can initialize after auth
    }
    
    console.log('User authenticated:', authStatus.user?.email);
    // Hydrate active domains from server to ensure we have persisted state
    try {
      const serverDomains = await apiClient.getActiveDomains();
      if (Array.isArray(serverDomains)) {
        store.setActiveDomains(serverDomains, false);
      }
    } catch (e) {
      console.error('Could not hydrate active domains from server:', e);
    }
    // Initialize TabManager orchestrator
    tabManager.initialize();

    // Mark initialization complete only after successful authenticated init
    hasInitialized = true;
  } catch (error) {
    console.error('Failed to initialize extension on startup:', error);
  }
  finally {
    initInProgress = false;
  }
  // Initialize background syncer
  // initBackgroundSync(); // Already initialized at top-level above.
}






// Moved to TabManager: embedHTMLOfAllActiveTabs()

// Moved to TabManager-driven on-demand injection


// Event Listeners
chrome.runtime.onInstalled.addListener(startUp);

// (Removed duplicate AUTH_COMPLETE listener that reloaded the extension)

// Listen for sidebar disconnect (when sidebar closes)
chrome.runtime.onConnect.addListener((port) => {
  console.log('BrowsEZ: Connection established:', port.name);
  
  if (port.name === 'sidebar') {
    port.onDisconnect.addListener(async () => {
      console.log('BrowsEZ: Sidebar disconnected, removing highlights from all tabs');
      
      try {
        // Get all tabs and remove highlights from each
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            try {
              await BackgroundMessenger.removeHighlights(tab.id);
            } catch (error) {
              // Silently handle errors for tabs that might not have content scripts
              console.error(`Could not remove highlights from tab ${tab.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Error removing highlights on sidebar close:', error);
      }
    });
  }
});

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

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log(`Background: Page loaded: ${tab.url}`);
    // Update Extension Store
    const newTabState = { ...initialTabState, url: tab.url, isActive: isDomainActive(tab.url), tabId: tabId };
    store.setTabState(tabId, newTabState);
    // Reconcile this tab via TabManager
    tabManager.reconcileTab(tabId);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log("Background: Tab activated:", activeInfo);
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.id) {
      // Always make sure we have a tab state before announcing the change
      tabManager.getOrInitializeTabState(tab.id, tab.url ?? '');
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
      tabManager.getOrInitializeTabState(tab.id, tab.url);
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
    const tab = await tabManager.getActiveTab();
    return { success: true, data: tab ? tab.id : null };
  }
});

TypedMessenger.onMessage('UI_REQUEST_INITIAL_STATE', async (payload, sender) => {
  const tab = await tabManager.getActiveTab(); 
  if (tab && tab.id && tab.url) {
    try {
      const tabState = tabManager.getOrInitializeTabState(tab.id, tab.url);
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
  BackgroundMessenger.removeHighlights(tabId);
  // Reconcile before searching to heal drift
  await tabManager.reconcileTab(tabId);
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
      console.error('Error during search operation:', error);
      store.updateTabState.setError(tabId, { code: 'SEARCH_FAILED', message: error.message });
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

// Handle authentication completion
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_COMPLETE') {
    console.log('Authentication completed, reinitializing extension...');
    
    if (message.success) {
      // Re-run startup process now that user is authenticated
      // Allow a fresh initialization after auth
      hasInitialized = false;
      startUp().then(() => {
        console.log('Extension reinitialized after authentication');
      }).catch((error) => {
        console.error('Failed to reinitialize extension after authentication:', error);
      });
    } else {
      console.log('Authentication failed:', message.error);
    }
    
    sendResponse({ received: true });
  }
});

console.log('BrowsEZ: Modern background script fully initialized');

// Initialize on startup
startUp();