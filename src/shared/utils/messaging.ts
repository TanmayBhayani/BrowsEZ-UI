import type { 
  BaseMessage, 
  MessageResponse, 
  MessageType, 
  MessageSource, 
  MessageTarget,
  MessageSchema,
} from '@shared/types/messages';
import type { TabState } from '@shared/types/extension';

export class TypedMessenger {
  private static responseCallbacks = new Map<string, (response: MessageResponse) => void>();
  
  /**
   * Send a typed message with automatic response handling
   */
  static async send<T extends MessageType>(
    type: T,
    payload: MessageSchema[T]['payload'],
    source: MessageSource,
    target: MessageTarget = 'background',
    tabId?: number
  ): Promise<MessageResponse<MessageSchema[T]['response']>> {
    const message: BaseMessage<MessageSchema[T]['payload']> = {
      type,
      payload,
      source,
      target,
      tabId,
    };

    try {
      // Handle different contexts
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        if (target === 'content') {
          // If no tabId is provided, use the active tab
          if(!tabId){
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = tabs[0]?.id;
          }
          return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
              if (chrome.runtime.lastError) {
                reject({
                  success: false,
                  error: chrome.runtime.lastError.message,
                });
              } else {
                resolve(response);
              }
            });
          });
        } else {
          // Send to background or other contexts
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
              if (chrome.runtime.lastError) {
                reject({
                  success: false,
                  error: chrome.runtime.lastError.message,
                });
              } else {
                resolve(response);
              }
            });
          });
        }
      }
      
      throw new Error('Chrome runtime not available');
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Listen for typed messages
   */
  static onMessage<T extends MessageType>(
    type: T,
    handler: (
      payload: MessageSchema[T]['payload'],
      sender: chrome.runtime.MessageSender
    ) => MessageResponse<MessageSchema[T]['response']> | Promise<MessageResponse<MessageSchema[T]['response']>>
  ): void {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message: BaseMessage<any>, sender, sendResponse) => {
        if (message.type === type) {
          const result = handler(message.payload, sender);
          
          if (result instanceof Promise) {
            result.then(sendResponse);
            return true; // Indicates async response
          } else if (result) {
            sendResponse(result);
          }
        }
      });
    }
  }

  /**
   * Broadcast a message to all contexts
   */
  static async broadcast<T extends MessageType>(
    type: T,
    payload: MessageSchema[T]['payload'],
    source: MessageSource
  ): Promise<void> {
    // Send to all tabs' content scripts
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type,
            payload,
            source,
            target: 'content'
          });
        }
      });
    }

    // Send to background (if not from background)
    if (source !== 'background') {
      this.send(type, payload, source, 'background');
    }
  }
}

// ────────────────────────────────────────────────────────────
//  Context-specific messenger helpers
//  1. ApplicationMessenger   (runs in React sidebar – source: 'sidebar')
//  2. BackgroundMessenger    (runs in background        – source: 'background')
//  3. ContentMessenger       (runs in content script    – source: 'content')
// ────────────────────────────────────────────────────────────

export const ApplicationMessenger = {
  // Control messages to background
  async performSearch(searchString: string, searchType: 'smart' | 'basic' = 'smart', tabId: number) {
    console.log('Sending PERFORM_SEARCH to background:', searchString, searchType, tabId);
    return TypedMessenger.send('PERFORM_SEARCH', { searchString, searchType, tabId }, 'sidebar');
  },

  async requestInitialState() {
    console.log('Sending UI_REQUEST_INITIAL_STATE to background');
    return TypedMessenger.send('UI_REQUEST_INITIAL_STATE', {}, 'sidebar');
  },

  // UI control functions
  async clearChat() {
    console.log('Sending REMOVE_HIGHLIGHTS to content');
    return TypedMessenger.send('REMOVE_HIGHLIGHTS', {}, 'sidebar', 'content');
  },

  async highlightElement(element: any, isLink: boolean = false) {
    console.log('Sending HIGHLIGHT_ELEMENT to content:', element, isLink);
    return TypedMessenger.send('HIGHLIGHT_ELEMENT', { element, isLink }, 'sidebar', 'content');
  },

  async removeHighlights() {
    console.log('Sending REMOVE_HIGHLIGHTS to content');
    return TypedMessenger.send('REMOVE_HIGHLIGHTS', {}, 'sidebar', 'content');
  },

  // Syncer push (sidebar ➞ background)
  async sendTabStateUpdate(tabId: number, tabState: TabState) {
    console.log('Sending SIDEBAR_TAB_STATE_UPDATE to background:', tabId, tabState);
    return TypedMessenger.send('SIDEBAR_TAB_STATE_UPDATE', { tabId, tabState }, 'sidebar');
  },

  async setActiveState(tabId: number, isActive: boolean, domain: string) {
    console.log('Sending TOGGLE_ACTIVE_STATE to background:', tabId, isActive, domain);
    return TypedMessenger.send('TOGGLE_ACTIVE_STATE', {tabId, isActive, domain}, 'sidebar', 'background');
  }
};

// Background ➞ other contexts helpers (runs in background)
export const BackgroundMessenger = {
  // Background ➞ content helpers
  async highlightElement(tabId: number, element: any, isLink: boolean = false) {
    console.log('Sending HIGHLIGHT_ELEMENT to content:', tabId, element, isLink);
    return TypedMessenger.send('HIGHLIGHT_ELEMENT', { element, isLink }, 'background', 'content', tabId);
  },

  async removeHighlights(tabId: number) {
    console.log('Sending REMOVE_HIGHLIGHTS to content:', tabId);
    return TypedMessenger.send('REMOVE_HIGHLIGHTS', { tabId }, 'background', 'content', tabId);
  },

  async getPageHTML(tabId: number) {
    console.log('Sending GET_PAGE_HTML to content:', tabId);
    return TypedMessenger.send('GET_PAGE_HTML', {}, 'background', 'content', tabId);
  },

  async navigateToLink(tabId: number, elementId: string, href: string) {
    console.log('Sending NAVIGATE_TO_LINK to content:', tabId, elementId, href);
    return TypedMessenger.send('NAVIGATE_TO_LINK', { elementId, href }, 'background', 'content', tabId);
  },

  // Syncer push (background ➞ sidebar)
  async sendTabStateUpdate(tabId: number, tabState: TabState | null) {
    console.log('Sending BACKGROUND_STATE_UPDATE to sidebar:', tabId, tabState);
    return TypedMessenger.send('BACKGROUND_STATE_UPDATE', { tabId, tabState }, 'background', 'sidebar');
  }
};

// Content ➞ background helpers (runs in content script)
export const ContentMessenger = {
  async sendHTML(html: string, url: string) {
    console.log('Sending SEND_HTML to background:', url);
    return TypedMessenger.send('SEND_HTML', { html, url }, 'content');
  },

  async getTabId() {
    console.log('Sending GET_TAB_ID to background');
    return TypedMessenger.send('GET_TAB_ID', {}, 'content');
  },

  async cleanupSession(sessionId: string) {
    console.log('Sending CLEANUP_SESSION to background:', sessionId);
    return TypedMessenger.send('CLEANUP_SESSION', { sessionId }, 'content');
  }
}; 