import { useTabStore } from '@shared/state/tabStore';
import type { TabState } from '@shared/types/extension';
import { TypedMessenger, ApplicationMessenger } from '@shared/utils/messaging';

// Define a default/error state for TabStore when no valid tab is active or found
const DEFAULT_ERROR_TAB_STATE: TabState = {
  tabId: -1,
  url: '',
  title: 'Error: Tab Not Loaded',
  isActive: false,
  isContentScriptActive: false,
  htmlProcessingStatus: 'error',
  lastProcessedHTML: null,
  searchState: {
    lastSearch: null,
    currentPosition: 0,
    totalResults: 0,
    searchStatus: 'error',
    searchResults: [],
    llmAnswer: 'BrowsEZ is initializing or the current tab is not accessible.',
    navigationLinks: [],
    conversation: []
  },
  // No sessionId here, as it was correctly removed by the user from this constant
  // and from TabState interface earlier.
};

let isSyncerInitialized = false;
let isApplyingRemoteUpdate = false; // Prevent feedback loop when applying updates from background
// let lastSyncedStateJson: string | null = null;
let pendingSyncTimeout: NodeJS.Timeout | null = null;
const DEBOUNCE_DELAY = 50;
let tabStoreUnsubscribe: (() => void) | null = null;
let isActiveUnsubscribe: (() => void) | null = null; // unsubscribe fn for isActive-only subscription

// Utility shallow compare for primitive arrays – used by Zustand equalityFn so that
// a selector returning an array only triggers when one of the items actually changes.
const shallowArrayEqual = (a: unknown[] | undefined, b: unknown[] | undefined) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
};

// -----------------------------------------------------------------------------
// Selectors -------------------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Dedicated selector for the `isActive` flag so that only pure isActive changes
 * reach the specialised listener.
 */
const selectIsActive = (state: TabState) => state.isActive;

/**
 * Generic selector that omits `isActive`. We return a tuple of the remaining
 * primitives / references so that we can provide a custom shallow equality
 * function and avoid firing on `isActive`-only toggles.
 */
const selectGenericSlice = (state: TabState) => [
  state.tabId,
  state.url,
  state.title,
  state.isContentScriptActive,
  state.htmlProcessingStatus,
  state.lastProcessedHTML,
  state.lastError,
  state.searchState, // reference equality is enough – new object means change
];

