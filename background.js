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
  });
  initializeSession();
  cleanupOrphanedTabRecords();
});

// Check each tab when it's updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // First check if we already have a setting for this tab
    chrome.storage.local.get(`tab_${tabId}_isActive`, data => {
      // If no explicit setting exists yet for this tab
      if (data[`tab_${tabId}_isActive`] === undefined) {
        const isActive = isDomainActive(tab.url);
        chrome.storage.local.set({ [`tab_${tabId}_isActive`]: isActive });
        
        // If domain is active, fetch the HTML
        if (isActive) {
          chrome.tabs.sendMessage(tabId, { action: "getPageHTML" })
            .then(response => {
              if (response && response.html) {
                sendHTMLToServer(response.html, tabId);
              }
            })
            .catch(error => console.error("Error sending message:", error));
        }
      }
    });
  }
});

// Clean up tab data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Remove tab-specific data from storage
  chrome.storage.local.remove(`tab_${tabId}_isActive`, () => {
    if (chrome.runtime.lastError) {
      console.error(`Error removing tab_${tabId}_isActive:`, chrome.runtime.lastError);
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
    return data;
  } catch (error) {
    if (error.message === 'Unauthorized') {
      await initializeSession();
      return sendHTMLToServer(html, tabId);
    } else {
      // Handle other errors
      console.error('Error sending HTML to server:', error);
      throw error;
    }
  }
}

async function searchToServer(searchString, tabId) {
  const searchParams = new URLSearchParams({
    searchString: searchString
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
    // Send search results to content script
    await chrome.tabs.sendMessage(tabId, {
      action: "highlightElements",
      elements: data.searchResults.metadatas[0]
    });
    console.log('Message sent with tabId:', tabId);
    return data;
  } catch (error) {
    if (error.message === 'Unauthorized') {
      await initializeSession();
      const resp = await chrome.tabs.sendMessage(tabId, { action: "getPageHTML" });
      if (resp && resp.html) {
        await sendHTMLToServer(resp.html, tabId);
        return searchToServer(searchString, tabId);
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
      searchToServer(request.searchString, request.tabId)
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