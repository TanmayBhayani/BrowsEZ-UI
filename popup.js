// Define color constants
const LIGHT_GRAY = '#f5f5f5';
const RED = '#e57373';
const BLUE = '#4a90e2';
const MEDIUM_GRAY = '#666';
const BRIGHT_BLUE = '#4a8cff';

document.addEventListener('DOMContentLoaded', function() {
  const searchBar = document.getElementById('searchBar');
  const searchForm = document.getElementById('searchForm');
  const toggleButton = document.getElementById('toggleButton');
  const statusText = document.createElement('div');
  const llmToggle = document.getElementById('llm-toggle');
  const llmToggleContainer = document.querySelector('.llm-toggle-container');
  
  // Collapsible elements
  const llmAnswerHeader = document.getElementById('llm-answer-header');
  const navigationLinksHeader = document.getElementById('navigation-links-header');
  
  statusText.id = 'statusText';
  statusText.style.marginTop = '10px';
  statusText.style.fontSize = '12px';
  statusText.style.color = MEDIUM_GRAY;
  toggleButton.parentNode.insertBefore(statusText, toggleButton.nextSibling);
  
  // Create a message container for search explanation
  const messageContainer = document.createElement('div');
  messageContainer.id = 'message-container';
  messageContainer.style.marginTop = '10px';
  messageContainer.style.fontSize = '12px';
  messageContainer.style.color = BRIGHT_BLUE;
  messageContainer.style.fontStyle = 'italic';
  messageContainer.style.display = 'none';
  toggleButton.parentNode.insertBefore(messageContainer, statusText);
  
  // Reference to the LLM answer container
  const llmAnswerContainer = document.getElementById('llm-answer-container');

  // Set up collapsible functionality
  llmAnswerHeader.addEventListener('click', function() {
    toggleCollapsible(this);
  });
  
  navigationLinksHeader.addEventListener('click', function() {
    toggleCollapsible(this);
  });

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
          searchStatus: 'idle',
          searchResults: []
        }
      };
      updateUI(tabState);
      
      // If there were previous search results, highlight the current position
      if (tabState.searchState && 
          tabState.searchState.searchResults && 
          tabState.searchState.searchResults.length > 0 &&
          tabState.searchState.searchStatus === 'showing_results') {
        const indexToHighlight = tabState.searchState.currentPosition > 0 ? 
          tabState.searchState.currentPosition - 1 : 0;
        highlightElementAtIndex(indexToHighlight, tab.id);
      }
    });
    
    // Load LLM toggle state
    chrome.storage.local.get('llmFilteringEnabled', function(data) {
      const isLlmEnabled = data.llmFilteringEnabled !== undefined ? data.llmFilteringEnabled : true;
      llmToggle.checked = isLlmEnabled;
      llmToggleContainer.style.display = 'flex'; // Make sure it's visible
    });
  });

  // LLM Toggle event listener
  llmToggle.addEventListener('change', function() {
    const isEnabled = llmToggle.checked;
    chrome.storage.local.set({ llmFilteringEnabled: isEnabled }, function() {
      console.log(`LLM filtering ${isEnabled ? 'enabled' : 'disabled'}`);
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
        updateUI(newState)
        await chrome.tabs.sendMessage(tab.id, { action: "sendHTML" });
      } else {
        // If deactivating, remove domain from active list
        const domain = new URL(tab.url).hostname;
        // Reset search state for the tab
        const resetSearchState = {
          ...newState,
          searchState: {
            lastSearch: null,
            currentPosition: 0,
            totalResults: 0,
            searchStatus: 'idle'
          }
        };
        
        // Store the reset state in session storage
        await chrome.storage.session.set({[`tab_${tab.id}_state`]: resetSearchState});
        
        // Update UI to reflect the reset state
        updateUI(resetSearchState);
        await chrome.runtime.sendMessage({
          action: "removeActiveDomain",
          domain: domain
        });        
        // Send message to remove highlights when deactivated
        await chrome.tabs.sendMessage(tab.id, { action: "removeHighlights" });
      }
    } catch (e) {
      console.error("Error in toggle action:", e);
    }
  });

  searchForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Don't process the search if the search bar is disabled
    if (searchBar.disabled) {
      return;
    }
    
    // Hide LLM answer while searching
    if (llmAnswerContainer) {
      llmAnswerContainer.style.display = 'none';
      llmAnswerContainer.textContent = '';
    }
    
    const searchString = searchBar.value.trim();
    console.log("Search string:", searchString);
    
    if (searchString) {
      try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const data = await chrome.storage.session.get(`tab_${tab.id}_state`);
        const currentState = data[`tab_${tab.id}_state`];
        
        // Get LLM filtering preference
        const llmData = await chrome.storage.local.get('llmFilteringEnabled');
        const useLlmFiltering = llmData.llmFilteringEnabled !== undefined ? llmData.llmFilteringEnabled : true;
        
        // Update state to show searching
        currentState.searchState = {
          ...currentState.searchState,
          lastSearch: searchString,
          currentPosition: 0,
          totalResults: 0,
          searchStatus: 'searching'
        };
        
        await chrome.storage.session.set({[`tab_${tab.id}_state`]: currentState});
        updateUI(currentState);
        
        await chrome.runtime.sendMessage({
          action: "find", 
          searchString: searchString, 
          tabId: tab.id,
          tabUrl: tab.url,
          useLlmFiltering: useLlmFiltering
        });
      } catch (error) {
        console.error("Error during search:", error);
      }
    }
  });
  
  // Initialize collapsible containers to collapsed state
  initializeCollapsibles();
  
  // Add clear search functionality
  document.addEventListener('click', async function(e) {
    // Since we can't directly access the ::after pseudo-element,
    // we need to check if the click is within the search form area and near the X icon
    const searchForm = document.getElementById('searchForm');
    
    // Get the search form's position and dimensions
    const searchFormRect = searchForm.getBoundingClientRect();
    const iconArea = {
      left: searchFormRect.right - 30, // 30px from the right edge includes the icon
      right: searchFormRect.right,
      top: searchFormRect.top,
      bottom: searchFormRect.bottom
    };
    
    // Check if the click is within the icon area
    if (e.clientX >= iconArea.left && e.clientX <= iconArea.right &&
        e.clientY >= iconArea.top && e.clientY <= iconArea.bottom) {
        
      // Check if we're currently showing results
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      const data = await chrome.storage.session.get(`tab_${tab.id}_state`);
      const currentState = data[`tab_${tab.id}_state`];
      
      if (currentState.searchState && currentState.searchState.searchStatus === 'showing_results') {
        try {
          // Reset search state
          currentState.searchState = {
            lastSearch: null,
            currentPosition: 0,
            totalResults: 0,
            searchStatus: 'idle',
            searchResults: []
          };
          
          // Clear the search bar
          const searchBar = document.getElementById('searchBar');
          searchBar.value = '';
          
          // Update the state in storage
          await chrome.storage.session.set({[`tab_${tab.id}_state`]: currentState});
          
          // Update UI
          updateUI(currentState);
          
          // Remove highlights from the page
          await chrome.tabs.sendMessage(tab.id, { action: "removeHighlights" });
        } catch (error) {
          console.error("Error clearing search:", error);
        }
      }
    }
  });
});

