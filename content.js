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

// Add session management functions
function storeSessionId(sessionId) {
  sessionStorage.setItem('currentSessionId', sessionId);
}

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

function generateUniqueId() {
  return 'el_' + Math.random().toString(36).substr(2, 9);
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


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if(request.action === "search") {
    const currentSessionId = sessionStorage.getItem('currentSessionId');
    const searchParams = new URLSearchParams({
      searchString: request.searchString
    });

    fetch(`http://127.0.0.1:5000/search?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'id': currentSessionId
      }
    })
    .then(response => response.json())
    .then(data => {
      console.log('Search results:', data);
      if (data.searchResults) {
        highlightElements(data.searchResults);
      } else {
        console.log('No search results found');
      }
    })
    .catch((error) => {
      console.error('Error sending search:', error);
    });
  } else if (request.action === "next") {
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
function sendHTMLToBackend(html) {
  const currentSessionId = sessionStorage.getItem('currentSessionId');
  let body = { html: html };
  // body = JSON.stringify({ html: html })
  if(currentSessionId) {
    body.id = currentSessionId;
  }
  body  = JSON.stringify(body);
  console.log("Body:", body);
  console.log("Sending HTML to backend:");
  fetch('http://127.0.0.1:5000/receive_html', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body
  })
  .then(response => response.json())
  .then(data => {
    storeSessionId(data.session_id);
  });
}

function processPage() {
  addDataAttributesToElements(document.body);
  let html = document.documentElement.outerHTML;
  sendHTMLToBackend(html);
}
// Remove the DOMContentLoaded wrapper and run directly
processPage();

// Add cleanup event listeners
window.addEventListener('beforeunload', cleanupSession);
window.addEventListener('unload', cleanupSession);
