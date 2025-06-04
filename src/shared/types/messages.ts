// Message Types for Type-Safe Communication
export type MessageSource = 'background' | 'content' | 'sidebar' | 'settings';
export type MessageTarget = 'background' | 'content' | 'sidebar' | 'settings' | 'all';

// Base message interface
export interface BaseMessage<T = any> {
  type: string;
  payload: T;
  source: MessageSource;
  target: MessageTarget;
  timestamp: string;
  requestId?: string;
}

// Specific message types
export type MessageType = 
  // Background <-> UI
  | 'BACKGROUND_STATE_UPDATE'
  | 'SEARCH_COMPLETE'
  | 'UPDATE_STATUS'
  
  // UI -> Background
  | 'TOGGLE_ACTIVATION'
  | 'PERFORM_SEARCH'
  | 'CLEAR_CHAT'
  | 'NAVIGATE'
  | 'UI_REQUEST_INITIAL_STATE'
  
  // Background <-> Content
  | 'SEND_HTML'
  | 'GET_PAGE_HTML'
  | 'HIGHLIGHT_ELEMENT'
  | 'REMOVE_HIGHLIGHTS'
  | 'NAVIGATE_TO_LINK'
  | 'CLEANUP_SESSION'
  | 'GET_TAB_ID';

// Message payload types
export interface SearchPayload {
  searchString: string;
  searchType: 'smart' | 'basic';
}

export interface HighlightPayload {
  element: any;
  isLink: boolean;
}

export interface NavigationPayload {
  direction: 'next' | 'prev';
}

export interface StateUpdatePayload {
  tabId: number;
  tabState: any;
}

export interface SendHtmlPayload {
  html: string;
  url: string;
}

export interface CleanupSessionPayload {
  sessionId: string;
}

export interface NavigateToLinkPayload {
  elementId: string;
  href: string;
}

// Typed message creators
export function createMessage<T>(
  type: MessageType,
  payload: T,
  source: MessageSource,
  target: MessageTarget = 'background'
): BaseMessage<T> {
  return {
    type,
    payload,
    source,
    target,
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substr(2, 9),
  };
}

// Response types
export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
} 