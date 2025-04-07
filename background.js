// htmlProcessingStatus: 'not_sent', 'processing', 'ready', 'error'
// searchStatus: 'idle', 'searching', 'showing_results', 'error'
// Store active domains locally as an Array for storage compatibility
let activeDomains = [];

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

// Initialize session and load domains when extension starts
chrome.runtime.onInstalled.addListener(() => {
  //First check if we have active domains in chrome storage, if not set chrome storage to empty array
  chrome.storage.local.get('activeDomains', data => {
    if (data.activeDomains) {
      activeDomains = data.activeDomains;
    } 
    else {
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
    if (data.activeDomains) {
      activeDomains = data.activeDomains;
    } 
    else {
      chrome.storage.local.set({ activeDomains: [] });
    }
    
    // After loading active domains, initialize all tab states
    initializeAllTabStates();
  });
  
  initializeSession();
  cleanupOrphanedTabRecords();
});

// Function to initialize all tab states based on active domains
function initializeAllTabStates() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url) {
        try {
          const isActive = isDomainActive(tab.url);
          
          // Create default state for the tab
          const defaultState = {
            isActive: isActive,
            htmlProcessingStatus: 'not_sent',
            lastProcessedHTML: null,
            searchState: {
              lastSearch: null,
              currentPosition: 0,
              totalResults: 0,
              searchStatus: 'idle'
            }
          };
          
          // Store the default state
          chrome.storage.session.set({ [`tab_${tab.id}_state`]: defaultState });
          
          // If domain is active, we should request HTML
          if (isActive) {
            // Give the content script time to initialize
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { action: "sendHTML" })
                .catch(err => console.log(`Could not send message to tab ${tab.id}:`, err));
            }, 1000);
          }
        } catch (e) {
          console.error("Error initializing tab state:", e);
        }
      }
    });
  });
}

// Check each tab when it's updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only process when page is fully loaded (complete) and has a URL
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this domain is active
    const isActive = isDomainActive(tab.url);
    
    // Get current state
    chrome.storage.session.get(`tab_${tabId}_state`, function(data) {
      const currentState = data[`tab_${tabId}_state`] || {
        isActive: false,
        htmlProcessingStatus: 'not_sent',
        searchState : {
          searchStatus: 'idle',
          lastSearch: null,
          currentPosition: 0,
          totalResults: 0
        }
      };
      
      // Update state
      const newState = {
        ...currentState,
        isActive: isActive,
        htmlProcessingStatus: isActive ? 'processing' : 'not_sent'
      };
      
      // Store the updated state
      chrome.storage.session.set({ [`tab_${tabId}_state`]: newState });
      
      // If domain is active, fetch the HTML and send to server
      if (isActive) {
        console.log(`Tab ${tabId} updated with active domain. Fetching HTML...`);
        chrome.tabs.sendMessage(tabId, { action: "getPageHTML" })
          .then(response => {
            if (response && response.html) {
              return sendHTMLToServer(response.html, tabId);
            }
          })
          .catch(error => {
            console.error("Error sending/processing message:", error);
            // Update state to error
            chrome.storage.session.get(`tab_${tabId}_state`, function(data) {
              const currentState = data[`tab_${tabId}_state`];
              currentState.htmlProcessingStatus = 'error';
              chrome.storage.session.set({ [`tab_${tabId}_state`]: currentState });
              chrome.runtime.sendMessage({
                action: "updateHTMLStatus",
                status: 'error',
                tabId: tabId
              });
            });
          });
      }
    });
  }
});

// Clean up tab data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Remove tab-specific data from storage
  chrome.storage.session.remove(`tab_${tabId}_state`, () => {
    if (chrome.runtime.lastError) {
      console.error(`Error removing tab_${tabId}_state:`, chrome.runtime.lastError);
    } else {
      console.log(`Cleaned up data for tab ${tabId}`);
    }
  });
});

