document.addEventListener('DOMContentLoaded', function() {
  const searchBar = document.getElementById('searchBar');
  const searchForm = document.getElementById('searchForm');
  const toggleButton = document.getElementById('toggleButton');
  const statusText = document.createElement('div');
  statusText.id = 'statusText';
  statusText.style.marginTop = '10px';
  statusText.style.fontSize = '12px';
  statusText.style.color = '#666';
  toggleButton.parentNode.insertBefore(statusText, toggleButton.nextSibling);
  
  // Establish connection to background script to detect extension reload
  const port = chrome.runtime.connect({name: "popup"});
  
  // Load the current state
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
    chrome.storage.session.get(`tab_${tab.id}_state`, function(data) {
      const tabState = data[`tab_${tab.id}_state`] || {
        isActive: false,
        htmlProcessingStatus: 'not_sent', // not_sent, processing, ready, error
        lastProcessedHTML: null,
        searchState: {
          lastSearch: null,
          currentPosition: 0,
          totalResults: 0,
          searchStatus: 'idle'
        }
      };
      updateUI(tabState);
    });
  });

  toggleButton.addEventListener('click', async function() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      const data = await chrome.storage.session.get(`tab_${tab.id}_state`);
      
      const currentState = data[`tab_${tab.id}_state`] || {
        isActive: false,
        htmlProcessingStatus: 'not_sent',
        lastProcessedHTML: null,
        searchState: {
          lastSearch: null,
          currentPosition: 0,
          totalResults: 0,
          searchStatus: 'idle'
        }
      };
      
      const newState = {
        ...currentState,
        isActive: !currentState.isActive
      };
      
      await chrome.storage.session.set({[`tab_${tab.id}_state`]: newState});
      
      if (newState.isActive) {
        const domain = new URL(tab.url).hostname;
        await chrome.runtime.sendMessage({
          action: "addActiveDomain",
          domain: domain
        });
        
        await chrome.tabs.sendMessage(tab.id, { action: "sendHTML" });
      } else {
        // If deactivating, remove domain from active list
        const domain = new URL(tab.url).hostname;
        await chrome.runtime.sendMessage({
          action: "removeActiveDomain",
          domain: domain
        });        
        // Send message to remove highlights when deactivated
        await chrome.tabs.sendMessage(tab.id, { action: "removeHighlights" });
      }
      
      updateUI(newState);
    } catch (e) {
      console.error("Error in toggle action:", e);
    }
  });

  searchForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const searchString = searchBar.value.trim();
    console.log("Search string:", searchString);
    
    if (searchString) {
      try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const data = await chrome.storage.session.get(`tab_${tab.id}_state`);
        const currentState = data[`tab_${tab.id}_state`];
        
        // Update state to show searching
        currentState.searchState = {
          ...currentState.searchState,
          lastSearch: searchString,
          currentPosition: 0,
          totalResults: 0
        };
        
        await chrome.storage.session.set({[`tab_${tab.id}_state`]: currentState});
        updateUI(currentState);
        
        await chrome.runtime.sendMessage({
          action: "find", 
          searchString: searchString, 
          tabId: tab.id,
          tabUrl: tab.url
        });
        
        searchBar.value = ''; // Clear the search bar
      } catch (error) {
        console.error("Error during search:", error);
      }
    }
  });

  function updateUI(tabState) {
    toggleButton.textContent = tabState.isActive ? 'Deactivate' : 'Activate';
    searchBar.style.display = tabState.isActive ? 'block' : 'none';
    statusText.style.display = tabState.isActive ? 'block' : 'none';
    
    // Hide the position counter if not active or no search results
    const positionCounter = document.getElementById('position-counter');
    const navigationControls = document.querySelector('.navigation-controls');
    const hasSearchResults = tabState.isActive && 
                            tabState.searchState && 
                            tabState.searchState.totalResults > 0;
    
    navigationControls.style.display = hasSearchResults ? 'block' : 'none';
    
    // Update status text based on HTML processing status
    let statusMessage = '';
    switch(tabState.htmlProcessingStatus) {
      case 'processing':
        statusMessage = 'Getting ready...';
        break;
      case 'ready':
        statusMessage = 'Ready';
        break;
      case 'error':
        statusMessage = 'Error processing page';
        break;
      default:
        statusMessage = '';
    }
    
    statusText.textContent = statusMessage;
  }
});

document.getElementById('prevButton').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "previous"});
  });
});

document.getElementById('nextButton').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "next"});
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "updatePosition") {
    chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
      const tab = tabs[0];
      const data = await chrome.storage.session.get(`tab_${tab.id}_state`);
      const currentState = data[`tab_${tab.id}_state`];
      
      currentState.searchState = {
        ...currentState.searchState,
        currentPosition: message.position,
        totalResults: message.total
      };
      
      await chrome.storage.session.set({[`tab_${tab.id}_state`]: currentState});
      
      // Update the position counter text
      document.getElementById('position-counter').textContent = 
        `${message.position}/${message.total}`;
      
      // Make sure the navigation controls are visible
      if (message.total > 0) {
        document.querySelector('.navigation-controls').style.display = 'block';
      } else {
        document.querySelector('.navigation-controls').style.display = 'none';
      }
    });
  }
  
  if (message.action === "updateHTMLStatus") {
    chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
      const tab = tabs[0];
      const data = await chrome.storage.session.get(`tab_${tab.id}_state`);
      const currentState = data[`tab_${tab.id}_state`];
      
      currentState.htmlProcessingStatus = message.status;
      if (message.status === 'ready') {
        currentState.lastProcessedHTML = message.timestamp;
      }
      
      await chrome.storage.session.set({[`tab_${tab.id}_state`]: currentState});
      
      // Update UI
      const statusText = document.getElementById('statusText');
      if (statusText) {
        let statusMessage = '';
        switch(message.status) {
          case 'processing':
            statusMessage = 'Getting ready...';
            break;
          case 'ready':
            statusMessage = 'Ready';
            break;
          case 'error':
            statusMessage = 'Error processing page';
            break;
        }
        statusText.textContent = statusMessage;
      }
    });
  }
  
  if (message.action === "stateChanged") {
    // When state changes from another tab, refresh our UI
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // Only update if popup is open
      if (tabs && tabs.length > 0) {
        chrome.storage.session.get(`tab_${tabs[0].id}_state`, function(data) {
          const tabState = data[`tab_${tabs[0].id}_state`];
          if (tabState) {
            updateUI(tabState);
          }
        });
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  // Get settings button element
  const settingsButton = document.getElementById('settings-button');
  // Add click event listener to open settings page
  settingsButton.addEventListener('click', function() {
    // Open the settings page in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('settings.html')
    });
  });
});
