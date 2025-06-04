import type { 
  BaseMessage, 
  MessageResponse, 
  MessageType, 
  MessageSource, 
  MessageTarget,
  SearchPayload,
  HighlightPayload,
  NavigationPayload,
  SendHtmlPayload,
  CleanupSessionPayload,
  NavigateToLinkPayload,
} from '@shared/types/messages';

export class TypedMessenger {
  private static responseCallbacks = new Map<string, (response: MessageResponse) => void>();
  
  /**
   * Send a typed message with automatic response handling
   */
  static async send<TPayload = any, TResponse = any>(
    type: MessageType,
    payload: TPayload,
    source: MessageSource,
    target: MessageTarget = 'background'
  ): Promise<MessageResponse<TResponse>> {
    const message: BaseMessage<TPayload> = {
      type,
      payload,
      source,
      target,
      timestamp: new Date().toISOString(),
      requestId: Math.random().toString(36).substr(2, 9),
    };

    try {
      // Handle different contexts
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        if (target === 'content') {
          // Send to specific tab's content script
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs[0]) {
            return new Promise((resolve) => {
              chrome.tabs.sendMessage(tabs[0].id!, message, (response) => {
                if (chrome.runtime.lastError) {
                  resolve({
                    success: false,
                    error: chrome.runtime.lastError.message,
                    requestId: message.requestId,
                  });
                } else {
                  resolve(response || { success: true, requestId: message.requestId });
                }
              });
            });
          }
        } else {
          // Send to background or other contexts
          return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: false,
                  error: chrome.runtime.lastError.message,
                  requestId: message.requestId,
                });
              } else {
                resolve(response || { success: true, requestId: message.requestId });
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
        requestId: message.requestId,
      };
    }
  }

  /**
   * Listen for typed messages
   */
  static onMessage<TPayload = any>(
    type: MessageType,
    handler: (payload: TPayload, sender: chrome.runtime.MessageSender) => Promise<MessageResponse> | MessageResponse | void
  ): void {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message: BaseMessage<TPayload>, sender, sendResponse) => {
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
  static async broadcast<TPayload = any>(
    type: MessageType,
    payload: TPayload,
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
            target: 'content',
            timestamp: new Date().toISOString(),
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

// Convenience functions for specific message types
export const SearchMessenger = {
  async performSearch(searchString: string, searchType: 'smart' | 'basic' = 'smart') {
    return TypedMessenger.send<SearchPayload>('PERFORM_SEARCH', {
      searchString,
      searchType,
    }, 'sidebar');
  },
  
  async clearChat() {
    return TypedMessenger.send('CLEAR_CHAT', {}, 'sidebar');
  },
  
  async navigate(direction: 'next' | 'prev') {
    return TypedMessenger.send<NavigationPayload>('NAVIGATE', {
      direction,
    }, 'sidebar');
  },
};

export const ContentMessenger = {
  async highlightElement(element: any, isLink: boolean = false) {
    return TypedMessenger.send<HighlightPayload>('HIGHLIGHT_ELEMENT', {
      element,
      isLink,
    }, 'background', 'content');
  },
  
  async removeHighlights() {
    return TypedMessenger.send('REMOVE_HIGHLIGHTS', {}, 'background', 'content');
  },
  
  async getPageHTML() {
    return TypedMessenger.send('GET_PAGE_HTML', {}, 'background', 'content');
  },
  
  async sendHTML(html: string, url: string) {
    return TypedMessenger.send<SendHtmlPayload>('SEND_HTML', {
      html,
      url,
    }, 'content');
  },
  
  async getTabId() {
    return TypedMessenger.send('GET_TAB_ID', {}, 'content');
  },
  
  async cleanupSession(sessionId: string) {
    return TypedMessenger.send<CleanupSessionPayload>('CLEANUP_SESSION', {
      sessionId,
    }, 'content');
  },
  
  async navigateToLink(elementId: string, href: string) {
    return TypedMessenger.send<NavigateToLinkPayload>('NAVIGATE_TO_LINK', {
      elementId,
      href,
    }, 'background', 'content');
  },
};

export const BackgroundMessenger = {
  async getInitialState() {
    return TypedMessenger.send('UI_REQUEST_INITIAL_STATE', {}, 'sidebar');
  },
  
  async toggleActivation() {
    return TypedMessenger.send('TOGGLE_ACTIVATION', {}, 'sidebar');
  },
}; 