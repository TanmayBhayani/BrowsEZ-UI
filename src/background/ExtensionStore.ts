import type { ExtensionState, TabState, SearchState } from '@shared/types/extension';
import { initialTabState } from '@shared/state/tabStore';
// Define types for store change events
export type StoreChangeEventType = 
  | 'TAB_STATE_INITIALIZED'
  | 'TAB_STATE_UPDATED'
  | 'TAB_STATE_CLEARED'
  | 'CURRENT_TAB_CHANGED'
  | 'EXTENSION_ACTIVE_CHANGED'
  | 'SIDEBAR_STATE_CHANGED'
  | 'ACTIVE_DOMAINS_CHANGED'
  | 'SESSION_ID_CHANGED';

export interface StoreChangeEvent {
  type: StoreChangeEventType;
  tabId?: number;
  data?: any;
}

export const initialExtensionState: ExtensionState = {
  currentTabId: null,
  isInitialized: false,
  tabStates: {},
  isExtensionActive: false,
  activeDomains: [],
  sidebarOpen: false,
}

export type StoreChangeListener = (event: StoreChangeEvent) => void;

export class ExtensionStore {
  private static instance: ExtensionStore;
  private state: ExtensionState = initialExtensionState;
  
  // Observer pattern implementation
  private listeners = new Set<StoreChangeListener>();

  static getInstance(): ExtensionStore {
    if (!ExtensionStore.instance) {
      ExtensionStore.instance = new ExtensionStore();
    }
    return ExtensionStore.instance;
  }

  private constructor() {
    this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.session.get(['extensionState']);
      if (result.extensionState) {
        this.state = { ...this.state, ...result.extensionState };
      }
    } catch (error) {
      console.error('Error loading state from storage:', error);
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await chrome.storage.session.set({ extensionState: this.state });
    } catch (error) {
      console.error('Error saving state to storage:', error);
    }
  }

  // Tab state helpers
  private createDefaultTabState(tabId: number, url?: string, title?: string): TabState {
    const defaultTabState = initialTabState;
    defaultTabState.tabId = tabId;
    defaultTabState.url = url ?? '';
    defaultTabState.title = title ?? '';
    return defaultTabState;
  }

  // Public API methods
  initializeTabState(tabId: number, notify: boolean = true): void {
    if (!this.state.tabStates[tabId]) {
      this.state.tabStates[tabId] = this.createDefaultTabState(tabId);
      this.saveToStorage();
      if(notify){
        this.notify({ type: 'TAB_STATE_INITIALIZED', tabId });
      }
    }
  }

  updateTabState = {
    updateBasicInfo: (tabId: number, updates: Partial<Pick<TabState, 'url' | 'title' | 'isActive' | 'lastProcessedHTML' | 'isContentScriptActive'>>, notify: boolean = true) => {
      if (!this.state.tabStates[tabId]) {
        this.initializeTabState(tabId);
      }
      this.state.tabStates[tabId] = { ...this.state.tabStates[tabId], ...updates };
      this.saveToStorage();
      if(notify){
        this.notify({ type: 'TAB_STATE_UPDATED', tabId, data: { updates } });
      }
    },

    updateHTMLProcessingStatus: (tabId: number, status: TabState['htmlProcessingStatus'], notify: boolean = true) => {
      if (!this.state.tabStates[tabId]) {
        this.initializeTabState(tabId);
      }
      this.state.tabStates[tabId].htmlProcessingStatus = status;
      this.saveToStorage();
      if(notify){
        this.notify({ type: 'TAB_STATE_UPDATED', tabId, data: { htmlProcessingStatus: status } });
      }
    },

    updateSearchState: (tabId: number, searchStateUpdates: Partial<SearchState>, notify: boolean = true) => {
      if (!this.state.tabStates[tabId]) {
        this.initializeTabState(tabId);
      }
      this.state.tabStates[tabId].searchState = {
        ...this.state.tabStates[tabId].searchState,
        ...searchStateUpdates,
      };
      this.saveToStorage();
      if(notify){
        this.notify({ type: 'TAB_STATE_UPDATED', tabId, data: { searchStateUpdates } });
      }
    },
  };

  updateSearchPosition(tabId: number, position: number): void {
    this.updateTabState.updateSearchState(tabId, { currentPosition: position });
  }

  updateSearchStatus(tabId: number, status: SearchState['searchStatus']): void {
    this.updateTabState.updateSearchState(tabId, { searchStatus: status });
  }

  // Getters
  get currentTabId(): number | null { 
    return this.state.currentTabId; 
  }
  
  get tabStates(): Record<number, TabState> { 
    return this.state.tabStates; 
  }
  
  get activeDomains(): string[] { 
    return this.state.activeDomains; 
  }

  get isExtensionActive(): boolean {
    return this.state.isExtensionActive;
  }

  get sidebarOpen(): boolean {
    return this.state.sidebarOpen;
  }

  // Setters
  setCurrentTabId(tabId: number | null, notify: boolean = true): void {
    this.state.currentTabId = tabId;
    this.saveToStorage();
    if(notify){
      this.notify({ type: 'CURRENT_TAB_CHANGED', tabId: tabId ?? undefined });
    }
  }

  setExtensionActive(active: boolean, notify: boolean = true): void {
    this.state.isExtensionActive = active;
    this.saveToStorage();
    if(notify){
      this.notify({ type: 'EXTENSION_ACTIVE_CHANGED', data: { active } });
    }
  }

  setSidebarOpen(open: boolean, notify: boolean = true): void {
    this.state.sidebarOpen = open;
    this.saveToStorage();
    if(notify){
      this.notify({ type: 'SIDEBAR_STATE_CHANGED', data: { open } });
    }
  }


  addActiveDomain(url: string): void {
    const domain = new URL(url).hostname;
    if (!this.state.activeDomains.includes(domain)) {
      this.state.activeDomains.push(domain);
      this.saveToStorage(); 
    }
  }

  removeActiveDomain(url: string): void {
    const domain = new URL(url).hostname;
    this.state.activeDomains = this.state.activeDomains.filter((d: string) => d !== domain);
    this.saveToStorage();
  }

  clearTabState(tabId: number, notify: boolean = true): void {
    delete this.state.tabStates[tabId];
    this.saveToStorage();
    if(notify){
      this.notify({ type: 'TAB_STATE_CLEARED', tabId });
    }
  }

  // Get the full state (useful for debugging or advanced operations)
  getState(): ExtensionState {
    return { ...this.state };
  }

  // Reset the entire store (useful for testing or complete reset)
  resetStore(): void {
    this.state = initialExtensionState;
    this.saveToStorage();
  }

  setTabState(tabId: number, tabState: TabState, notify: boolean = true): void {
    this.state.tabStates[tabId] = tabState;
    this.saveToStorage();
    if(notify){
      this.notify({ type: 'TAB_STATE_UPDATED', tabId, data: { tabState } });
    }
  }

  // Subscribe to store changes
  subscribe(listener: StoreChangeListener): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Notify all listeners of a change
  private notify(event: StoreChangeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in store change listener:', error);
      }
    });
  }
} 