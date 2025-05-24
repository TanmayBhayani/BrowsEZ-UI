// Import the type system
import {
  MessageActions,
  ProcessingStatus,
  SearchStatus,
  MessageRoles,
  createDefaultSearchState,
  createDefaultTabState,
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createNavigationMessage,
  createBackgroundToUIMessage
} from './sidebar_ui/src/utils/typesShared.js';

// htmlProcessingStatus: 'not_sent', 'processing', 'ready', 'error'
// searchStatus: 'idle', 'searching', 'showing_results', 'error'
// Store active domains locally as an Array for storage compatibility
let activeDomains = [];

// Use the type system to create the default tab state
let defaultTabState = createDefaultTabState();

// Helper function no longer needed - conversation building is done in the React app

// Check if current domain is active
function isDomainActive(url) {
    if (!url) return false;
    try {
      const domain = new URL(url).hostname;
      // Check if domain matches any active domain or is included in any active domain
      return activeDomains.some(activeDomain => 
        domain === activeDomain || 
        (activeDomain !== "" && domain.includes(activeDomain))
      );
    } catch (e) {
      return false;
    }
}

// Function to programmatically inject content scripts to a tab
async function injectContentScriptsToTab(tabId) {
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

// Function to inject content scripts to all relevant tabs
async function injectContentScriptsToAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      // Only inject to http/https URLs, not to chrome:// pages etc.
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        await injectContentScriptsToTab(tab.id);
      }
    }
  } catch (err) {
    console.error('Error injecting content scripts to tabs:', err);
  }
}

// Improved function to send messages to tabs with error handling
function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        // If the content script isn't ready, inject it and try again
        injectContentScriptsToTab(tabId).then(success => {
          if (success) {
            // Try sending the message again after a delay
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  resolve({success: false, error: chrome.runtime.lastError.message});
                } else {
                  resolve({success: true, response: retryResponse});
                }
              });
            }, 500);
          } else {
            resolve({success: false, error: 'Failed to inject content scripts'});
          }
        });
      } else {
        resolve({success: true, response});
      }
    });
  });
}

// Function to get or initialize state for a tab
async function getOrInitializeTabState(tabId, tabUrl) {
  const key = `tab_${tabId}_state`;
  const data = await chrome.storage.session.get(key);
  let tabState = data[key];

  if (tabState) {
    tabState.tabId = tabId; // Ensure tabId is present
    // Ensure searchState and conversation are well-defined
    if (!tabState.searchState) tabState.searchState = JSON.parse(JSON.stringify(defaultTabState.searchState));
    if (!tabState.searchState.conversation) tabState.searchState.conversation = [];
    tabState.searchState.llmAnswer = tabState.searchState.llmAnswer || '';
    tabState.searchState.searchResults = tabState.searchState.searchResults || [];
    tabState.searchState.navigationLinks = tabState.searchState.navigationLinks || [];
    // Conversation building is now handled in the React app
    // Save it back if we made changes like adding tabId or fixing structure, to ensure consistency
    await chrome.storage.session.set({ [key]: tabState });
    return tabState;
  }

  console.log(`Background: No state for tab ${tabId}, initializing.`);
  const domain = new URL(tabUrl).hostname;
  const domainData = await chrome.storage.local.get('activeDomains');
  const currentActiveDomains = domainData.activeDomains || [];
  const isActive = currentActiveDomains.some(activeDomain =>
    domain === activeDomain || (activeDomain !== "" && domain.includes(activeDomain))
  );

  const newTabState = {
    ...JSON.parse(JSON.stringify(defaultTabState)),
    tabId: tabId, // Add tabId here
    isActive: isActive,
    searchState: {
        ...JSON.parse(JSON.stringify(defaultTabState.searchState)),
        conversation: []
    }
  };
  
  // Conversation building is now handled in the React app
  await chrome.storage.session.set({ [key]: newTabState });

  if (isActive && newTabState.htmlProcessingStatus === 'not_sent') {
    console.log(`Background: Tab ${tabId} is active, requesting HTML.`);
    sendMessageToTab(tabId, { action: "sendHTML" }); 
  }
  return newTabState;
}

// Helper to send state updates to the UI
function sendStateUpdateToUI(tabId, tabState) {
  // We need to send this message in a way that the specific side panel for tabId can receive it.
  // chrome.runtime.sendMessage will broadcast to all parts of the extension.
  // The UI (App.jsx) will need to check if the tabId in the message matches its own.
  chrome.runtime.sendMessage({
    action: "backgroundInitiatedStateUpdate",
    tabId: tabId,
    tabState: tabState
  });
}

