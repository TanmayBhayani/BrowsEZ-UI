// Extension State Types


export interface SearchResult {
  id: string;
  element_id: string;
  tag: string;
  text: string;
  xpath?: string;
  attributes?: Record<string, string>;
  explanation?: string;
}

export interface NavigationLink {
  text: string;
  url: string;
  element_id: string;
}

export interface SearchState {
  lastSearch: string | null;
  currentPosition: number;
  totalResults: number;
  searchStatus: 'idle' | 'searching' | 'showing_results' | 'error';
  searchResults: SearchResult[];
  llmAnswer: string;
  navigationLinks: NavigationLink[];
  conversation?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'navigation';
  content: string;
  timestamp: string;
  currentPosition?: number;
  totalResults?: number;
}

export interface TabState {
  tabId: number;
  url: string;
  title?: string;
  isContentScriptActive: boolean;
  isActive: boolean;
  htmlProcessingStatus: 'not_sent' | 'processing' | 'ready' | 'error';
  lastProcessedHTML?: string | null;
  lastError?: { code: string; message: string } | null;
  pageDigest?: string | null;
  searchState: SearchState;
}

// Extension Store State
export interface ExtensionState {
  // Current active tab ID
  currentTabId: number | null;
  isInitialized: boolean;
  // Tab states keyed by tab ID
  tabStates: Record<number, TabState>;
  
  // Global extension state
  isExtensionActive: boolean;
  activeDomains: string[];
  
  // UI state
  sidebarOpen: boolean;
} 
export interface UsageStats {
  usage: {
    tokens: {
      used: number;
      limit: number;
      percentage: number;
      unlimited: boolean;
    };
    collections: {
      count: number;
      limit: number;
      percentage: number;
      unlimited: boolean;
    };
  };
  user: {
    email: string;
    role: string;
    name: string;
  };
}