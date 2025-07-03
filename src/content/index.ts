// Modern Content Script - Complete Migration
import { TypedMessenger, ContentMessenger } from '@shared/utils/messaging';

console.log('BrowsEZ: Modern content script loaded');

// Global state
let highlightedElement: any = null;
let rng: any = new (window as any).Math.seedrandom(Date.now().toString());

// Inject styles
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

// Utility Functions
function generateUniqueId(): string {
  return 'el_' + Math.floor(rng() * 1000000000).toString(36);
}

function addDataAttributesToElements(element: Element, prefix = ''): void {
  if (element.nodeType === Node.ELEMENT_NODE) {
    const uniqueId = generateUniqueId();
    element.setAttribute('data-element-id', uniqueId);
    
    for (let i = 0; i < element.children.length; i++) {
      addDataAttributesToElements(element.children[i], prefix + i + '_');
    }
  }
}

function highlightElement(elementMetadata: any, isLink = false): boolean {
  // Remove any existing highlights
  removeAllHighlights();
  
  // Store the current element metadata
  highlightedElement = elementMetadata;
  
  console.log("Looking for element with ID:", elementMetadata.element_id);
  
  // Try to find the element by its data-element-id
  const element = document.querySelector(
    `[data-element-id="${elementMetadata.element_id}"]`
  );
  
  if (element) {
    console.log("Element found:", element);
    
    // Add the appropriate highlight class
    if (isLink || element.tagName.toLowerCase() === 'a' || element.hasAttribute('href')) {
      element.classList.add('extension-highlight-link');
    } else {
      element.classList.add('extension-highlight');
    }
    
    // Scroll the element into view
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    
    // Remove any existing tooltips
    document.querySelectorAll('.extension-tooltip').forEach(tip => tip.remove());
    
    // Create tooltip with element info
    const tooltip = document.createElement('div');
    tooltip.className = 'extension-tooltip';
    
    let tooltipContent = '';
    if (elementMetadata.explanation) {
      tooltipContent += `<div class="tooltip-explanation"><strong>Why this matches:</strong> ${elementMetadata.explanation}</div>`;
    }
    
    tooltip.innerHTML = tooltipContent;
    
    // Position the tooltip near the element
    const rect = element.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    
    document.body.appendChild(tooltip);
    
    return true;
  } else {
    console.warn("Element with ID not found:", elementMetadata.element_id);
    
    // Try XPath fallback
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
          const elementByXPath = result.singleNodeValue as Element;
          console.log("Element found by XPath:", elementByXPath);
          
          if (isLink || elementByXPath.tagName.toLowerCase() === 'a' || elementByXPath.hasAttribute('href')) {
            elementByXPath.classList.add('extension-highlight-link');
          } else {
            elementByXPath.classList.add('extension-highlight');
          }
          
          elementByXPath.scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        }
      } catch (e) {
        console.error("XPath lookup failed:", e);
      }
    }
    
    return false;
  }
}

function removeAllHighlights(): void {
  document.querySelectorAll('.extension-highlight, .extension-highlight-link').forEach(el => {
    el.classList.remove('extension-highlight', 'extension-highlight-link');
  });
  
  document.querySelectorAll('.extension-tooltip').forEach(tip => tip.remove());
}

function navigateToLink(elementId: string, href: string): void {
  removeAllHighlights();
  
  const linkElement = document.querySelector(`[data-element-id="${elementId}"]`);
  
  if (linkElement) {
    linkElement.classList.add('extension-highlight-link');
    linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    const tooltip = document.createElement('div');
    tooltip.className = 'extension-tooltip';
    tooltip.textContent = 'Click to navigate to this link';
    
    const rect = linkElement.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    
    document.body.appendChild(tooltip);
    
    setTimeout(() => {
      tooltip.remove();
    }, 3000);
  }
}

// async function processPage(): Promise<void> {
  // try {
  //   const response = await ContentMessenger.getTabId();
    
  //   if (!response || !response.success) {
  //     console.error("No valid response received for tab ID request");
  //     return;
  //   }
    
  //   const tabId = response.data;
  //   if (!tabId) {
  //     console.error("Received undefined tab ID");
  //     return;
  //   }
  //   addDataAttributesToElements(document.body);
    
  //   const html = document.documentElement.outerHTML;
  //   await ContentMessenger.sendHTML(html, window.location.href);
    
  //   console.log("HTML sent for tab:", tabId, " to background script");
  // } catch (error) {
  //   console.error("Error getting tab ID:", error);
  // }
// }

async function cleanupSessionOnUnload(): Promise<void> {
  const sessionId = sessionStorage.getItem('currentSessionId');
  if (sessionId) {
    try {
      console.log("Content.js: Requesting session cleanup from background script for session:", sessionId);
      
      await ContentMessenger.cleanupSession(sessionId);
    } catch (error) {
      console.error("Content.js: Error sending cleanupSessionOnServer message:", error);
    }
  }
}

// Modern Message Handling using TypedMessenger
TypedMessenger.onMessage('HIGHLIGHT_ELEMENT', async (payload, sender) => {
  console.log("Highlighting element:", payload.element);
  const highlighted = highlightElement(payload.element, payload.isLink);
  return { success: highlighted, data: highlighted ? "Element highlighted" : "Element not found" };
});

TypedMessenger.onMessage('REMOVE_HIGHLIGHTS', async (payload, sender) => {
  removeAllHighlights();
  highlightedElement = null;
  return { success: true };
});

TypedMessenger.onMessage('GET_PAGE_HTML', async (payload, sender) => {
  addDataAttributesToElements(document.body);
  const html = document.documentElement.outerHTML;
  return { success: true, data: { html } };
});


TypedMessenger.onMessage('NAVIGATE_TO_LINK', async (payload, sender) => {
  navigateToLink(payload.elementId, payload.href);
  return { success: true };
});

// Initialize when page loads
if (document.readyState === 'loading') {
  // document.addEventListener('DOMContentLoaded', processPage);
} else {
  // processPage();
}

// Add cleanup event listeners
window.addEventListener('beforeunload', cleanupSessionOnUnload);
// window.addEventListener('unload', cleanupSessionOnUnload);

console.log('BrowsEZ: Modern content script fully initialized'); 