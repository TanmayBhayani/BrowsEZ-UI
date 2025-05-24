// content.js starts here - typesShared.js has already been loaded by the manifest
// BrowsEZ namespace is now globally available with all utility functions and constants

let highlightedElement = null;
const style = document.createElement('style');

style.textContent = `
  .extension-highlight {
    background-color: rgba(74, 144, 226, 0.3) !important;
    border: 2px solid rgba(74, 144, 226, 0.8) !important;
    border-radius: 4px !important;
    box-shadow: 0 0 8px rgba(74, 144, 226, 0.4) !important;
    transition: all 0.2s ease-in-out !important;
    animation: element-pulse 0.5s ease-in-out !important;
  }
  
  .extension-highlight-link {
    background-color: rgba(126, 87, 194, 0.25) !important;
    border: 2px solid rgba(126, 87, 194, 0.7) !important;
    border-radius: 4px !important;
    box-shadow: 0 0 8px rgba(126, 87, 194, 0.4) !important;
    transition: all 0.2s ease-in-out !important;
    animation: link-pulse 0.5s ease-in-out !important;
    text-decoration: underline !important;
  }
  
  @keyframes element-pulse {
    0% { box-shadow: 0 0 0 rgba(74, 144, 226, 0); }
    50% { box-shadow: 0 0 12px rgba(74, 144, 226, 0.6); }
    100% { box-shadow: 0 0 8px rgba(74, 144, 226, 0.4); }
  }
  
  @keyframes link-pulse {
    0% { box-shadow: 0 0 0 rgba(126, 87, 194, 0); }
    50% { box-shadow: 0 0 12px rgba(126, 87, 194, 0.6); }
    100% { box-shadow: 0 0 8px rgba(126, 87, 194, 0.4); }
  }
  
  .extension-tooltip {
    position: absolute;
    background-color: rgba(33, 33, 33, 0.9);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    max-width: 400px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    line-height: 1.4;
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .tooltip-explanation {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    font-style: italic;
  }
`;
document.head.appendChild(style);


async function cleanupSessionOnUnload() {
  const sessionId = sessionStorage.getItem('currentSessionId');
  if (sessionId) {
    try {
      // Send message to background script to handle the fetch call for cleanup
      console.log("Content.js: Requesting session cleanup from background script for session:", sessionId);
      
      const message = window.BrowsEZ.createContentToBackgroundMessage(
        window.BrowsEZ.MessageActions.CLEANUP_SESSION, 
        { sessionId }
      );
      
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error("Content.js: Error sending cleanupSessionOnServer message:", error);
    }
  }
}

let rng = new Math.seedrandom(Date.now().toString());;

function generateUniqueId() {
  return 'el_' + Math.floor(rng() * 1000000000).toString(36);
}