async function initializeAllTabStates() {
  try {
    // After scripts are injected, proceed with tab state initialization
    const tabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
    
    for (const tab of tabs) {
      if (tab.url) {
        try {
          const isActive = isDomainActive(tab.url);
          
          // Create default state for the tab
          const defaultState = defaultTabState;
          defaultState.isActive = isActive;
          
          // Store the default state
          chrome.storage.session.set({ [`tab_${tab.id}_state`]: defaultState });
        } catch (e) {
          console.error("Error initializing tab state:", e);
        }
      }
    }
    await injectContentScriptsToAllTabs();
  } catch (error) {
    console.error("Error in initializeAllTabStates:", error);
  }
}

// Initialize session and load domains when extension starts
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('activeDomains', data => {
    activeDomains = data.activeDomains || [];
    if (!data.activeDomains) {
      chrome.storage.local.set({ activeDomains: [] });
    }
    
    // After loading active domains, initialize all tab states
    initializeAllTabStates();
  });
  initializeSession();
  cleanupOrphanedTabRecords();
});

// Initialize session when browser starts
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('activeDomains', data => {
    activeDomains = data.activeDomains || [];
    if (!data.activeDomains) {
      chrome.storage.local.set({ activeDomains: [] });
    }
    initializeAllTabStates(); 
  });
  initializeSession();
  cleanupOrphanedTabRecords();
});

// Listen for extension icon clicks to open the side panel
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Clean up tab data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const key = `tab_${tabId}_state`;
  chrome.storage.session.remove(key, () => {
    if (chrome.runtime.lastError) {
      console.error(`Error removing ${key}:`, chrome.runtime.lastError);
    } else {
      console.log(`Cleaned up data for tab ${tabId}`);
    }
  });
});

async function initializeSession(retryCount = 0) {
    try {
        const response = await fetch('https://find-production.up.railway.app/initialize_session', {
            method: 'POST',
            credentials: 'include', 
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Log response details
        console.log('Response headers:', response.headers);
        const data = await response.json();
        console.log('Session initialized:', data);
      
        // Check all cookies
        const cookies = await chrome.cookies.getAll({
            domain: "find-production.up.railway.app"
        });
        console.log('All cookies:', cookies);
        return data;
    } catch (error) {
        console.error('Session initialization failed:', error);
        if(retryCount < 3) {
            console.log('Retrying session initialization...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            return initializeSession(retryCount+1);
        }
        return Promise.reject(error);
    }
}

async function sendHTMLToServer(html, tabId) {
  const key = `tab_${tabId}_state`;
  try {
    let data = await chrome.storage.session.get(key);
    let currentState = data[key] || JSON.parse(JSON.stringify(defaultTabState));
    currentState.tabId = tabId;
      currentState.htmlProcessingStatus = 'processing';
    await chrome.storage.session.set({ [key]: currentState });
    sendStateUpdateToUI(tabId, currentState); // Update UI

    const response = await fetch('https://find-production.up.railway.app/receive_html', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html: html,
        tabId: tabId
      })
    });
    
    if (response.status === 401) {
      console.log('Unauthorized');
      await initializeSession();
      return sendHTMLToServer(html, tabId);
    }
    
    const serverData = await response.json();
    console.log('HTML sent to server:', serverData);
    
    data = await chrome.storage.session.get(key); // Get fresh state
    currentState = data[key];
    if (response.ok) {
      currentState.htmlProcessingStatus = 'ready';
      currentState.lastProcessedHTML = new Date().toISOString();
    } else {
        currentState.htmlProcessingStatus = 'error';
    }
    await chrome.storage.session.set({ [key]: currentState });
    sendStateUpdateToUI(tabId, currentState); // Update UI
    
    return serverData;
  } catch (error) {
    if (error.message === 'Unauthorized') {
      await initializeSession();
      return sendHTMLToServer(html, tabId);
    } else {
      // Handle other errors
      console.error('Error sending HTML to server:', error);
      
      // Update state to error
      data = await chrome.storage.session.get(key);
      currentState = data[key] || JSON.parse(JSON.stringify(defaultTabState));
      currentState.tabId = tabId;
        currentState.htmlProcessingStatus = 'error';
      await chrome.storage.session.set({ [key]: currentState });
      sendStateUpdateToUI(tabId, currentState); // Update UI on error too
    }
  }
}

