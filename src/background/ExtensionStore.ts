import type { ExtensionState, TabState, SearchState } from '@shared/types/extension';

export class ExtensionStore {
  private static instance: ExtensionStore;
  private state: ExtensionState = {
    currentTabId: null,
    tabStates: {},
    isExtensionActive: false,
    activeDomains: [],
    sidebarOpen: false,
    settingsOpen: false,
    sessionId: null,
  };

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
      const result = await chrome.storage.local.get(['extensionState']);
      if (result.extensionState) {
        this.state = { ...this.state, ...result.extensionState };
      }
    } catch (error) {
      console.error('Error loading state from storage:', error);
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await chrome.storage.local.set({ extensionState: this.state });
    } catch (error) {
      console.error('Error saving state to storage:', error);
    }
  }

  // Tab state helpers
  private createDefaultTabState(tabId: number, url?: string, title?: string): TabState {
    return {
      tabId,
      url,
      title,
      isActive: false,
      htmlProcessingStatus: 'not_sent',
      lastProcessedHTML: null,
      searchState: {
        lastSearch: null,
        currentPosition: 0,
        totalResults: 0,
        searchStatus: 'idle',
        searchResults: [],
        llmAnswer: '',
        navigationLinks: [],
        conversation: [],
      },
    };
  }

  // Public API methods
  initializeTabState(tabId: number): void {
    if (!this.state.tabStates[tabId]) {
      this.state.tabStates[tabId] = this.createDefaultTabState(tabId);
      this.saveToStorage();
    }
  }

  updateTabState = {
    updateBasicInfo: (tabId: number, updates: Partial<Pick<TabState, 'url' | 'title' | 'isActive' | 'lastProcessedHTML'>>) => {
      if (!this.state.tabStates[tabId]) {
        this.initializeTabState(tabId);
      }
      this.state.tabStates[tabId] = { ...this.state.tabStates[tabId], ...updates };
      this.saveToStorage();
    },

    updateHTMLProcessingStatus: (tabId: number, status: TabState['htmlProcessingStatus']) => {
      if (!this.state.tabStates[tabId]) {
        this.initializeTabState(tabId);
      }
      this.state.tabStates[tabId].htmlProcessingStatus = status;
      this.saveToStorage();
    },

    updateSearchState: (tabId: number, searchStateUpdates: Partial<SearchState>) => {
      if (!this.state.tabStates[tabId]) {
        this.initializeTabState(tabId);
      }
      this.state.tabStates[tabId].searchState = {
        ...this.state.tabStates[tabId].searchState,
        ...searchStateUpdates,
      };
      this.saveToStorage();
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

  get settingsOpen(): boolean {
    return this.state.settingsOpen;
  }

  get sessionId(): string | null {
    return this.state.sessionId;
  }

  // Setters
  setCurrentTabId(tabId: number | null): void {
    this.state.currentTabId = tabId;
    this.saveToStorage();
  }

  setExtensionActive(active: boolean): void {
    this.state.isExtensionActive = active;
    this.saveToStorage();
  }

  setSidebarOpen(open: boolean): void {
    this.state.sidebarOpen = open;
    this.saveToStorage();
  }

  setSettingsOpen(open: boolean): void {
    this.state.settingsOpen = open;
    this.saveToStorage();
  }

  addActiveDomain(domain: string): void {
    if (!this.state.activeDomains.includes(domain)) {
      this.state.activeDomains.push(domain);
      this.saveToStorage();
    }
  }

  removeActiveDomain(domain: string): void {
    this.state.activeDomains = this.state.activeDomains.filter((d: string) => d !== domain);
    this.saveToStorage();
  }

  setSessionId(sessionId: string | null): void {
    this.state.sessionId = sessionId;
    this.saveToStorage();
  }

  clearTabState(tabId: number): void {
    delete this.state.tabStates[tabId];
    this.saveToStorage();
  }

  // Get the full state (useful for debugging or advanced operations)
  getState(): ExtensionState {
    return { ...this.state };
  }

  // Reset the entire store (useful for testing or complete reset)
  resetStore(): void {
    this.state = {
      currentTabId: null,
      tabStates: {},
      isExtensionActive: false,
      activeDomains: [],
      sidebarOpen: false,
      settingsOpen: false,
      sessionId: null,
    };
    this.saveToStorage();
  }
} 