// Function to toggle collapsible sections
function toggleCollapsible(header) {
  const container = header.closest('.collapsible-container');
  const content = container.querySelector('.collapsible-content');
  const icon = header.querySelector('.collapse-icon');
  
  if (container.classList.contains('collapsed')) {
    // Expand
    container.classList.remove('collapsed');
    content.style.display = 'block';
    icon.textContent = '▼';
  } else {
    // Collapse
    container.classList.add('collapsed');
    content.style.display = 'none';
    icon.textContent = '►';
  }
}

// Function to initialize collapsible containers
function initializeCollapsibles() {
  const collapsibles = document.querySelectorAll('.collapsible-container');
  collapsibles.forEach(container => {
    // Set initial state to collapsed
    const header = container.querySelector('.collapsible-header');
    const content = container.querySelector('.collapsible-content');
    const icon = header.querySelector('.collapse-icon');
    
    // Start collapsed by default
    container.classList.add('collapsed');
    content.style.display = 'none';
    icon.textContent = '►';
  });
}

function updateUI(tabState) {
  // Get UI elements
  const searchBar = document.getElementById('searchBar');
  const searchForm = document.getElementById('searchForm');
  const llmAnswerContainer = document.getElementById('llm-answer-container');
  const llmAnswerHeader = document.getElementById('llm-answer-header');
  const llmAnswerSection = llmAnswerHeader.closest('.collapsible-container');
  const messageContainer = document.getElementById('message-container');
  const positionCounter = document.getElementById('position-counter');
  const navigationControls = document.querySelector('.navigation-controls');
  const navigationLinksContainer = document.getElementById('navigation-links-container');
  const navigationLinksList = document.getElementById('navigation-links-list');
  const statusText = document.getElementById('statusText');
  
  // Restore last search text if available
  if (tabState.searchState && tabState.searchState.lastSearch) {
    searchBar.value = tabState.searchState.lastSearch;
  }
  
  // Update toggle button state
  toggleButton.textContent = tabState.isActive ? 'Deactivate' : 'Activate';
  toggleButton.style.backgroundColor = tabState.isActive ? RED : BLUE;
  
  // Setup dynamic CSS for search icon/clear button
  const styleElement = document.getElementById('dynamic-styles') || document.createElement('style');
  if (!document.getElementById('dynamic-styles')) {
    styleElement.id = 'dynamic-styles';
    document.head.appendChild(styleElement);
  }
  
  // Check if we have search results showing
  const isShowingResults = tabState.isActive && 
                           tabState.searchState && 
                           tabState.searchState.searchStatus === 'showing_results';
  
  // Show search icon or clear icon based on search state
  styleElement.textContent = `
    #searchForm::after {
      display: ${tabState.isActive ? 'block' : 'none'};
      content: '';
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      background-image: url("${isShowingResults ? 
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23e57373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E" : 
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%234a90e2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'%3E%3C/circle%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'%3E%3C/line%3E%3C/svg%3E"}");
      background-repeat: no-repeat;
      background-size: contain;
      pointer-events: ${isShowingResults ? 'auto' : 'none'};
      cursor: ${isShowingResults ? 'pointer' : 'default'};
    }
    
    #searchForm::after {
      ${isShowingResults ? 'z-index: 10; cursor: pointer;' : ''}
    }
    
    #searchForm::after:hover {
      ${isShowingResults ? 'opacity: 1;' : ''}
    }
  `;
  
  // Add or remove class for the clear button
  if (isShowingResults) {
    searchForm.classList.add('showing-results');
  } else {
    searchForm.classList.remove('showing-results');
  }
  
  // Handle active/inactive state
  if (!tabState.isActive) {
    // Hide everything when inactive
    searchBar.style.display = 'none';
    llmAnswerSection.style.display = 'none';
    navigationControls.style.display = 'none';
    navigationLinksContainer.style.display = 'none';
    statusText.style.display = 'none';
    if (messageContainer) messageContainer.style.display = 'none';
    return;
  }
  
  // Tab is active - proceed with showing UI elements
  searchBar.style.display = 'block';
  searchBar.placeholder = 'Find...';
  statusText.style.display = 'block';
  
  // Disable search bar when processing or searching
  const isProcessing = tabState.htmlProcessingStatus === 'processing';
  const isSearching = tabState.searchState && tabState.searchState.searchStatus === 'searching';
  
  if (isProcessing || isSearching) {
    searchBar.disabled = true;
    searchBar.style.backgroundColor = LIGHT_GRAY;
    searchBar.style.cursor = 'not-allowed';
    searchBar.style.opacity = '0.7';
  } else {
    searchBar.disabled = false;
    searchBar.style.backgroundColor = '';
    searchBar.style.cursor = '';
    searchBar.style.opacity = '';
  }
  
  // Handle status message
  let statusMessage = '';
  if (tabState.searchState) {
    if (tabState.searchState.searchStatus === 'searching') {
      statusMessage = 'Searching...';
    } else if (tabState.searchState.searchStatus === 'showing_results') {
      statusMessage = tabState.searchState.totalResults > 0 ? 'Results' : 'No relevant Result Found';
    } else if (tabState.searchState.searchStatus === 'error') {
      statusMessage = 'Error processing Search';
    }
  }
  
  if (!statusMessage) {
    switch(tabState.htmlProcessingStatus) {
      case 'processing': statusMessage = 'Getting ready...'; break;
      case 'ready': statusMessage = 'Ready'; break;
      case 'error': statusMessage = 'Error processing page'; break;
      default: statusMessage = '';
    }
  }
  statusText.textContent = statusMessage;
  
  // Handle search results message
  if (messageContainer && tabState.searchState && tabState.searchState.message) {
    messageContainer.textContent = tabState.searchState.message;
    messageContainer.style.display = 'block';
  } else if (messageContainer) {
    messageContainer.style.display = 'none';
  }
  
  // Handle search results navigation
  const hasSearchResults = tabState.searchState && tabState.searchState.totalResults > 0;
  navigationControls.style.display = hasSearchResults ? 'flex' : 'none';
  
  // Handle LLM answer display
  if (tabState.searchState && tabState.searchState.llmAnswer) {
    // Show the section container
    llmAnswerSection.style.display = 'block';
    
    // Always update the content text
    llmAnswerContainer.textContent = tabState.searchState.llmAnswer;
    
    // Control visibility of the content based on collapsed state
    if (llmAnswerSection.classList.contains('collapsed')) {
      llmAnswerContainer.style.display = 'none';
    } else {
      llmAnswerContainer.style.display = 'block';
    }
  } else {
    llmAnswerSection.style.display = 'none';
  }
  
  // Handle navigation links
  const navigationLinks = tabState.searchState && tabState.searchState.navigationLinks;
  if (navigationLinks && navigationLinks.length > 0) {
    // Show the navigation links container
    navigationLinksContainer.style.display = 'block';
    
    // Always clear and populate the links, regardless of collapsed state
    navigationLinksList.innerHTML = '';
    
    // Add navigation links to the list
    navigationLinks.forEach((link, index) => {
      const linkItem = document.createElement('div');
      linkItem.className = 'navigation-link-item';
      linkItem.dataset.elementId = link.element_id;
      linkItem.dataset.href = link.href;
      linkItem.dataset.linkIndex = index;
      
      const linkIcon = document.createElement('span');
      linkIcon.className = 'navigation-link-icon';
      linkIcon.innerHTML = '🔗';
      
      const linkText = document.createElement('span');
      linkText.className = 'navigation-link-text';
      linkText.textContent = link.text || 'Link ' + (index + 1);
      
      linkItem.appendChild(linkIcon);
      linkItem.appendChild(linkText);
      
      // Add click event listener to navigate to the link
      linkItem.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          const tab = tabs[0];
          chrome.tabs.sendMessage(tab.id, { 
            action: "navigateToLink", 
            elementId: link.element_id,
            href: link.href
          });
        });
      });
      
      navigationLinksList.appendChild(linkItem);
    });
    
    // Control visibility of the content based on collapsed state
    if (navigationLinksContainer.classList.contains('collapsed')) {
      navigationLinksList.style.display = 'none';
    } else {
      navigationLinksList.style.display = 'block';
    }
  } else {
    // Hide the navigation links container if no links
    navigationLinksContainer.style.display = 'none';
  }
}

