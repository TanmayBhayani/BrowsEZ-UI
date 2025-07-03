import { ExtensionStore, type StoreChangeEvent } from './ExtensionStore';
import { BackgroundMessenger, TypedMessenger } from '@shared/utils/messaging';
import { ToggleActiveStateAction } from './actions/ToggleActiveState_action';
import type { TabState } from '@shared/types/extension';

/**
 * Background Syncer - Automatically syncs ExtensionStore state changes to the sidebar
 * with debouncing to prevent rapid successive updates
 */
class BackgroundSyncer {
  private store: ExtensionStore;
  private unsubscribe: (() => void) | null = null;
  private pendingUpdates = new Map<number, NodeJS.Timeout>();
  private debounceDelay: number;
  private isInitialized = false;
  // Holds the JSON string of the last TabState that was successfully pushed to
  // the sidebar. Cleared every time the browser's current tab changes so that
  // the first render of a newly-selected tab always gets sent even if its
  // state object hasn't changed.
  private lastSyncedJson: string | null = null;

  constructor(debounceDelay: number = 50) {
    this.store = ExtensionStore.getInstance();
    this.debounceDelay = debounceDelay;
  }

  /**
   * Initialize the syncer and start listening to store changes
   */
  init(): void {
    if (this.isInitialized) {
      console.warn('BackgroundSyncer: Already initialized');
      return;
    }

    console.log('BackgroundSyncer: Initializing with debounce delay:', this.debounceDelay);

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe(this.handleStoreChange.bind(this));
    this.isInitialized = true;

    console.log('BackgroundSyncer: Successfully initialized');

    // Listen for SIDEBAR_TAB_STATE_UPDATE to receive state changes from sidebar
    TypedMessenger.onMessage('SIDEBAR_TAB_STATE_UPDATE', (payload) => {
      const { tabId, tabState } = payload as { tabId: number; tabState: TabState };
      if (typeof tabId !== 'number' || !tabState) {
        return { success: false, error: 'Invalid payload' };
      }
      try {
        this.store.setTabState(tabId, tabState, false);
        return { success: true };
      } catch (e:any) {
        return { success: false, error: e.message };
      }
    });

    // Listen for TOGGLE_ACTIVE_STATE to receive isActive state changes from sidebar
    TypedMessenger.onMessage('TOGGLE_ACTIVE_STATE', (payload) => {
      const { tabId, isActive, domain } = payload as { tabId: number; isActive: boolean; domain: string };
      if (typeof tabId !== 'number' || typeof isActive !== 'boolean') {
        return { success: false, error: 'Invalid payload' };
      }
      try {
        ToggleActiveStateAction(tabId, isActive, domain);
        return { success: true };
      } catch (e:any) {
        return { success: false, error: e.message };
      }
    });
  }

  /**
   * Handle store change events
   */
  private handleStoreChange(event: StoreChangeEvent): void {
    console.log('BackgroundSyncer: Store change detected:', event);

    // We only care about tab state changes and current tab changes for sidebar sync
    switch (event.type) {
      case 'TAB_STATE_INITIALIZED':
      case 'TAB_STATE_UPDATED':
        if (event.tabId !== undefined) {
          this.scheduleTabStateSync(event.tabId);
        }
        break;
      
      case 'TAB_STATE_CLEARED':
        if (event.tabId !== undefined) {
          // Cancel any pending updates for this tab
          this.cancelPendingSync(event.tabId);
          // Send immediate notification about tab removal
          this.sendTabClearedMessage(event.tabId);
        }
        break;
      
      case 'CURRENT_TAB_CHANGED':
        // When current tab changes, always force a fresh sync for the new tab
        if (event.tabId !== undefined && event.tabId !== null) {
          // Remove any cached state for this tab so it always re-syncs even if the
          // underlying state object hasn't changed. This prevents the deduplication
          // logic from suppressing the update that the sidebar needs when returning
          // to a previously visited tab.
          this.lastSyncedJson = null;

          this.scheduleTabStateSync(event.tabId, 0); // No debounce for tab switch
        }
        break;

      // Other events can be handled here if needed for sidebar sync
      default:
        // Ignore other events for now
        break;
    }
  }

