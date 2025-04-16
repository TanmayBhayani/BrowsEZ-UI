let highlightedElement = null;
const style = document.createElement('style');

style.textContent = `
  .extension-highlight {
    background-color: yellow !important;
    outline: 2px solid red !important;
  }
  
  .extension-tooltip {
    position: absolute;
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    max-width: 400px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    line-height: 1.4;
  }
  
  .tooltip-explanation {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    font-style: italic;
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

let rng = new Math.seedrandom(Date.now().toString());;

function generateUniqueId() {
  return 'el_' + Math.floor(rng() * 1000000000).toString(36);
}

async function processPage() {
  try {
    const tabId = await chrome.runtime.sendMessage({action: "getTabId"});
    rng = new Math.seedrandom(tabId.toString());
    addDataAttributesToElements(document.body);
    // HTML sending is now handled by the background script when requested
  } catch (error) {
    console.error("Error getting tab ID:", error);
  }
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
    html: html,
    url: window.location.href
  });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Message received in content script:', request);
  
  if (request.action === "highlightElement") {
    highlightElement(request.element);
  }
  else if (request.action === "removeHighlights") {
    removeAllHighlights();
    highlightedElement = null;
  }
  else if (request.action === "getPageHTML") {
    // When background.js requests the HTML, we prepare and send it
    addDataAttributesToElements(document.body);
    const html = document.documentElement.outerHTML;
    sendResponse({ html: html });
    return true;
  }
  else if (request.action === "sendHTML") {
    // The content script already has the DOM context
    addDataAttributesToElements(document.body);
    const html = document.documentElement.outerHTML;
    sendHTMLToBackend(html);
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === "navigateToLink") {
    // Handle navigation to link when clicked in popup
    navigateToLink(request.elementId, request.href);
    sendResponse({ success: true });
    return true;
  }
  return true;
});

function highlightElement(elementMetadata) {
  // Remove any existing highlights
  removeAllHighlights();
  
  // Store the current element metadata
  highlightedElement = elementMetadata;
  
  const element = document.querySelector(
    `[data-element-id="${elementMetadata.element_id}"]`
  );
  
  if (element) {
    element.classList.add('extension-highlight');
    element.scrollIntoView({behavior: "smooth", block: "center"});
    
    // Remove any existing tooltips
    document.querySelectorAll('.extension-tooltip').forEach(tip => tip.remove());
    
    // Create tooltip with element info
    const tooltip = document.createElement('div');
    tooltip.className = 'extension-tooltip';
    
    // Initialize tooltipContent variable
    let tooltipContent = '';
    
    // Add explanation from LLM if available
    if (elementMetadata.explanation) {
      tooltipContent += `<div class="tooltip-explanation"><strong>Why this matches:</strong> ${elementMetadata.explanation}</div>`;
    }
    
    tooltip.innerHTML = tooltipContent;
    
    // Position the tooltip near the element
    const rect = element.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    
    document.body.appendChild(tooltip);
  }
}

function removeAllHighlights() {
  document.querySelectorAll('.extension-highlight').forEach(el => {
    el.classList.remove('extension-highlight');
  });
  
  // Remove any existing tooltips
  document.querySelectorAll('.extension-tooltip').forEach(tip => tip.remove());
}

function navigateToLink(elementId, href) {
  // Remove any existing highlights first
  removeAllHighlights();
  
  // Find the link element by its data-element-id attribute
  const linkElement = document.querySelector(`[data-element-id="${elementId}"]`);
  
  if (linkElement) {
    // Highlight the link element
    linkElement.classList.add('extension-highlight');
    
    // Scroll the link into view
    linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // If href is provided and the link has an href attribute, we could optionally navigate to it
    // For now, we'll let the user click it manually after highlighting it
    
    // Create a brief tooltip to indicate this is a clickable link
    const tooltip = document.createElement('div');
    tooltip.className = 'extension-tooltip';
    tooltip.textContent = 'Click to navigate to this link';
    
    // Position the tooltip near the element
    const rect = linkElement.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    
    document.body.appendChild(tooltip);
    
    // Remove tooltip after 3 seconds
    setTimeout(() => {
      tooltip.remove();
    }, 3000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processPage);
} else {
  // Document is already loaded
  processPage();
}

// Add cleanup event listeners
window.addEventListener('beforeunload', cleanupSession);
window.addEventListener('unload', cleanupSession);
