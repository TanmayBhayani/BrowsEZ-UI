// Store active domains locally as a Set for O(1) operations
let activeDomains = new Set();
// Check if current domain is active
function isDomainActive(url) {
    if (!url) return false;
    try {
      const domain = new URL(url).hostname;
      // Modified to work with Set
      return Array.from(activeDomains).some(activeDomain => domain.includes(activeDomain));
    } catch (e) {
      return false;
    }
}

// Initialize session and load domains when extension starts
chrome.runtime.onInstalled.addListener(() => {
  //First check if we have active domains in chrome storage, if not set chrome storage to empty set
  chrome.storage.local.get('activeDomains', data => {
    if (data.activeDomains) {
      activeDomains = data.activeDomains;
    } 
    else {
      chrome.storage.local.set({ activeDomains: new Set() });
    }
  });
  initializeSession()
});

// Initialize session when browser starts
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('activeDomains', data => {
    if (data.activeDomains) {
      activeDomains = data.activeDomains;
    } 
    else {
      chrome.storage.local.set({ activeDomains: new Set() });
    }
  });
  initializeSession()
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
          chrome.tabs.sendMessage(tabId, { action: "getPageHTML" }, response => {
            if (response && response.html) {
              sendHTMLToServer(response.html, tabId);
            }
          });
        }
      }
    });
  }
});

function initializeSession(retryCount = 0) {
    return fetch('http://127.0.0.1:5000/initialize_session', {
        method: 'POST',
        credentials: 'include', 
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        // Log cookies from response
        console.log('Response cookies:', document.cookie);
        console.log('Response headers:', response.headers);
        return response.json();
    })
    .then(data => {
        console.log('Session initialized:', data);
      
        // Check all cookies
        chrome.cookies.getAll({
            domain: "127.0.0.1"
        }, (cookies) => {
            console.log('All cookies:', cookies);
        });
    })
    .catch(error => {
        console.error('Session initialization failed:', error);
        if(retryCount < 3) {
            console.log('Retrying session initialization...');
            setTimeout(initializeSession(retryCount+1), 5000);
        }
        return Promise.reject(error);
    });
}
// Listen for extension reload or browser restart
chrome.runtime.onSuspend.addListener(() => {
  // Optional: Perform cleanup if needed before extension is unloaded
  console.log('Extension being unloaded, session will persist via cookie');
});

function sendHTMLToServer(html, tabId) {
  return fetch('http://127.0.0.1:5000/receive_html', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      html: html,
      tabId: tabId
    })
  })
  .then(response => {
    if (response.status === 401) {
      // throw new Error('Unauthorized');
      console.log('Unauthorized');
      throw new Error('Unauthorized');
    }
    return response.json();
  })
  .then(data => {
    console.log('HTML sent to server:', data);
  })// catch Unauthorized error
  .catch(error => {
    if (error.message === 'Unauthorized') {
      initializeSession();
      sendHTMLToServer(html, tabId);
    }
    else {
      // Handle other errors
      console.error('Error sending HTML to server:', error);
    }
  })
  
}

function searchToServer(searchString, tabId) {
  const searchParams = new URLSearchParams({
    searchString: searchString
  });
  
  return fetch(`http://127.0.0.1:5000/search?${searchParams.toString()}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'tabId': tabId
    }
  })
  .then(response => {
    if (response.status === 401 || response.status === 404) {
      throw new Error('Unauthorized');
    }
    return response.json();
  }).then(data => {
    // Send search results to content script
    chrome.tabs.sendMessage(tabId, {
      action: "highlightElements",
      elements: data.searchResults.metadatas[0]
    }, () => {
      console.log('Message sent with tabId:', tabId);
    });
  })
  .catch(async (error) => {
    if (error.message === 'Unauthorized') {
      await initializeSession();
      const resp = await chrome.tabs.sendMessage(tabId, { action: "getPageHTML" })
      if (resp && resp.html)
      {
        await sendHTMLToServer(resp.html, tabId);
        await searchToServer(searchString, tabId);
      }
    }
    else {
      console.error('Error searching on server:', error);
    }
  });
}

function addActiveDomain(domain) {
  chrome.storage.local.get('activeDomains', data => {
    if (data.activeDomains) {
      data.activeDomains.add(domain);
      chrome.storage.local.set({ activeDomains: data.activeDomains });
    } else {
      chrome.storage.local.set({ activeDomains: new Set([domain]) });
    }
  });
}
function removeActiveDomain(domain) {
  chrome.storage.local.get('activeDomains', data => {
    if (data.activeDomains) {
      data.activeDomains.delete(domain);
      chrome.storage.local.set({ activeDomains: data.activeDomains });
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendHTML") {
    if (isDomainActive(sender.tab.url)) {
      sendHTMLToServer(request.html, sender.tab.id);
      return true; // Required for async response
    }
    return false;
  }
  
  if (request.action === "find") {
    if (isDomainActive(sender.tab.url)) {
      searchToServer(request.searchString, request.tabId)
      return true;
    }
    return false;
  }
  if (request.action === "getTabId") {
      sendResponse(sender.tab.id);
  }
  if (request.action === "addActiveDomain") {
    // check if authenticated
      addActiveDomain(request.domain);
    return true;
  }
  
  if (request.action === "removeActiveDomain") {
    removeActiveDomain(request.domain);
    return true;
  }
  });