  /**
   * Schedule a tab state sync with debouncing
   */
  private scheduleTabStateSync(tabId: number, customDelay?: number): void {
    // Cancel any pending sync for this tab
    // this.cancelPendingSync(tabId);

    // const delay = customDelay !== undefined ? customDelay : this.debounceDelay;

    // if (delay === 0) {
    //   // Immediate sync
    //   this.syncTabStateToSidebar(tabId);
    // } else {
    //   // Schedule debounced sync
    //   const timeout = setTimeout(() => {
        this.syncTabStateToSidebar(tabId);
      //   this.pendingUpdates.delete(tabId);
      // }, delay);

      // this.pendingUpdates.set(tabId, timeout);
    // }
  }

  /**
   * Cancel any pending sync for a tab
   */
  private cancelPendingSync(tabId: number): void {
    const pendingTimeout = this.pendingUpdates.get(tabId);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingUpdates.delete(tabId);
    }
  }

  /**
   * Sync tab state to sidebar
   */
  private async syncTabStateToSidebar(tabId: number): Promise<void> {
    try {
      const tabState = this.store.tabStates[tabId];
      
      if (!tabState) {
        console.warn(`BackgroundSyncer: No tab state found for tab ${tabId}`);
        return;
      }

      console.log(`BackgroundSyncer: Syncing tab state for tab ${tabId}`);

      // Only sync if this tab is the currently active one in the store
      const currentTabId = this.store.currentTabId;
      if (currentTabId !== tabId) {
        // Irrelevant tab; skip syncing to sidebar
        console.debug(`BackgroundSyncer: Skipping sync for tab ${tabId} (current tab is ${currentTabId})`);
        return;
      }

      // Deduplicate: if last synced state is identical, skip
      const currentStateJson = JSON.stringify(tabState);
      if (this.lastSyncedJson === currentStateJson) {
        console.debug(`BackgroundSyncer: Skipping sync for tab ${tabId} (no meaningful change)`);
        return; // No meaningful change
      }

      // Send the state update to sidebar
      const response = await BackgroundMessenger.sendTabStateUpdate(tabId, tabState);

      // Cache last synced state
      this.lastSyncedJson = currentStateJson;

      if (response.success) {
        console.log(`BackgroundSyncer: Successfully synced tab ${tabId} to sidebar`);
      } else {
        console.log(`BackgroundSyncer: Failed to sync tab ${tabId}:`, response.error);
      }
    } catch (error) {
      // This might happen if sidebar is not open, which is fine
      console.debug(`BackgroundSyncer: Could not send to sidebar (might not be open):`, error);
    }
  }

  /**
   * Send a message that a tab was cleared
   */
  private async sendTabClearedMessage(tabId: number): Promise<void> {
    try {
      // Send BACKGROUND_STATE_UPDATE with null tabState to indicate tab was cleared
      await BackgroundMessenger.sendTabStateUpdate(tabId, null);    
    } catch (error) {
      // Sidebar might not be open, which is fine
      console.debug(`BackgroundSyncer: Could not send tab cleared message:`, error);
    }
  }

  /**
   * Cleanup the syncer
   */
  cleanup(): void {
    console.log('BackgroundSyncer: Cleaning up');

    // Cancel all pending syncs
    this.pendingUpdates.forEach((timeout) => clearTimeout(timeout));
    this.pendingUpdates.clear();

    // Unsubscribe from store
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.isInitialized = false;
  }

  /**
   * Force sync a specific tab (bypasses debouncing)
   */
  forceSyncTab(tabId: number): void {
    this.cancelPendingSync(tabId);
    this.syncTabStateToSidebar(tabId);
  }

  /**
   * Force sync the current tab (bypasses debouncing)
   */
  forceSyncCurrentTab(): void {
    const currentTabId = this.store.currentTabId;
    if (currentTabId !== null) {
      this.forceSyncTab(currentTabId);
    }
  }
}

// Export a singleton instance
let syncerInstance: BackgroundSyncer | null = null;

export function initBackgroundSync(debounceDelay: number = 50): BackgroundSyncer {
  if (!syncerInstance) {
    syncerInstance = new BackgroundSyncer(debounceDelay);
    syncerInstance.init();
  }
  return syncerInstance;
}

export function getBackgroundSyncer(): BackgroundSyncer | null {
  return syncerInstance;
}

export function cleanupBackgroundSync(): void {
  if (syncerInstance) {
    syncerInstance.cleanup();
    syncerInstance = null;
  }
} 