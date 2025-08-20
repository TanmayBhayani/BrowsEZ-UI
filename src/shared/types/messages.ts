// Message Types for Type-Safe Communication
export type MessageSource = 'background' | 'content' | 'sidebar' | 'settings';
export type MessageTarget = 'background' | 'content' | 'sidebar' | 'settings' | 'all';

// Base message interface
export type BaseMessage<T = any> = {
  type: string;
  payload: T;
  source: MessageSource;
  target: MessageTarget;
  tabId?: number;
}

// ────────────────────────────────────────────────────────────
//  Central message schema – single source-of-truth for payload
//  and response types of every message that flows through the
//  extension. The MessageType union is now derived from this
//  map, so adding a new message requires adding an entry here
//  and nowhere else.
// ────────────────────────────────────────────────────────────
import type { TabState } from './extension';

// Specific response types that don't already exist elsewhere
export interface UIInitialStateResponse {
  currentTabId?: number | null;
  tabState: TabState;
}

export interface MessageSchema {
  'BACKGROUND_STATE_UPDATE': {
    payload: { tabId: number; tabState: TabState | null };
    response: {};
  };
  'PING': {
    payload: {};
    response: { ok: boolean };
  };
  'PERFORM_SEARCH': {
    payload: SearchPayload;
    response: {};
  };
  'UI_REQUEST_INITIAL_STATE': {
    payload: {};
    response: UIInitialStateResponse;
  };
  'SIDEBAR_TAB_STATE_UPDATE': {
    payload: { tabId: number; tabState: TabState };
    response: {};
  };
  'TOGGLE_ACTIVE_STATE': {
    payload: ToggleActiveStatePayload;
    response: {};
  };
  'GET_PAGE_HTML': {
    payload: {};
    response: GetPageHTMLResponse;
  };
  'HIGHLIGHT_ELEMENT': {
    payload: HighlightPayload;
    response: string; // data contains a human-readable message
  };
  'REMOVE_HIGHLIGHTS': {
    payload: {};
    response: {};
  };
  'NAVIGATE_TO_LINK': {
    payload: NavigateToLinkPayload;
    response: {};
  };
  'CLEANUP_SESSION': {
    payload: CleanupSessionPayload;
    response: {};
  };
  'SEND_HTML': {
    payload: SendHtmlPayload;
    response: {};
  };
  'SET_ACTIVE_DOMAINS': {
    payload: { activeDomains: string[] };
    response: {};
  };
  'GET_TAB_ID': {
    payload: {};
    response: number | null;
  };
}

export type MessageType = keyof MessageSchema;

// Helper aliases
export type MessagePayload<T extends MessageType> = MessageSchema[T]['payload'];
export type MessageResponseData<T extends MessageType> = MessageSchema[T]['response'];

// Message payload types
export type SearchPayload = {
  searchString: string;
  searchType: 'smart' | 'basic';
  tabId: number;
}

export type HighlightPayload = {
  element: any;
  isLink: boolean;
}

export type NavigationPayload = {
  direction: 'next' | 'prev';
}

export type StateUpdatePayload = {
  tabId: number;
  tabState: any;
}

export type SendHtmlPayload = {
  html: string;
  url: string;
}

export type CleanupSessionPayload = {
  sessionId: string;
}

export type NavigateToLinkPayload = {
  elementId: string;
  href: string;
}

export type GetPageHTMLResponse = {
  html: string;
}

export type ToggleActiveStatePayload = {
  tabId: number;
  isActive: boolean;
  domain: string;
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
    target
  };
}

// Response types
export type MessageResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
} 