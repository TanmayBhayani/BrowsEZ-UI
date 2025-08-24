import { BackgroundMessenger } from '@shared/utils/messaging';
import { apiClient } from '@shared/api';
import type { TabState } from '@shared/types/extension';
import { ExtensionStore } from './ExtensionStore';
import { isDomainActive } from './utils/utils';

export class TabManager {
  private static instance: TabManager;
  private store: ExtensionStore;

  private constructor() {
    this.store = ExtensionStore.getInstance();
  }

  static getInstance(): TabManager {
    if (!TabManager.instance) TabManager.instance = new TabManager();
    return TabManager.instance;
  }

  initialize(): void {
    this.initializeAllTabs();
    this.reconcileAllTabs();
  }

  async initializeAllTabs(): Promise<void> {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      this.getOrInitializeTabState(tab.id, tab.url);
    }
  }

  async getActiveTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      return tabs[0];
    }
    console.error("Background: No active tab could be determined.");
    return null;
  }

  getOrInitializeTabState(tabId: number, tabUrl: string): TabState {
    let tabState = this.store.tabStates[tabId];
    
    if (tabState) {
      return tabState;
    }
  
    console.log(`Background: No state for tab ${tabId}, initializing.`);
    const isActive = tabUrl ? isDomainActive(tabUrl) : false;
  
    // Initialize tab state in store
    this.store.initializeTabState(tabId); // This creates a default TabState
    // Now update it with available info
    this.store.updateTabState.updateBasicInfo(tabId, { isContentScriptActive: false, isActive, url: tabUrl }); 
    
    tabState = this.store.tabStates[tabId];
    return tabState;
  }

  async reconcileAllTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        await this.reconcileTab(tab.id);
      }
    } catch (e) {
      // noop
    }
  }

  async getTabOrNull(tabId: number) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab; // tab exists
    } catch (e) {
      return null; // tab doesn't exist
    }
  }

  async reconcileTab(tabId: number): Promise<void> {
    console.log('Reconciling Tab:', tabId)
    //Check if tab exists
    const tab = await this.getTabOrNull(tabId);
    if (!tab) {
      console.log(`Background: Tab ${tabId} does not exist, skipping reconciliation`);
      return;
    }
    // Ensure TabState exists
    let state = this.store.tabStates[tabId];
    if (!state) {
      this.store.initializeTabState(tabId);
      state = this.store.tabStates[tabId];
    }

    // Ensure URL is up to date; if URL changed, reset snapshot and digest
    if (tab.url !== state.url) {
      this.store.updateTabState.updateBasicInfo(tabId, { 
        url: tab.url, 
        lastProcessedHTML: null, 
        pageDigest: null
      }, false);
      this.store.updateTabState.updateHTMLProcessingStatus(tabId, 'not_sent');
    }

    // Ensure isActive is up to date
    const isActive = isDomainActive(tab.url);
    if (isActive !== state.isActive) {
      this.store.updateTabState.updateBasicInfo(tabId, { isActive });
    }

    // 1) Ensure content script
    const contentReady = await this.ensureContentScript(tabId);
    if (!contentReady) {
      this.setError(tabId, 'CONTENT_SCRIPT_MISSING', 'Content script is not available in this tab');
      return;
    }

    if (state.isActive) {
      await this.ensureCollection(tabId);
    }
    else {
      // Make sure htmlProcessingStatus is not_sent
      if (state.htmlProcessingStatus !== 'not_sent') {
        this.store.updateTabState.updateHTMLProcessingStatus(tabId, 'not_sent');
      }
    }
  }

  async ensureContentScript(tabId: number): Promise<boolean> {
    try {
      const ping = await BackgroundMessenger.ping(tabId);
      if (ping && ping.success) {
        this.store.updateTabState.updateBasicInfo(tabId, { isContentScriptActive: true }, false);
        return true;
      }
    } catch (e) {
      // Try injection fallback
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['seedrandom.min.js'] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        const ping2 = await BackgroundMessenger.ping(tabId);
        if (ping2 && ping2.success) {
          this.store.updateTabState.updateBasicInfo(tabId, { isContentScriptActive: true }, false);
          return true;
        }
      } catch (e2) {
        // fallthrough
      }
    }
    this.store.updateTabState.updateBasicInfo(tabId, { isContentScriptActive: false }, false);
    return false;
  }

  async ensureCollection(tabId: number): Promise<void> {
    const state = this.store.tabStates[tabId];
    if (!state) return;
    try {
      const auth = await apiClient.checkAuth();
      if (!auth.authenticated) {
        this.setError(tabId, 'AUTH_REQUIRED', 'Authentication required - please login');
        return;
      }

      // Refresh digest from snapshotted HTML and ask server if collection exists
      await this.refreshDigest(tabId);
      const currentDigest = this.store.tabStates[tabId]?.pageDigest || undefined;
      try {
        console.log('Background: Checking if collection exists', currentDigest);
        const exists = await apiClient.collectionExists(tabId, currentDigest);
        if (exists.exists && (exists.hashMatch === true || exists.status === 200)) {
          this.store.updateTabState.updateHTMLProcessingStatus(tabId, 'ready');
          return;
        }
      } catch {}

      // Use snapshotted HTML for embedding (capture once if missing)
      let snapshotHTML = this.store.tabStates[tabId]?.lastProcessedHTML || null;
      if (!snapshotHTML) {
        const htmlResp = await BackgroundMessenger.getPageHTML(tabId);
        if (!htmlResp.success || !htmlResp.data?.html) {
          this.setError(tabId, 'HTML_CAPTURE_FAILED', 'Could not capture page HTML');
          return;
        }
        snapshotHTML = htmlResp.data.html;
        this.store.updateTabState.updateBasicInfo(tabId, { lastProcessedHTML: snapshotHTML }, false);
      }
      this.store.updateTabState.updateHTMLProcessingStatus(tabId, 'processing');
      try {
        const resp = await apiClient.sendHTML(snapshotHTML, tabId);
        if (resp.status === 200) {
          this.store.updateTabState.updateHTMLProcessingStatus(tabId, 'ready');
        } else {
          this.store.updateTabState.updateHTMLProcessingStatus(tabId, 'error');
        }
      } catch (e: any) {
        this.store.updateTabState.updateHTMLProcessingStatus(tabId, 'error');
        this.setError(tabId, 'EMBED_FAILED', e?.message || 'Failed to embed HTML');
      }
    } catch (e) {
      this.setError(tabId, 'UNKNOWN', 'Failed to ensure collection');
    }
  }

  async refreshDigest(tabId: number): Promise<void> {
    try {
      // Prefer previously snapshotted HTML; if absent, capture once and store
      let snapshotHTML = this.store.tabStates[tabId]?.lastProcessedHTML || null;
      if (!snapshotHTML) {
        const htmlResp = await BackgroundMessenger.getPageHTML(tabId);
        if (!htmlResp.success || !htmlResp.data?.html) {
          this.setError(tabId, 'HTML_CAPTURE_FAILED', 'Could not capture page HTML');
          return;
        }
        snapshotHTML = htmlResp.data.html;
        this.store.updateTabState.updateBasicInfo(tabId, { lastProcessedHTML: snapshotHTML }, false);
      }

      const digestResp = await apiClient.computeHash(snapshotHTML);
      this.store.updateTabState.updateBasicInfo(tabId, { pageDigest: digestResp.hash }, false);
    } catch (e) {
      this.setError(tabId, 'UNKNOWN', 'Failed to refresh digest');
    }
  }

  async injectContentScriptsToTab(tabId: number): Promise<boolean> {
    try {
      // First inject seedrandom.min.js
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['seedrandom.min.js']
      });
      
      // Then inject content.js
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      this.store.updateTabState.updateBasicInfo(tabId, { isContentScriptActive: true });
      console.log(`Successfully injected content scripts to tab ${tabId}`);
      return true;
    } catch (err) {
      console.log(`Error injecting content scripts to tab ${tabId}:`, err);
      return false;
    }
  }
  
  async embedHTML(tab: chrome.tabs.Tab): Promise<void> {
    if (!tab.id || !tab.url) return;
  
    // Consider only domains where extension is active
    if (!isDomainActive(tab.url)) {
      return;
    }
  
    // Ensure tab state exists
    const tabState = this.getOrInitializeTabState(tab.id, tab.url);
  
    // Skip if HTML is already processed or in-progress
    if (tabState.htmlProcessingStatus === 'ready' || tabState.htmlProcessingStatus === 'processing') {
      return;
    }
  
    try {
      console.log(`Background: Requesting HTML from content script in tab ${tab.id}`);
  
      // Mark as processing
      this.store.updateTabState.updateHTMLProcessingStatus(tab.id, 'processing');
  
      // Ask content script for HTML
      const response = await BackgroundMessenger.getPageHTML(tab.id);
  
      if (response.success && response.data) {
        await apiClient.sendHTML(response.data.html, tab.id);
        this.store.updateTabState.updateHTMLProcessingStatus(tab.id, 'ready');
        console.log(`Background: HTML embedded for tab ${tab.id}`);
      } else {
        console.error(`Background: Could not retrieve HTML for tab ${tab.id}:`, response.error);
        this.store.updateTabState.updateHTMLProcessingStatus(tab.id, 'error');
      }
    } catch (err) {
      console.error(`Background: Error during HTML embed for tab ${tab.id}:`, err);
      this.store.updateTabState.updateHTMLProcessingStatus(tab.id, 'error');
    }
  }

  private setError(tabId: number, code: string, message: string): void {
    this.store.updateTabState.setError(tabId, { code, message });
  }
}

export function getTabManager(): TabManager {
  return TabManager.getInstance();
}