export async function initTabStoreSync() {
  if (isSyncerInitialized) {
    console.warn("Syncer: TabStore synchronization is already initialized.");
    return;
  }
  console.log("Syncer: Initializing TabStore synchronization.");

  // Listener for BACKGROUND_STATE_UPDATE messages from the background script
  TypedMessenger.onMessage('BACKGROUND_STATE_UPDATE', (payload) => {
    console.log("Syncer: Received BACKGROUND_STATE_UPDATE from background.", payload);
    if (typeof payload.tabId === 'number') {
      if (payload.tabState === null) {
        // Tab was cleared/removed
        console.log(`Syncer: Tab ${payload.tabId} was cleared. Setting TabStore to error state.`);
        useTabStore.getState().setTabState(DEFAULT_ERROR_TAB_STATE);
      } else if (payload.tabState) {
        // Prevent feedback loop
        isApplyingRemoteUpdate = true;
        useTabStore.getState().setTabState(payload.tabState);
        isApplyingRemoteUpdate = false;
        console.log(`Syncer: TabStore updated with state for tab ${payload.tabId}`);
      } else {
        console.warn("Syncer: BACKGROUND_STATE_UPDATE received with invalid payload. Setting TabStore to error state.", payload);
        useTabStore.getState().setTabState(DEFAULT_ERROR_TAB_STATE);
      }
    } else {
      console.warn("Syncer: BACKGROUND_STATE_UPDATE received without valid tabId. Setting TabStore to error state.", payload);
      useTabStore.getState().setTabState(DEFAULT_ERROR_TAB_STATE);
    }
    return { success: true }; // Acknowledge message
  });

  // Subscribe to local TabStore changes to push updates back to ExtensionStore
  const store = useTabStore;

  // ---------------------------------------------------------------------------
  // Attribute-level listener: isActive
  // ---------------------------------------------------------------------------

  isActiveUnsubscribe = store.subscribe(
    selectIsActive,
    async (isActive, prevIsActive) => {
      if (isApplyingRemoteUpdate || isActive === prevIsActive) return;

      try {
        const { tabId, url } = store.getState();
        const response = await ApplicationMessenger.setActiveState(tabId, isActive, url);
        if (response.success) {
          console.log('Syncer: Successfully pushed isActive toggle to background.');
        } else {
          console.error('Syncer: Failed to push isActive toggle to background:', response.error);
        }
      } catch (e) {
        console.error('Syncer: Error pushing isActive change to background:', e);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Generic listener: everything except isActive
  // ---------------------------------------------------------------------------

  tabStoreUnsubscribe = store.subscribe(
    selectGenericSlice,
    async (currentSlice, prevSlice) => {
      if (isApplyingRemoteUpdate) return;

      // Early exit if slice actually equal (should be covered by equalityFn, but extra safety)
      if (shallowArrayEqual(currentSlice as unknown[], prevSlice as unknown[])) return;

      // Debounce updates to avoid spamming messages
      // if (pendingSyncTimeout) clearTimeout(pendingSyncTimeout);

      // pendingSyncTimeout = setTimeout(async () => {
        try {
          const fullState = store.getState();
          // Skip pushing the placeholder/error state to background – it has no real tab associated
          if (fullState.tabId === -1) {
            return;
          }
          const response = await ApplicationMessenger.sendTabStateUpdate(fullState.tabId, fullState);
          if (!response.success) {
            console.error('Syncer: Failed to push TabState to background:', response.error);
          }
        } catch (e) {
          console.error('Syncer: Error pushing TabState to background:', e);
        }
    //   }, DEBOUNCE_DELAY);
    },
    { equalityFn: shallowArrayEqual },
  );

  isSyncerInitialized = true;
  console.log("Syncer: TabStore synchronization message listeners and subscriptions initialized.");

  // Set an initial default/error state for TabStore until the first message from background arrives.
  const currentTabStoreState = useTabStore.getState();
  if (currentTabStoreState.tabId === -1) {
    console.log("Syncer: Setting TabStore to initial default/error state pending messages from background.")
    useTabStore.getState().setTabState(DEFAULT_ERROR_TAB_STATE);
  }

  console.log("Syncer: Requesting initial state from background script.");
  try {
    const response = await ApplicationMessenger.requestInitialState();
    if (response.success) {
      console.log("Syncer: UI_REQUEST_INITIAL_STATE message successfully sent and acknowledged by background.");
      isApplyingRemoteUpdate = true;
      useTabStore.getState().setTabState(response.data.tabState)
      isApplyingRemoteUpdate = false;
      console.log("Syncer: Updated TabState:", response.data.tabState);
    } else {
      console.error("Syncer: Failed to send UI_REQUEST_INITIAL_STATE or background reported an error:", response.error);
      // TabStore remains in default/error state if this fails, which is handled.
    }
  } catch (error) {
    console.error("Syncer: Error during initial state request process:", error);
    // TabStore remains in default/error state.
  }
}

export function cleanupTabStoreSync() {
  // Reset flags and cleanup
  isSyncerInitialized = false;
  if (pendingSyncTimeout) {
    clearTimeout(pendingSyncTimeout);
    pendingSyncTimeout = null;
  }
  // lastSyncedStateJson = null;
  if (tabStoreUnsubscribe) {
    tabStoreUnsubscribe();
    tabStoreUnsubscribe = null;
  }
  if (isActiveUnsubscribe) {
    isActiveUnsubscribe();
    isActiveUnsubscribe = null;
  }
  console.log("Syncer: TabStore synchronization flags reset. Subscriptions cleaned up.");
} 