// Modern Background Script - Chrome Storage Based
import { TypedMessenger } from '@shared/utils/messaging';
import { apiClient } from '@shared/api';
import type { TabState, ConversationMessage } from '@shared/types/extension';
import type { MessageType } from '@shared/types/messages';
import { ExtensionStore } from './ExtensionStore';

console.log('BrowsEZ: Modern background script loaded');

// Get the store instance
const store = ExtensionStore.getInstance();

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
    
    console.log(`Successfully injected content scripts to tab ${tabId}`);
    return true;
  } catch (err) {
    console.log(`Error injecting content scripts to tab ${tabId}:`, err);
    return false;
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
    const response = await TypedMessenger.send(message.action, message, 'background', 'content');
    return { success: response.success, response: response.data, error: response.error };
  } catch (error) {
    // Retry with injection
    const injected = await injectContentScriptsToTab(tabId);
    if (injected) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        const retryResponse = await TypedMessenger.send(message.action, message, 'background', 'content');
        return { success: retryResponse.success, response: retryResponse.data, error: retryResponse.error };
      } catch (retryError) {
        return { success: false, error: 'Failed after injection retry' };
      }
    }
    return { success: false, error: 'Failed to inject content scripts' };
  }
}

async function getOrInitializeTabState(tabId: number, tabUrl: string): Promise<TabState> {
  let tabState = store.tabStates[tabId];
  
  if (tabState) {
    return tabState;
  }

  console.log(`Background: No state for tab ${tabId}, initializing.`);
  const isActive = tabUrl ? isDomainActive(tabUrl) : false;

  // Initialize tab state in store
  store.initializeTabState(tabId); // This creates a default TabState
  // Now update it with available info
  store.updateTabState.updateBasicInfo(tabId, { isActive, url: tabUrl }); 
  
  tabState = store.tabStates[tabId];

  if (isActive && tabState.htmlProcessingStatus === 'not_sent') {
    console.log(`Background: Tab ${tabId} is active, requesting HTML.`);
    sendMessageToTab(tabId, { action: "sendHTML" }); 
  }
  
  return tabState;
}

async function sendHTMLToServer(html: string, tabId: number): Promise<any> {
  try {
    store.updateTabState.updateHTMLProcessingStatus(tabId, 'processing');

    const serverData = await apiClient.sendHTML(html, tabId);
    
    if (serverData.status === 'success' || serverData.processed) {
      store.updateTabState.updateHTMLProcessingStatus(tabId, 'ready');
      store.updateTabState.updateBasicInfo(tabId, { lastProcessedHTML: new Date().toISOString() });
    } else {
      store.updateTabState.updateHTMLProcessingStatus(tabId, 'error');
    }
    
    return serverData;
  } catch (error: any) {
    console.error('Error sending HTML to server:', error);
    store.updateTabState.updateHTMLProcessingStatus(tabId, 'error');
    throw error;
  }
}