async function processPage() {
  try {
    // Get the tab ID from background script
    const message = window.BrowsEZ.createContentToBackgroundMessage(
      window.BrowsEZ.MessageActions.GET_TAB_ID
    );
    
    const tabId = await chrome.runtime.sendMessage(message);
    rng = new Math.seedrandom(tabId.toString());
    addDataAttributesToElements(document.body);
    // Gather HTML and send it to background script
    const html = document.documentElement.outerHTML;
    sendHTMLToBackground(html);
    console.log("HTML sent for tab:", tabId," to background script");
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
function sendHTMLToBackground(html) {
  const message = window.BrowsEZ.createContentToBackgroundMessage(
    window.BrowsEZ.MessageActions.SEND_HTML,
    {
      html: html,
      url: window.location.href
    }
  );
  
  chrome.runtime.sendMessage(message);
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Message received in content script:', request);
  
  // Use our standardized action constants
  const { MessageActions } = window.BrowsEZ;
  
  if (request.action === MessageActions.HIGHLIGHT_ELEMENT) {
    console.log("Highlighting element:", request.element);
    const highlighted = highlightElement(request.element, request.isLink);
    sendResponse({ success: highlighted, message: highlighted ? "Element highlighted" : "Element not found" });
    return true;
  }
  else if (request.action === MessageActions.REMOVE_HIGHLIGHTS) {
    removeAllHighlights();
    highlightedElement = null;
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === MessageActions.GET_PAGE_HTML) {
    // When background.js requests the HTML, we prepare and send it
    addDataAttributesToElements(document.body);
    const html = document.documentElement.outerHTML;
    sendResponse({ html: html });
    return true;
  }
  else if (request.action === MessageActions.SEND_HTML) {
    // The content script already has the DOM context
    addDataAttributesToElements(document.body);
    const html = document.documentElement.outerHTML;
    sendHTMLToBackground(html);
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === MessageActions.NAVIGATE_TO_LINK) {
    // Handle navigation to link when clicked in popup
    navigateToLink(request.elementId, request.href);
    sendResponse({ success: true });
    return true;
  }
  return false; // Default if no specific async action taken that requires returning true.
});

function highlightElement(elementMetadata, isLink = false) {
  // Remove any existing highlights
  removeAllHighlights();
  
  // Store the current element metadata
  highlightedElement = elementMetadata;
  
  // Log element ID for debugging
  console.log("Looking for element with ID:", elementMetadata.element_id);
  
  // Try to find the element by its data-element-id
  const element = document.querySelector(
    `[data-element-id="${elementMetadata.element_id}"]`
  );
  
  if (element) {
    console.log("Element found:", element);
    
    // Add the appropriate highlight class based on whether it's a link
    if (isLink || element.tagName.toLowerCase() === 'a' || element.hasAttribute('href')) {
      element.classList.add('extension-highlight-link');
    } else {
      element.classList.add('extension-highlight');
    }
    
    // Scroll the element into view
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
    
    return true; // Successfully highlighted
  } else {
    console.warn("Element with ID not found:", elementMetadata.element_id);
    
    // Try to find the element using XPath if element_id fails
    // This is a fallback mechanism for when the page might have reloaded
    // and the data-element-id attributes were regenerated
    if (elementMetadata.xpath) {
      try {
        const result = document.evaluate(
          elementMetadata.xpath, 
          document, 
          null, 
          XPathResult.FIRST_ORDERED_NODE_TYPE, 
          null
        );
        
        if (result.singleNodeValue) {
          const elementByXPath = result.singleNodeValue;
          console.log("Element found by XPath:", elementByXPath);
          
          // Highlight the element
          if (isLink || elementByXPath.tagName.toLowerCase() === 'a' || elementByXPath.hasAttribute('href')) {
            elementByXPath.classList.add('extension-highlight-link');
          } else {
            elementByXPath.classList.add('extension-highlight');
          }
          
          elementByXPath.scrollIntoView({behavior: "smooth", block: "center"});
          return true;
        }
      } catch (e) {
        console.error("XPath lookup failed:", e);
      }
    }
    
    // As a last resort, try simple text content matching if available
    if (elementMetadata.text) {
      // Get all text nodes
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      // Find nodes that contain the text
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes(elementMetadata.text)) {
          // Found a text node containing our text
          const parentElement = node.parentElement;
          if (parentElement) {
            console.log("Element found by text content:", parentElement);
            
            // Highlight the parent element
            if (isLink || parentElement.tagName.toLowerCase() === 'a' || parentElement.hasAttribute('href')) {
              parentElement.classList.add('extension-highlight-link');
            } else {
              parentElement.classList.add('extension-highlight');
            }
            
            parentElement.scrollIntoView({behavior: "smooth", block: "center"});
            return true;
          }
        }
      }
    }
    
    console.error("Failed to find element with ID, XPath, or text content:", elementMetadata);
    return false; // Element not found with any method
  }
}

function removeAllHighlights() {
  document.querySelectorAll('.extension-highlight, .extension-highlight-link').forEach(el => {
    el.classList.remove('extension-highlight', 'extension-highlight-link');
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
    // Highlight the link element with the link-specific style
    linkElement.classList.add('extension-highlight-link');
    
    // Scroll the link into view
    linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
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
window.addEventListener('beforeunload', cleanupSessionOnUnload);
window.addEventListener('unload', cleanupSessionOnUnload); // unload might not always fire reliably
