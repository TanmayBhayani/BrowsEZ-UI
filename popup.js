document.addEventListener('DOMContentLoaded', function() {
  const searchBar = document.getElementById('searchBar');
  const searchForm = document.getElementById('searchForm');
  const toggleButton = document.getElementById('toggleButton');

  // Load the current state
  chrome.storage.local.get('isActive', function(data) {
    const isActive = data.isActive || false;
    updateUI(isActive);
  });

  toggleButton.addEventListener('click', function() {
    chrome.storage.local.get('isActive', function(data) {
      const newState = !data.isActive;
      chrome.storage.local.set({isActive: newState}, function() {
        updateUI(newState);
      });
    });
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