async function searchToServer(searchString: string, tabId: number, useLlmFiltering = true): Promise<any> {
  try {
    store.updateTabState.updateSearchState(tabId, { searchStatus: 'searching' });
    const serverData = await apiClient.search(searchString, tabId, useLlmFiltering);
    
    const currentState = store.tabStates[tabId];
    if (currentState) {
      const existingConversation = (currentState.searchState?.conversation || []).filter(
        (msg: any) => !(msg.role === 'system' && msg.content === 'Searching...')
      );
      
      const searchResults = serverData.searchResults?.metadatas?.[0] ?? [];
      const totalResults = searchResults.length;

      store.updateTabState.updateSearchState(tabId, {
        lastSearch: searchString,
        currentPosition: totalResults > 0 ? 1 : 0,
        totalResults: totalResults,
        searchStatus: 'showing_results',
        searchResults: searchResults, 
        navigationLinks: serverData.navigationLinks || [], 
        llmAnswer: serverData.llmAnswer || '', 
        conversation: existingConversation
      });

      // Auto-highlight first result
      const updatedState = store.tabStates[tabId];
      if (updatedState?.searchState.totalResults > 0 && updatedState.searchState.searchResults.length > 0) {
        const firstResultElement = updatedState.searchState.searchResults[0];
        if (firstResultElement) {
          const isLink = firstResultElement.tag === 'a' || firstResultElement.attributes?.href || (firstResultElement.attributes && 'href' in firstResultElement.attributes);
          console.log(`Background: Auto-highlighting first search result for tab ${tabId}:`, firstResultElement);
          
          const highlightResponse = await sendMessageToTab(tabId, {
            action: "highlightElement",
            element: firstResultElement,
            isLink: isLink
          });
          
          if (highlightResponse && highlightResponse.success) {
            console.log(`Background: Successfully auto-highlighted first result for tab ${tabId}`);
          } else {
            console.warn(`Background: Failed to auto-highlight first result for tab ${tabId}. Error: ${highlightResponse?.error}`);
          }
        }
      }
    }
    
    await TypedMessenger.send('SEARCH_COMPLETE', { message: serverData.message, tabId: tabId }, 'background', 'sidebar');
    
    console.log('Search results stored in tab state for tab:', tabId);
    return serverData;
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      // Try to get HTML and retry
      const currentTabState = store.tabStates[tabId];
      if (currentTabState && currentTabState.url) {
         const resp = await chrome.tabs.sendMessage(tabId, { action: "getPageHTML" });
          if (resp && resp.html) {
            await sendHTMLToServer(resp.html, tabId);
            return searchToServer(searchString, tabId, useLlmFiltering);
          }
      } else {
        console.warn(`Background: Cannot retry search for tab ${tabId} due to missing URL in state.`);
      }
    }
    
    console.error('Error searching on server:', error);
    
    try {
      const currentState = store.tabStates[tabId];
      if (currentState && currentState.searchState) {
        const errorConversation = (currentState.searchState.conversation || []).filter(
          (msg: any) => !(msg.role === 'system' && msg.content === 'Searching...')
        );
        errorConversation.push({
          role: 'system',
          content: `Search failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });

        store.updateTabState.updateSearchState(tabId, {
          searchStatus: 'error',
          conversation: errorConversation,
        });
      }
      
      await TypedMessenger.send('UPDATE_STATUS', { tabId: tabId, status: 'error' }, 'background', 'sidebar');
    } catch (stateError) {
      console.error('Error updating tab state after search error:', stateError);
    }
    
    throw error;
  }
}

function addActiveDomain(domain: string): void {
  store.addActiveDomain(domain);
  
  // Persist to chrome.storage for persistence across sessions
  chrome.storage.local.set({ activeDomains: store.activeDomains });
}

function removeActiveDomain(domain: string): void {
  store.removeActiveDomain(domain);
  
  // Persist to chrome.storage
  chrome.storage.local.set({ activeDomains: store.activeDomains });
  
  // Update all tabs for this domain
  chrome.tabs.query({}, async (tabsFromQuery) => { // Renamed to avoid conflict
    for (const tab of tabsFromQuery) { // Use the renamed variable
      if (tab.url && tab.id) {
        try {
          const tabDomain = new URL(tab.url).hostname;
          if (tabDomain === domain || (domain !== "" && tabDomain.includes(domain))) {
            const currentTabState = store.tabStates[tab.id];
            if (currentTabState && currentTabState.isActive) {
              store.updateTabState.updateBasicInfo(tab.id, { isActive: false });
              store.updateTabState.updateSearchState(tab.id, {
                lastSearch: null,
                currentPosition: 0,
                totalResults: 0,
                searchStatus: 'idle',
                searchResults: [],
                llmAnswer: '',
                navigationLinks: [],
                conversation: []
              });
              store.updateTabState.updateHTMLProcessingStatus(tab.id, 'not_sent');
              await sendMessageToTab(tab.id, { action: "removeHighlights" });
            }
          }
        } catch (e) { 
          console.error(`Error processing tab ${tab.id} in removeActiveDomain:`, e); 
        }
      }
    }
  });
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
chrome.runtime.onInstalled.addListener(async () => {
  chrome.storage.local.get('activeDomains', data => {
    const domains = data.activeDomains || [];
    // Initialize store with persisted domains
    domains.forEach((domain: string) => store.addActiveDomain(domain));
    
    if (!data.activeDomains) {
      chrome.storage.local.set({ activeDomains: [] });
    }
    injectContentScriptsToAllTabs();
  });
  
  // Initialize session with API client
  try {
    const sessionData = await apiClient.initializeSession();
    if (sessionData.sessionId) {
      store.setSessionId(sessionData.sessionId);
    }
  } catch (error) {
    console.error('Failed to initialize session on install:', error);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.storage.local.get('activeDomains', data => {
    const domains = data.activeDomains || [];
    // Initialize store with persisted domains
    domains.forEach((domain: string) => store.addActiveDomain(domain));
    
    if (!data.activeDomains) {
      chrome.storage.local.set({ activeDomains: [] });
    }
    injectContentScriptsToAllTabs(); 
  });
  
  // Initialize session with API client
  try {
    const sessionData = await apiClient.initializeSession();
    if (sessionData.sessionId) {
      store.setSessionId(sessionData.sessionId);
    }
  } catch (error) {
    console.error('Failed to initialize session on startup:', error);
  }
});

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
    if (tab && tab.id && tab.url) {
      store.setCurrentTabId(tab.id);
      await getOrInitializeTabState(tab.id, tab.url);
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
    if (tab && tab.id && tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https://'))) {
      console.log("Background: Window focused, processing active tab:", tab.id);
      store.setCurrentTabId(tab.id);
      await getOrInitializeTabState(tab.id, tab.url);
    } else {
       // store.setCurrentTabId(null); // Optionally clear if no suitable tab found
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
      store.setCurrentTabId(tab.id);
      const tabState = await getOrInitializeTabState(tab.id, tab.url);
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

TypedMessenger.onMessage('PERFORM_SEARCH', async (payload, sender) => {
  const currentTabId = store.currentTabId; // Use currentTabId from store
  if (!currentTabId) { 
    return { success: false, error: "No active tab ID in store" };
  }
  const currentTabStateFromStore = store.tabStates[currentTabId];
  if (!currentTabStateFromStore || !currentTabStateFromStore.url) {
     return { success: false, error: "No active tab state or URL in store" };
  }

  if (!isDomainActive(currentTabStateFromStore.url)) {
    return { success: false, error: "Extension not active for this domain" };
  }

  try {
    if (!currentTabStateFromStore.isActive) {
      return { success: false, error: "Extension not active for this tab" };
    }

    const userMessage: ConversationMessage = { 
      role: 'user', 
      content: payload.searchString, 
      timestamp: new Date().toISOString() 
    };
    const systemMessage: ConversationMessage = { 
      role: 'system', 
      content: 'Searching...', 
      timestamp: new Date().toISOString() 
    };
    
    let updatedConversation = (currentTabStateFromStore.searchState.conversation || [])
      .filter((msg: any) => msg.role !== 'navigation' && 
                     !(msg.role === 'system' && msg.content === 'No relevant results found.') &&
                     !(msg.role === 'system' && msg.content === 'Searching...'));
    updatedConversation.push(userMessage, systemMessage);

    store.updateTabState.updateSearchState(currentTabId, {
      lastSearch: payload.searchString,
      currentPosition: 0,
      totalResults: 0,
      searchStatus: 'searching',
      conversation: updatedConversation,
      llmAnswer: '', 
      searchResults: [],
      navigationLinks: []
    });

    await searchToServer(payload.searchString, currentTabId, payload.searchType === 'smart');
    return { success: true };
  } catch (e: any) {
    console.error("Error in PERFORM_SEARCH handler:", e);
    return { success: false, error: e.message };
  }
});

TypedMessenger.onMessage('TOGGLE_ACTIVATION', async (payload, sender) => {
  const currentTabId = store.currentTabId;
  if (!currentTabId) {
    return { success: false, error: "No active tab ID in store for toggleActivation" };
  }
  const currentTabStateFromStore = store.tabStates[currentTabId];
   if (!currentTabStateFromStore || !currentTabStateFromStore.url) { // Check for URL
    return { success: false, error: "No active tab state or URL in store for toggleActivation" };
  }

  try {
    const newIsActive = !currentTabStateFromStore.isActive;
    const domain = new URL(currentTabStateFromStore.url).hostname; // Use URL from state

    if (newIsActive) {
      store.updateTabState.updateBasicInfo(currentTabId, { isActive: true });
      store.updateTabState.updateHTMLProcessingStatus(currentTabId, 'not_sent');
      addActiveDomain(domain);
      await sendMessageToTab(currentTabId, { action: "sendHTML" }); 
    } else {
      store.updateTabState.updateBasicInfo(currentTabId, { isActive: false });
      store.updateTabState.updateSearchState(currentTabId, {
        lastSearch: null,
        currentPosition: 0,
        totalResults: 0,
        searchStatus: 'idle',
        searchResults: [],
        llmAnswer: '',
        navigationLinks: [],
        conversation: []
      });
      store.updateTabState.updateHTMLProcessingStatus(currentTabId, 'not_sent');
      removeActiveDomain(domain);
      await sendMessageToTab(currentTabId, { action: "removeHighlights" });
    }
    
    return { success: true, data: { isActive: newIsActive } };
  } catch (e: any) {
    console.error("Error in TOGGLE_ACTIVATION:", e);
    return { success: false, error: e.message };
  }
});

TypedMessenger.onMessage('CLEAR_CHAT', async (payload, sender) => {
  const currentTabId = store.currentTabId;
  if (!currentTabId) {
    return { success: false, error: "No active tab ID in store for clearChat" };
  }
  try {
    const currentState = store.tabStates[currentTabId];
    if (currentState && currentState.searchState) {
      store.updateTabState.updateSearchState(currentTabId, {
        lastSearch: null,
        currentPosition: 0,
        totalResults: 0,
        searchStatus: 'idle',
        searchResults: [],
        llmAnswer: '',
        navigationLinks: [],
        conversation: []
      });

      await sendMessageToTab(currentTabId, { action: "removeHighlights" });
      return { success: true };
    } else {
      return { success: false, error: "No current state to clear" };
    }
  } catch (e: any) {
    console.error("Error in CLEAR_CHAT:", e);
    return { success: false, error: e.message };
  }
});

TypedMessenger.onMessage('NAVIGATE', async (payload, sender) => {
  const currentTabId = store.currentTabId;
  if (!currentTabId) {
    return { success: false, error: "No active tab ID in store for navigation" };
  }
  try {
    const currentState = store.tabStates[currentTabId];

    if (!currentState || !currentState.searchState || !currentState.searchState.searchResults || currentState.searchState.totalResults === 0) {
      console.warn("Navigate: No valid search state or results.");
      return { success: false, error: "No results to navigate" };
    }

    const { searchResults, currentPosition, totalResults } = currentState.searchState;
    let newPosition = currentPosition;

    if (payload.direction === 'next' && currentPosition < totalResults) {
      newPosition = currentPosition + 1;
    } else if (payload.direction === 'prev' && currentPosition > 1) {
      newPosition = currentPosition - 1;
    } else {
      return { success: false, error: "Navigation limit reached" };
    }

    const elementToHighlight = searchResults[newPosition - 1];
    if (!elementToHighlight) {
      console.error(`Navigate: No search result at new position ${newPosition}`);
      return { success: false, error: "Element not found at position" };
    }

    const isLink = elementToHighlight.tag === 'a' || elementToHighlight.attributes?.href || (elementToHighlight.attributes && 'href' in elementToHighlight.attributes);
    
    const highlightResponse = await sendMessageToTab(currentTabId, {
      action: "highlightElement",
      element: elementToHighlight,
      isLink: isLink
    });

    if (highlightResponse && highlightResponse.success) {
      store.updateSearchPosition(currentTabId, newPosition);
      return { success: true };
    } else {
      console.error("Navigate: Failed to highlight element on content script.", highlightResponse?.error);
      return { success: false, error: highlightResponse?.error || "Failed to highlight" };
    }
  } catch (e: any) {
    console.error("Error in NAVIGATE action:", e);
    return { success: false, error: e.message };
  }
});

TypedMessenger.onMessage('CLEANUP_SESSION', async (payload, sender) => {
  if (payload.sessionId) {
    await apiClient.cleanupSession(payload.sessionId);
  }
  return { success: true };
});

// Legacy message handling for compatibility
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   // Handle legacy messages that haven't been migrated yet
//   if (request.action === "sendHTML") {
//     (async () => {
//       const tabIdToUse = sender.tab?.id ?? request.tabId; // Prefer sender.tab.id
//       const urlToUse = sender.tab?.url ?? request.url; // Prefer sender.tab.url
//       const titleToUse = sender.tab?.title; // Get title if available

//       if (!tabIdToUse) {
//         sendResponse({ error: "tabId is missing for sendHTML" });
//         return;
//       }
//       if (!urlToUse || !isDomainActive(urlToUse)) { // Check urlToUse directly
//         sendResponse({ error: "Domain not active for sendHTML or URL missing" });
//         return;
//       }
      
//       try {
//         // Ensure tab state is initialized with URL and title if available
//         let tabState = store.tabStates[tabIdToUse];
//         if (!tabState) {
//           await getOrInitializeTabState(tabIdToUse, urlToUse);
//         } else if ((urlToUse && tabState.url !== urlToUse) || (titleToUse && tabState.title !== titleToUse)) {
//           store.updateTabState.updateBasicInfo(tabIdToUse, { url: urlToUse, title: titleToUse });
//         }
        
//         store.updateTabState.updateBasicInfo(tabIdToUse, { isActive: true });

//         await sendHTMLToServer(request.html, tabIdToUse);
//         sendResponse({success: true});
//       } catch (e: any) {
//         sendResponse({ error: e.message });
//       }
//     })();
//     return true;
//   }

//   if (request.action === "getTabId") {
//     if (sender.tab && sender.tab.id) { // Check sender.tab.id directly
//       sendResponse(sender.tab.id);
//     } else {
//       (async () => {
//         const tab = await getActiveTab();
//         sendResponse(tab ? tab.id : null);
//       })();
//       return true; // Keep true for async response
//     }
//     return false; // Explicitly return false if not async
//   }

//   return false; // Default to false if no action matched
// });

console.log('BrowsEZ: Modern background script fully initialized'); 