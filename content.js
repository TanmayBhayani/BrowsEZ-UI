let currentHighlightIndex = 0;
let highlightedElements = [];
const style = document.createElement('style');

style.textContent = `
  .extension-highlight {
    background-color: yellow !important;
    outline: 2px solid red !important;
  }
`;
document.head.appendChild(style);


async function cleanupSession() {
  const sessionId = sessionStorage.getItem('currentSessionId');
  if (sessionId) {
      await fetch('http://127.0.0.1:5000/cleanup_session', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_id: sessionId })
      });
      sessionStorage.removeItem('currentSessionId');
  }
}

let rng;

function generateUniqueId() {
  return 'el_' + Math.floor(rng() * 1000000000).toString(36);
}

function processPage() {
  chrome.runtime.sendMessage({action: "getTabId"}, (tabId) => {
      rng = new Math.seedrandom(tabId.toString());
      addDataAttributesToElements(document.body);
      let html = document.documentElement.outerHTML;
      sendHTMLToBackend(html);
  });
}

function addDataAttributesToElements(element, prefix = '') {
  if (element.nodeType === Node.ELEMENT_NODE) {
    const uniqueId = generateUniqueId();
    element.setAttribute('data-element-id', uniqueId);
    
    for (let i = 0; i < element.children.length; i++) {
        addDataAttributesToElements(element.children[i], prefix + i + '_');
    }
  }
}
function sendHTMLToBackend(html) {
  chrome.runtime.sendMessage({
    action: "sendHTML",
    html: html
  });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Message received in content script:', request);
  if (request.action === "highlightElements") {
    highlightElements(request.elements);
  }
  else if (request.action === "next") {
    navigateNext();
  } else if (request.action === "previous") {
    navigatePrevious();
  }
});
function highlightElements(elements) {
  // Remove any existing highlights
  removeAllHighlights();
  
  highlightedElements = elements;
  currentHighlightIndex = 0;
  
  // Only highlight and scroll to the first element
  highlightCurrentElement();
  updatePosition();
}

function removeAllHighlights() {
  document.querySelectorAll('.extension-highlight').forEach(el => {
    el.classList.remove('extension-highlight');
  });
}

function highlightCurrentElement() {
  if (highlightedElements.length === 0) return;
  
  const element = document.querySelector(
    `[data-element-id="${highlightedElements[currentHighlightIndex].element_id}"]`
  );
  
  if (element) {
    removeAllHighlights();
    element.classList.add('extension-highlight');
    element.scrollIntoView({behavior: "smooth", block: "center"});
  }
}

function updatePosition() {
  chrome.runtime.sendMessage({
    action: "updatePosition",
    position: currentHighlightIndex + 1,
    total: highlightedElements.length
  });
}

function navigateNext() {
  if (currentHighlightIndex < highlightedElements.length - 1) {
    currentHighlightIndex++;
    highlightCurrentElement();
    updatePosition();
  }
}

function navigatePrevious() {
  if (currentHighlightIndex > 0) {
    currentHighlightIndex--;
    highlightCurrentElement();
    updatePosition();
  }
}
// Remove the DOMContentLoaded wrapper and run directly
processPage();

// Add cleanup event listeners
window.addEventListener('beforeunload', cleanupSession);
window.addEventListener('unload', cleanupSession);