async function initializeSession(retryCount = 0) {
    try {
        const response = await fetch('http://127.0.0.1:5000/initialize_session', {
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
            domain: "127.0.0.1"
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
  try {
    // Update state to processing
    chrome.storage.session.get(`tab_${tabId}_state`, function(data) {
      const currentState = data[`tab_${tabId}_state`];
      currentState.htmlProcessingStatus = 'processing';
      chrome.storage.session.set({ [`tab_${tabId}_state`]: currentState });
      chrome.runtime.sendMessage({
        action: "updateHTMLStatus",
        status: 'processing',
        tabId: tabId
      });
    });

    const response = await fetch('http://127.0.0.1:5000/receive_html', {
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
    
    const data = await response.json();
    console.log('HTML sent to server:', data);
    
    // Update state to ready
    chrome.storage.session.get(`tab_${tabId}_state`, function(data) {
      const currentState = data[`tab_${tabId}_state`];
      currentState.htmlProcessingStatus = 'ready';
      currentState.lastProcessedHTML = new Date().toISOString();
      chrome.storage.session.set({ [`tab_${tabId}_state`]: currentState });
      chrome.runtime.sendMessage({
        action: "updateHTMLStatus",
        status: 'ready',
        timestamp: currentState.lastProcessedHTML,
        tabId: tabId
      });
    });
    
    return data;
  } catch (error) {
    if (error.message === 'Unauthorized') {
      await initializeSession();
      return sendHTMLToServer(html, tabId);
    } else {
      // Handle other errors
      console.error('Error sending HTML to server:', error);
      
      // Update state to error
      chrome.storage.session.get(`tab_${tabId}_state`, function(data) {
        const currentState = data[`tab_${tabId}_state`];
        currentState.htmlProcessingStatus = 'error';
        chrome.storage.session.set({ [`tab_${tabId}_state`]: currentState });
        chrome.runtime.sendMessage({
          action: "updateHTMLStatus",
          status: 'error',
          tabId: tabId
        });
      });
      
      throw error;
    }
  }
}

async function searchToServer(searchString, tabId, useLlmFiltering = true) {
  const searchParams = new URLSearchParams({
    searchString: searchString,
    useLlmFiltering: useLlmFiltering.toString()
  });
  
  try {
    const response = await fetch(`http://127.0.0.1:5000/search?${searchParams.toString()}`, {
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
    
    const data = await response.json();
    console.log("Search results received from server:", data);  // Debug log
    console.log("Metadata being stored:", data.searchResults.metadatas[0]);  // Debug log
    
    // Update the tab state with search results instead of sending directly to content script
    const stateData = await chrome.storage.session.get(`tab_${tabId}_state`);
    const currentState = stateData[`tab_${tabId}_state`] || {};
    
    const newState = {
      ...currentState,
      searchState: {
        lastSearch: searchString,
        currentPosition: 0, // Reset to 0 as nothing is highlighted yet
        totalResults: data.searchResults.metadatas[0].length,
        searchStatus: 'showing_results',
        searchResults: data.searchResults.metadatas[0] // Store the full search results in tab state
      }
    };
    
    await chrome.storage.session.set({[`tab_${tabId}_state`]: newState});
    
    // Notify popup about the complete search results
    chrome.runtime.sendMessage({
      action: "searchComplete",
      message: data.message,
      tabId: tabId
    });
    
    console.log('Search results stored in tab state for tab:', tabId);
    return data;
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
      throw error;
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
      // Explicitly handle empty string case if needed
      const domains = domain === '' 
        ? data.activeDomains.filter(d => d !== '')
        : data.activeDomains.filter(d => d !== domain);
        
      chrome.storage.local.set({ activeDomains: domains });
      // Update the local array
      activeDomains = domains;
      
      // Find and update all tabs with this domain
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url) {
            try {
              const tabDomain = new URL(tab.url).hostname;
              if (tabDomain === domain || (domain !== "" && tabDomain.includes(domain))) {
                // Update the tab's state to inactive
                chrome.storage.session.get(`tab_${tab.id}_state`, function(data) {
                  const tabState = data[`tab_${tab.id}_state`];
                  if (tabState && tabState.isActive) {
                    tabState.isActive = false;
                    chrome.storage.session.set({[`tab_${tab.id}_state`]: tabState});
                    
                    // Send message to remove highlights in this tab
                    chrome.tabs.sendMessage(tab.id, { action: "removeHighlights" })
                      .catch(err => console.log(`Could not send message to tab ${tab.id}:`, err));
                      
                    // Broadcast state change to all tabs
                    chrome.runtime.sendMessage({
                      action: "stateChanged",
                      tabId: tab.id
                    });
                  }
                });
              }
            } catch (e) {
              console.error("Error processing URL:", e);
            }
          }
        });
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

// Message listener for MV3
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendHTML") {
    if (isDomainActive(sender.tab.url)) {
      sendHTMLToServer(request.html, sender.tab.id)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ error: error.message }));
      return true; // Required for async response
    }
    return false;
  }
  
  if (request.action === "find") {
    if (isDomainActive(request.tabUrl)) {
      // Default to true if not specified
      const useLlmFiltering = request.useLlmFiltering !== undefined ? request.useLlmFiltering : true;
      searchToServer(request.searchString, request.tabId, useLlmFiltering)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }
    return false;
  }
  
  if (request.action === "getTabId") {
    sendResponse(sender.tab.id);
    return true;
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
  
  return false;
});