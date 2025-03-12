document.addEventListener('DOMContentLoaded', function() {
  const searchBar = document.getElementById('searchBar');
  const searchForm = document.getElementById('searchForm');
  const toggleButton = document.getElementById('toggleButton');
  // Load the current state
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
    chrome.storage.local.get(`tab_${tab.id}_isActive`, function(data) {
      const isActive = data[`tab_${tab.id}_isActive`] || false;
      updateUI(isActive);
    });
  });

  toggleButton.addEventListener('click', async function() {
    try {
      // Get the active tab - directly awaitable
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      // Get current state from storage - directly awaitable
      const data = await chrome.storage.local.get(`tab_${tab.id}_isActive`);
      
      // Toggle the active state
      const isActive = !data[`tab_${tab.id}_isActive`];
      
      // Update the storage with new state - directly awaitable
      await chrome.storage.local.set({[`tab_${tab.id}_isActive`]: isActive});
      
      if (isActive) {
        // If activating, get the domain and add it to active list
        const domain = new URL(tab.url).hostname;
        
        // Add domain to active list
        await chrome.runtime.sendMessage({
          action: "addActiveDomain",
          domain: domain
        });
        
        // Get the page HTML
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getPageHTML" });
        
        // Send HTML to server if available
        if (response && response.html) {
          await chrome.runtime.sendMessage({
            action: "sendHTML",
            html: response.html,
            tabId: tab.id
          });
        }
      } else {
        // If deactivating, remove domain from active list
        const domain = new URL(tab.url).hostname;
        await chrome.runtime.sendMessage({
          action: "removeActiveDomain",
          domains: domain
        });
      }
      // Update the UI based on new state
      updateUI(isActive);
    } catch (e) {
      console.error("Error in toggle action:", e);
    }
  });
searchForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const searchString = searchBar.value.trim();
  console.log("Search string:", searchString);
  if (searchString) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.runtime.sendMessage({
              action: "find", 
              searchString: searchString, 
              tabId: tabs[0].id
          });
      });
      searchBar.value = ''; // Clear the search bar
  }
});

  function updateUI(isActive) {
    toggleButton.textContent = isActive ? 'Deactivate' : 'Activate';
    searchBar.style.display = isActive ? 'block' : 'none';
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
    document.getElementById('position-counter').textContent = 
      `${message.position}/${message.total}`;
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
