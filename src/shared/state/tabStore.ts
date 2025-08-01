import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { TabState, SearchState, SearchResult, ConversationMessage } from '@shared/types/extension';

// Actions for managing a single TabState (for use in TabStore)
export interface TabActions {
  setTabState: (tabState: TabState) => void;
  updateSearchState: (searchStateUpdates: Partial<SearchState>) => void;
  toggleActiveState: () => void;
  updateHTMLProcessingStatus: (status: 'not_sent' | 'processing' | 'ready' | 'error') => void;
  updateBasicInfo: (updates: { url?: string; title?: string; isActive?: boolean; lastProcessedHTML?: string | null }) => void;
  updateSearchPosition: (position: number) => void;
  updateSearchResults: (results: SearchResult[]) => void;
  setConversation: (conversation: ConversationMessage[]) => void;
  addMessageToConversation: (message: ConversationMessage) => void;
  clearSearch: () => void;
  setSearchStatus: (status: 'idle' | 'searching' | 'showing_results' | 'error') => void;
  setLlmAnswer: (answer: string) => void;
  // Potentially more actions specific to a single tab's lifecycle in the UI
}

export const initialSearchState: SearchState = {
  lastSearch: null,
  currentPosition: 0,
  totalResults: 0,
  searchStatus: 'idle',
  searchResults: [],
  llmAnswer: '',
  navigationLinks: [],
  conversation: [],
};

export const initialTabState: TabState = {
  tabId: -1, // Default or placeholder, should be updated on initialization
  url: '',
  title: '',
  isActive: false,
  isContentScriptActive: false,
  htmlProcessingStatus: 'not_sent',
  lastProcessedHTML: null,
  searchState: initialSearchState,
};

export const useTabStore = create<TabState & TabActions>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialTabState,

      setTabState: (tabState) => set(tabState),

      updateSearchState: (searchStateUpdates) => set((state) => ({
        searchState: {
          ...state.searchState,
          ...searchStateUpdates,
        },
      })),

      updateHTMLProcessingStatus: (status) => set({ htmlProcessingStatus: status }),

      updateBasicInfo: (updates) => set((state) => ({
        ...state,
        ...updates,
      })),

      toggleActiveState: () => set((state) => ({
        isActive: !state.isActive,
      })),

      updateSearchPosition: (position) => set((state) => ({
        searchState: {
          ...state.searchState,
          currentPosition: position,
        },
      })),

      updateSearchResults: (results) => set((state) => ({
        searchState: {
          ...state.searchState,
          searchResults: results,
          totalResults: results.length,
        },
      })),

      setConversation: (conversation) => set(state => ({
        searchState: {
            ...state.searchState,
            conversation: conversation,
        }
      })),

      addMessageToConversation: (message) => set(state => ({
        searchState: {
            ...state.searchState,
            conversation: [...(state.searchState.conversation || []), message]
        }
      })),

      clearSearch: () => set(state => ({
        searchState: {
            ...state.searchState,
            lastSearch: null,
            currentPosition: 0,
            totalResults: 0,
            searchStatus: 'idle',
            searchResults: [],
            llmAnswer: '',
            // conversation is intentionally not cleared here, 
            // it might be cleared separately or by setting a new one
        }
      })),
      
      setSearchStatus: (status) => set((state) => ({
        searchState: {
          ...state.searchState,
          searchStatus: status,
        },
      })),

      setLlmAnswer: (answer: string) => set(state => ({
          searchState: {
              ...state.searchState,
              llmAnswer: answer,
          }
      }))
    })),
    {
      name: 'tab-store',
      // enabled: true,
    }
  )
);

// Selector for convenience
export const selectCurrentConversation = (state: TabState) => state.searchState.conversation || [];

export const selectDisplayConversation = (state: TabState): ConversationMessage[] => {
  const currentSearchState = state.searchState;
  if (!currentSearchState) return [];

  let conversation: ConversationMessage[] = [...(currentSearchState.conversation || [])];
  
  conversation = conversation.filter(
    (msg) => msg.role !== 'navigation' && 
    !(msg.role === 'system' && (msg.content === 'No relevant results found.' || msg.content === 'Searching...'))
  );

  if (currentSearchState.searchStatus === 'showing_results' && currentSearchState.llmAnswer) {
    if (!conversation.some((msg) => msg.role === 'assistant' && msg.content === currentSearchState.llmAnswer)) {
      conversation.push({
        role: 'assistant',
        content: currentSearchState.llmAnswer,
        timestamp: new Date().toISOString(),
      });
    }
  }
  if (currentSearchState.searchStatus === 'showing_results' && currentSearchState.totalResults > 0) {
    conversation.push({
      role: 'navigation',
      content: `Relevant Results: ${currentSearchState.currentPosition > 0 ? currentSearchState.currentPosition : 1} of ${currentSearchState.totalResults}`,
      timestamp: new Date().toISOString(),
    });
  } else if (currentSearchState.searchStatus === 'showing_results' && currentSearchState.totalResults === 0 && !currentSearchState.llmAnswer) {
    conversation.push({
      role: 'system',
      content: 'No relevant results found.',
      timestamp: new Date().toISOString(),
    });
  }
  return conversation;
};

export const selectIsTabLoading = (state: TabState): boolean => 
  state.htmlProcessingStatus === 'processing' || state.searchState?.searchStatus === 'searching'; 