// Function to highlight a specific element by index
function highlightElementAtIndex(index, tabId) {
  chrome.storage.session.get(`tab_${tabId}_state`, async function(data) {
    const tabState = data[`tab_${tabId}_state`];
    
    if (!tabState || 
        !tabState.searchState || 
        !tabState.searchState.searchResults || 
        index >= tabState.searchState.searchResults.length) {
      return;
    }
    
    // Get the element to highlight
    const elementToHighlight = tabState.searchState.searchResults[index];
    
    // Check if the element is a link by looking for href or a elements
    const isLink = elementToHighlight.tag === 'a' || 
                   elementToHighlight.attributes?.href || 
                   elementToHighlight.element_type === 'link';
    
    // Send message to content script to highlight this specific element
    chrome.tabs.sendMessage(tabId, {
      action: "highlightElement",
      element: elementToHighlight,
      isLink: isLink
    });
    
    // Update the current position in the state
    tabState.searchState.currentPosition = index + 1;
    await chrome.storage.session.set({[`tab_${tabId}_state`]: tabState});
    
    // Update the position counter
    document.getElementById('position-counter').textContent = 
      `${index + 1}/${tabState.searchState.totalResults}`;
    
    // updateUI(tabState);
  });
}

// Replace the previous next/prev button handlers with new ones that use highlightElementAtIndex
document.getElementById('prevButton').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
    chrome.storage.session.get(`tab_${tab.id}_state`, function(data) {
      const tabState = data[`tab_${tab.id}_state`];
      
      if (tabState && 
          tabState.searchState &&
          tabState.searchState.currentPosition > 1) {
        highlightElementAtIndex(tabState.searchState.currentPosition - 2, tab.id);
      }
    });
  });
});

