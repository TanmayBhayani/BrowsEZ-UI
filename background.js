// Initialize session when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  initializeSession();
});

// Initialize session when browser starts
chrome.runtime.onStartup.addListener(() => {
  initializeSession();
});

function initializeSession() {
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
      setTimeout(initializeSession, 5000);
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendHTML") {
    sendHTMLToServer(request.html, sender.tab.id);
    return true; // Required for async response
  }
  
  if (request.action === "find") {
    searchToServer(request.searchString, request.tabId)
    return true;
  }
  if (request.action === "getTabId") {
      sendResponse(sender.tab.id);
  }
  });