async function searchToServer(searchString, tabId, useLlmFiltering = true) {
  const key = `tab_${tabId}_state`;
  const searchParams = new URLSearchParams({
    searchString: searchString,
    useLlmFiltering: useLlmFiltering.toString()
  });
  
  try {
    const response = await fetch(`https://find-production.up.railway.app/search?${searchParams.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'tabId': tabId.toString()
      }
    });
    
    if (response.status === 401 || response.status === 404) {
      throw new Error('Unauthorized');
    }
    
    const serverData = await response.json();
    console.log("Search results received from server:", serverData);  // Debug log
    
    let data = await chrome.storage.session.get(key);
    let currentState = data[key] || JSON.parse(JSON.stringify(defaultTabState));
    currentState.tabId = tabId;
    
    const existingConversation = (currentState.searchState?.conversation || []).filter(
        (msg) => !(msg.role === 'system' && msg.content === 'Searching...')
      );
    
    const updatedSearchState = {
        ...currentState.searchState,
        lastSearch: searchString,
      currentPosition: (serverData.searchResults?.metadatas?.[0]?.length ?? 0) > 0 ? 1 : 0,
      totalResults: serverData.searchResults?.metadatas?.[0]?.length ?? 0,
        searchStatus: 'showing_results',
      searchResults: serverData.searchResults?.metadatas?.[0] ?? [], 
      navigationLinks: serverData.navigationLinks || [], 
      llmAnswer: serverData.llmAnswer || '', 
      conversation: existingConversation
    };

    // Conversation building is now handled in the React app
    currentState.searchState = updatedSearchState;
    
    await chrome.storage.session.set({[key]: currentState});
    sendStateUpdateToUI(tabId, currentState); // Update UI first

    // Automatically highlight the first result if available
    if (currentState.searchState.totalResults > 0 && currentState.searchState.searchResults.length > 0) {
      const firstResultElement = currentState.searchState.searchResults[0];
      if (firstResultElement) {
        const isLink = firstResultElement.tag === 'a' || firstResultElement.attributes?.href || (firstResultElement.attributes && 'href' in firstResultElement.attributes);
        console.log(`Background: Auto-highlighting first search result for tab ${tabId}:`, firstResultElement);
        // No need to await this, can happen in parallel with UI update
        sendMessageToTab(tabId, {
          action: "highlightElement",
          element: firstResultElement,
          isLink: isLink
        }).then(highlightResponse => {
          if (highlightResponse && highlightResponse.success) {
            console.log(`Background: Successfully auto-highlighted first result for tab ${tabId}`);
          } else {
            console.warn(`Background: Failed to auto-highlight first result for tab ${tabId}. Error: ${highlightResponse?.error}`);
          }
        });
      }
    }
    
    chrome.runtime.sendMessage({
      action: "searchComplete",
      message: serverData.message, 
      tabId: tabId
    });
    
    console.log('Search results stored in tab state for tab:', tabId);
    return serverData;
  } catch (error) {
    if (error.message === 'Unauthorized') {
      await initializeSession();
      const resp = await chrome.tabs.sendMessage(tabId, { action: "getPageHTML" });
      if (resp && resp.html) {
        await sendHTMLToServer(resp.html, tabId);
        return searchToServer(searchString, tabId, useLlmFiltering);
      }
    } else {
      console.error('Error searching on server:', error);
      
      // Update the tab state to indicate search error
      try {
        // Get current tab state
        data = await chrome.storage.session.get(key);
        currentState = data[key] || JSON.parse(JSON.stringify(defaultTabState));
        currentState.tabId = tabId;
        
        // Set search status to error and add error message to conversation
        if (currentState && currentState.searchState) {
          const errorConversation = (currentState.searchState.conversation || []).filter(
            (msg) => !(msg.role === 'system' && msg.content === 'Searching...')
          );
          errorConversation.push({
            role: 'system',
            content: `Search failed: ${error.message}`,
            timestamp: new Date().toISOString()
          });

          currentState.searchState = {
            ...currentState.searchState,
            searchStatus: 'error', // Keep showing results page but with error
            conversation: errorConversation, // Raw conversation data, UI will build display version
          };
          // Conversation building is now handled in the React app
          // For now, direct set is fine to show the error prominently.
          
          // Save updated state
          await chrome.storage.session.set({ [key]: currentState });
          sendStateUpdateToUI(tabId, currentState); // Update UI
        }
        
        // Notify sidebar to update UI (it will pull the error state)
        chrome.runtime.sendMessage({
          action: "updateStatus",
          tabId: tabId
        });
      } catch (stateError) {
        console.error('Error updating tab state after search error:', stateError);
      }
      
      throw error; // Rethrow error for potential caller handling
    }
  }
}

function addActiveDomain(domain) {
  chrome.storage.local.get('activeDomains', data => {
    let domains = data.activeDomains || [];
    
    // Only add if not already in the array
    if (!domains.includes(domain)) {
      domains.push(domain);
      chrome.storage.local.set({ activeDomains: domains });
      // Update the local array
      activeDomains = domains;
    }
  });
}

function removeActiveDomain(domain) {
  chrome.storage.local.get('activeDomains', data => {
    if (data.activeDomains) {
      const domains = data.activeDomains.filter(d => d !== domain);
      chrome.storage.local.set({ activeDomains: domains });
      activeDomains = domains;
      
      chrome.tabs.query({}, async (tabs) => { // Make the outer callback async
        for (const tab of tabs) { // Use for...of loop for async/await
          if (tab.url && tab.id) {
            try {
              const tabDomain = new URL(tab.url).hostname;
              if (tabDomain === domain || (domain !== "" && tabDomain.includes(domain))) {
                const key = `tab_${tab.id}_state`;
                const tabStateData = await chrome.storage.session.get(key);
                let currentTabState = tabStateData[key];
                if (currentTabState && currentTabState.isActive) {
                  currentTabState.isActive = false;
                  currentTabState.tabId = tab.id; 
                  currentTabState.searchState = { ...JSON.parse(JSON.stringify(defaultTabState.searchState)), conversation: [] };
                  currentTabState.htmlProcessingStatus = 'not_sent';
                  // Conversation building is now handled in the React app
                  await chrome.storage.session.set({[key]: currentTabState});
                  sendStateUpdateToUI(tab.id, currentTabState);
                  await sendMessageToTab(tab.id, { action: "removeHighlights" }); // ensure sendMessageToTab is awaited if it's async
                }
              }
            } catch (e) { 
              console.error(`Error processing tab ${tab.id} in removeActiveDomain:`, e); 
            }
          }
        }
      });
    }
  });
}

// Function to clean up orphaned tab records
function cleanupOrphanedTabRecords() {
  // Get all keys from storage
  chrome.storage.local.get(null, (items) => {
    // Get all open tabs
    chrome.tabs.query({}, (tabs) => {
      const openTabIds = tabs.map(tab => tab.id);
      
      // Check all storage keys
      Object.keys(items).forEach(key => {
        // If the key matches our tab pattern
        if (key.match(/^tab_\d+_isActive$/)) {
          // Extract the tab ID from the key
          const tabId = parseInt(key.split('_')[1]);
          
          // If this tab ID is not in the list of open tabs, remove it
          if (!openTabIds.includes(tabId)) {
            chrome.storage.local.remove(key, () => {
              if (chrome.runtime.lastError) {
                console.error(`Error removing orphaned record ${key}:`, chrome.runtime.lastError);
              } else {
                console.log(`Cleaned up orphaned record for tab ${tabId}`);
              }
            });
          }
        }
      });
    });
  });
}

// --- Event Listeners for Tab Activation and Window Focus ---
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log("Background: Tab activated:", activeInfo);
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https://'))) {
      const updatedState = await getOrInitializeTabState(tab.id, tab.url);
      sendStateUpdateToUI(tab.id, updatedState); // Send update to UI
    } else {
      console.log("Background: Activated tab is not a valid HTTP/HTTPS URL or no URL, state not processed for UI update via onActivated.");
      // If there's a UI open for this non-http tab, we might want to send it an inactive state.
      // For now, getOrInitialize will set a default inactive state in storage if uiLoadedGetInitialState is called for it.
    }
  } catch (error) {
    console.error("Error in onActivated listener:", error);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log("Background: Window lost focus (no window focused).");
    return; 
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tab && tab.id && tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https://'))) {
      console.log("Background: Window focused, processing active tab:", tab.id);
      const updatedState = await getOrInitializeTabState(tab.id, tab.url);
      sendStateUpdateToUI(tab.id, updatedState); // Send update to UI
    }
  } catch (error) {
    console.error("Background: Error processing focused window's active tab:", error);
  }
});

// --- Message Listener --- 
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  async function getActiveTab() {
    // If the sender is a tab (e.g., content script), use that directly.
    if (sender.tab && sender.tab.id) {
      return sender.tab; 
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      return tabs[0];
    }
    console.error("Background: No active tab could be determined.");
    return null;
  }

  if (request.action === "uiLoadedGetInitialState") {
    (async () => {
      const tab = await getActiveTab(); 
      if (tab && tab.id && tab.url) {
        try {
            const initialState = await getOrInitializeTabState(tab.id, tab.url);
            // initialState already includes tabId and is saved to storage by getOrInitializeTabState
            sendResponse({ success: true, tabState: initialState }); 
        } catch (e) {
            console.error("Error in uiLoadedGetInitialState handling:", e);
            // Send a default/error state back
            const errorState = { ...JSON.parse(JSON.stringify(defaultTabState)), tabId: tab.id, isActive: false, htmlProcessingStatus: 'error' };
            errorState.searchState.conversation = [{role: 'system', content: 'Error initializing extension state.', timestamp: new Date().toISOString()}];
            sendResponse({ success: false, error: e.message, tabState: errorState });
        }
      } else {
        console.error("uiLoadedGetInitialState: Could not get active tab info.");
        const errorStateNoTab = { ...JSON.parse(JSON.stringify(defaultTabState)), tabId: null, isActive: false, htmlProcessingStatus: 'error' };
        errorStateNoTab.searchState.conversation = [{role: 'system', content: 'Could not determine active tab.', timestamp: new Date().toISOString()}];
        sendResponse({ error: "Could not get active tab info for UI initialization.", tabState: errorStateNoTab });
      }
    })();
    return true; // Async response
  }

  if (request.action === "sendHTML") {
    (async () => {
        const tabIdToUse = sender.tab ? sender.tab.id : request.tabId;
        const urlToUse = sender.tab ? sender.tab.url : request.url;

        if (!tabIdToUse) {
          sendResponse({ error: "tabId is missing for sendHTML" });
          return;
        }
        if (!isDomainActive(urlToUse || "")) {
            sendResponse({ error: "Domain not active for sendHTML" });
            return;
        }
        
        try {
            // Initial state update to 'processing'
            const data = await chrome.storage.session.get(`tab_${tabIdToUse}_state`);
            let currentState = data[`tab_${tabIdToUse}_state`] || JSON.parse(JSON.stringify(defaultTabState));
            currentState.tabId = tabIdToUse;
            currentState.isActive = true; 
            currentState.htmlProcessingStatus = 'processing';
            await chrome.storage.session.set({ [`tab_${tabIdToUse}_state`]: currentState });
            sendStateUpdateToUI(tabIdToUse, currentState); // UI update

            await sendHTMLToServer(request.html, tabIdToUse); // This will handle further updates
            sendResponse({success: true});
        } catch (e) {
            sendResponse({ error: e.message });
        }
    })();
    return true;
  }
  
  if (request.action === "performSearch") {
    (async () => {
      const tab = await getActiveTab();
      if (!tab || !tab.id) { sendResponse({ error: "No active tab" }); return; }
      if (!isDomainActive(tab.url)) {
        sendResponse({ error: "Extension not active for this domain" });
        return;
      }

      try {
        let data = await chrome.storage.session.get(`tab_${tab.id}_state`);
        let currentState = data[`tab_${tab.id}_state`] || JSON.parse(JSON.stringify(defaultTabState));
        currentState.tabId = tab.id;

        if (!currentState.isActive) {
          sendResponse({ error: "Extension not active for this tab (state)" });
          return;
        }

        const userMessage = { role: 'user', content: request.searchString, timestamp: new Date().toISOString() };
        const systemMessage = { role: 'system', content: 'Searching...', timestamp: new Date().toISOString() };
        
        let updatedConversation = (currentState.searchState.conversation || [])
            .filter(msg => msg.role !== 'navigation' && 
                           !(msg.role === 'system' && msg.content === 'No relevant results found.') &&
                           !(msg.role === 'system' && msg.content === 'Searching...'));
        updatedConversation.push(userMessage, systemMessage);

        currentState.searchState = {
          ...currentState.searchState,
          lastSearch: request.searchString,
          currentPosition: 0,
          totalResults: 0,
          searchStatus: 'searching',
          conversation: updatedConversation,
          llmAnswer: '', 
          searchResults: [],
          navigationLinks: []
        };
        await chrome.storage.session.set({ [`tab_${tab.id}_state`]: currentState });

        // Now call the existing searchToServer function
        await searchToServer(request.searchString, tab.id, request.searchType === 'smart');
        sendResponse({ success: true }); // searchToServer will update state again on completion/error
      } catch (e) {
        console.error("Error in performSearch handler:", e);
        sendResponse({ error: e.message });
        // Ensure state is updated to error if something fails before searchToServer
        if (tab) {
            const errorData = await chrome.storage.session.get(`tab_${tab.id}_state`);
            let errorState = errorData[`tab_${tab.id}_state`];
            if (errorState && errorState.searchState) {
                errorState.searchState.searchStatus = 'error';
                errorState.searchState.conversation = [...errorState.searchState.conversation.filter(m => m.content !== 'Searching...'), {role: 'system', content: `Search initiation failed: ${e.message}`, timestamp: new Date().toISOString()}];
                await chrome.storage.session.set({ [`tab_${tab.id}_state`]: errorState });
            }
        }
      }
    })();
    return true; // Indicates async response
  }
  
  if (request.action === "getTabId") {
    if (sender.tab) {
    sendResponse(sender.tab.id);
    } else {
      // If no sender.tab (e.g. from popup), try to get active tab
      (async () => {
        const tab = await getActiveTab();
        sendResponse(tab ? tab.id : null);
      })();
      return true; // for async response
    }
    return false; // if sender.tab existed, response was synchronous
  }
  
  if (request.action === "addActiveDomain") {
    addActiveDomain(request.domain);
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "removeActiveDomain") {
    removeActiveDomain(request.domain);
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "toggleActivation") {
    (async () => {
      const tab = await getActiveTab();
      if (!tab) {
        sendResponse({ error: "No active tab for toggleActivation" });
        return;
      }

      try {
        let data = await chrome.storage.session.get(`tab_${tab.id}_state`);
        let currentState = data[`tab_${tab.id}_state`] || JSON.parse(JSON.stringify(defaultTabState));
        currentState.tabId = tab.id;
        
        const newIsActive = !currentState.isActive;
        currentState.isActive = newIsActive;
        const domain = new URL(tab.url).hostname;

        if (newIsActive) {
          currentState.htmlProcessingStatus = 'not_sent'; // Reset status on activation
          await chrome.storage.session.set({ [`tab_${tab.id}_state`]: currentState });
          addActiveDomain(domain); // This already updates local activeDomains and chrome.storage.local
          // Request content script to send HTML. Content script will call sendHTML action.
          await sendMessageToTab(tab.id, { action: "sendHTML" }); 
        } else {
          // Reset search state for the tab upon deactivation
          currentState.searchState = {
            ...defaultTabState.searchState,
            conversation: [] // Clear conversation on deactivation
          };
          currentState.htmlProcessingStatus = 'not_sent';
          await chrome.storage.session.set({ [`tab_${tab.id}_state`]: currentState });
          removeActiveDomain(domain); // This updates local activeDomains and chrome.storage.local
          await sendMessageToTab(tab.id, { action: "removeHighlights" });
        }
        sendStateUpdateToUI(tab.id, currentState); // Update UI
        sendResponse({ success: true, isActive: newIsActive });
      } catch (e) {
        console.error("Error in toggleActivation:", e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === "clearChat") {
    (async () => {
      const tab = await getActiveTab();
      if (!tab) {
        sendResponse({ error: "No active tab for clearChat" });
        return;
      }
      try {
        let data = await chrome.storage.session.get(`tab_${tab.id}_state`);
        let currentState = data[`tab_${tab.id}_state`];
        if (currentState && currentState.searchState) {
          currentState.tabId = tab.id;
          currentState.searchState = {
            ...defaultTabState.searchState, // Reset to default search state
            conversation: [] // Explicitly ensure conversation is empty
          };
          // Rebuild conversation if necessary (e.g. to add a system message like "Chat cleared")
          // For now, an empty conversation is fine. UI will update from storage.
          // Conversation building is now handled in the React app

          await chrome.storage.session.set({ [`tab_${tab.id}_state`]: currentState });
          await sendMessageToTab(tab.id, { action: "removeHighlights" });
          sendStateUpdateToUI(tab.id, currentState); // Update UI
          sendResponse({ success: true });
        } else {
          sendResponse({ error: "No current state to clear" });
        }
      } catch (e) {
        console.error("Error in clearChat:", e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === "navigate") {
    (async () => {
      const tab = await getActiveTab();
      if (!tab) {
        sendResponse({ error: "No active tab for navigation" });
        return;
      }
      try {
        const data = await chrome.storage.session.get(`tab_${tab.id}_state`);
        const currentState = data[`tab_${tab.id}_state`];

        if (!currentState || !currentState.searchState || !currentState.searchState.searchResults || currentState.searchState.totalResults === 0) {
          console.warn("Navigate: No valid search state or results.");
          sendResponse({ success: false, message: "No results to navigate" });
          return;
        }

        const { searchResults, currentPosition, totalResults } = currentState.searchState;
        let newPosition = currentPosition;

        if (request.direction === 'next' && currentPosition < totalResults) {
          newPosition = currentPosition + 1;
        } else if (request.direction === 'prev' && currentPosition > 1) {
          newPosition = currentPosition - 1;
        } else {
          sendResponse({ success: false, message: "Navigation limit reached" });
          return; 
        }

        const elementToHighlight = searchResults[newPosition - 1];
        if (!elementToHighlight) {
          console.error(`Navigate: No search result at new position ${newPosition}`);
          sendResponse({ success: false, message: "Element not found at position" });
          return;
        }

        const isLink = elementToHighlight.tag === 'a' || elementToHighlight.attributes?.href || (elementToHighlight.attributes && 'href' in elementToHighlight.attributes);
        
        const highlightResponse = await sendMessageToTab(tab.id, {
          action: "highlightElement",
          element: elementToHighlight,
          isLink: isLink
        });

        if (highlightResponse && highlightResponse.success) {
          // Refetch state to avoid race conditions before updating
          const freshData = await chrome.storage.session.get(`tab_${tab.id}_state`);
          const stateToUpdate = freshData[`tab_${tab.id}_state`];
          if (stateToUpdate && stateToUpdate.searchState) {
            stateToUpdate.tabId = tab.id;
            stateToUpdate.searchState.currentPosition = newPosition;
            // Rebuild conversation with updated navigation message
            // Conversation building is now handled in the React app
            await chrome.storage.session.set({ [`tab_${tab.id}_state`]: stateToUpdate });
            sendStateUpdateToUI(tab.id, stateToUpdate); // Update UI
            sendResponse({ success: true });
          } else {
             throw new Error("State not found after highlight for navigation update");
          }
        } else {
          console.error("Navigate: Failed to highlight element on content script.", highlightResponse?.error);
          sendResponse({ success: false, message: highlightResponse?.error || "Failed to highlight" });
        }
      } catch (e) {
        console.error("Error in navigate action:", e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }
  
  if (request.action === "cleanupSessionOnServer") {
    (async () => {
      if (request.sessionId) {
        try {
          console.log("Background: Received request to cleanup session on server for ID:", request.sessionId);
          const response = await fetch('https://find-production.up.railway.app/cleanup_session', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              // Ensure credentials are sent if your server expects cookies for session cleanup
              credentials: 'include', 
              body: JSON.stringify({ session_id: request.sessionId })
          });
          if (response.ok) {
            console.log("Background: Session cleanup successful on server for ID:", request.sessionId);
            // Optionally, if content script's sessionStorage needs clearing and it couldn't do it:
            // if (sender.tab && sender.tab.id) {
            //   chrome.tabs.sendMessage(sender.tab.id, { action: "clearSessionStorageItem", key: "currentSessionId" });
            // }
            sendResponse({ success: true });
          } else {
            const errorData = await response.text();
            console.error("Background: Session cleanup failed on server for ID:", request.sessionId, response.status, errorData);
            sendResponse({ success: false, error: `Server cleanup failed: ${response.status}` });
          }
        } catch (error) {
          console.error("Background: Error during server session cleanup fetch:", error);
          sendResponse({ success: false, error: error.message });
        }
      } else {
        console.warn("Background: cleanupSessionOnServer called without sessionId.");
        sendResponse({ success: false, error: "No sessionId provided for cleanup." });
      }
    })();
    return true; // Async response
  }
  
  console.log("Background: No handler matched for action:", request.action, "or handler was synchronous and didn't return.");
  return false; // If action is not recognized or was synchronous without returning true
});