document.getElementById('nextButton').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
    chrome.storage.session.get(`tab_${tab.id}_state`, function(data) {
      const tabState = data[`tab_${tab.id}_state`];
      
      if (tabState && 
          tabState.searchState &&
          tabState.searchState.currentPosition < tabState.searchState.totalResults) {
        highlightElementAtIndex(tabState.searchState.currentPosition, tab.id);
      }
    });
  });
});

// Update the message listener for searchComplete to handle the search results
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Deprecated Message
  if (message.action === "updatePosition") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      let currentState;
      chrome.storage.session.get(`tab_${tab.id}_state`).then(data => {
        currentState = data[`tab_${tab.id}_state`];
        
        // Preserve the current searchStatus when updating position
        const currentSearchStatus = currentState.searchState?.searchStatus || 'idle';
        
        currentState.searchState = {
          ...currentState.searchState,
          currentPosition: message.position,
          totalResults: message.total,
          searchStatus: message.total > 0 ? 'showing_results' : 'showing_results' // Still showing results but with zero count
        };
        
        return chrome.storage.session.set({[`tab_${tab.id}_state`]: currentState});
      }).then(() => {
        // Update the position counter text
        document.getElementById('position-counter').textContent = 
          `${message.position}/${message.total}`;
        
        // Make sure the navigation controls are visible
        if (message.total > 0) {
          document.querySelector('.navigation-controls').style.display = 'flex';
        } else {
          document.querySelector('.navigation-controls').style.display = 'none';
        }
        
        // Update UI to reflect correct status
        updateUI(currentState);
        sendResponse({success: true});
      }).catch(error => {
        console.error("Error updating position:", error);
        sendResponse({success: false, error: error.message});
      });
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === "updateStatus") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      // Only proceed if message is for the current active tab
      if (tab.id === message.tabId) {
        chrome.storage.session.get(`tab_${tab.id}_state`).then(data => {
          // Simply pass the current state to updateUI without modifying it
          const currentState = data[`tab_${tab.id}_state`];
          updateUI(currentState);
          sendResponse({success: true});
        }).catch(error => {
          console.error("Error retrieving tab state for updateStatus:", error);
          sendResponse({success: false, error: error.message});
        });
      } else {
        // Message is for a different tab, ignore
        sendResponse({success: true});
      }
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === "stateChanged") {
    // When state changes from another tab, refresh our UI
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      // Only update if popup is open
      if (tabs && tabs.length > 0) {
        chrome.storage.session.get(`tab_${tabs[0].id}_state`).then(data => {
          const tabState = data[`tab_${tabs[0].id}_state`];
          if (tabState) {
            updateUI(tabState);
          }
          sendResponse({success: true});
        }).catch(error => {
          console.error("Error handling state change:", error);
          sendResponse({success: false, error: error.message});
        });
      } else {
        sendResponse({success: true, message: "No active tabs"});
      }
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === "searchComplete") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      // Only update if this message is for the current tab
      if (message.tabId !== tab.id) {
        sendResponse({success: false, message: "Tab ID mismatch"});
        return;
      }
      
      let currentState;
      chrome.storage.session.get(`tab_${tab.id}_state`).then(data => {
        currentState = data[`tab_${tab.id}_state`];
        
        // If there are search results, highlight the first element
        if (currentState.searchState && 
            currentState.searchState.searchResults && 
            currentState.searchState.searchResults.length > 0 &&
            currentState.searchState.searchStatus === 'showing_results') {
          highlightElementAtIndex(0, tab.id);
        }
        
        return chrome.storage.session.set({[`tab_${tab.id}_state`]: currentState});
      }).then(() => {
        // Update UI
        updateUI(currentState);
        sendResponse({success: true});
      }).catch(error => {
        console.error("Error completing search:", error);
        sendResponse({success: false, error: error.message});
      });
    });
    return true; // Keep message channel open for async response
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
