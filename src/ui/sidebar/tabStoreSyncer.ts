import { useTabStore } from '@shared/state/tabStore';
import type { TabState } from '@shared/types/extension';
import { TypedMessenger, BackgroundMessenger } from '@shared/utils/messaging';

// Define a default/error state for TabStore when no valid tab is active or found
const DEFAULT_ERROR_TAB_STATE: TabState = {
  tabId: -1,
  url: '',
  title: 'Error: Tab Not Loaded',
  isActive: false,
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

export async function initTabStoreSync() {
  // if (isSyncerInitialized) {
  //   console.warn("Syncer: TabStore synchronization is already initialized.");
  //   return;
  // }
  console.log("Syncer: Initializing TabStore synchronization.");

  // Listener for BACKGROUND_STATE_UPDATE messages from the background script
  TypedMessenger.onMessage('BACKGROUND_STATE_UPDATE', (payload) => {
    console.log("Syncer: Received BACKGROUND_STATE_UPDATE from background.", payload);
    if (payload.tabState && typeof payload.tabId === 'number') {
      // Directly set the TabStore with the complete state for the current tab
      useTabStore.getState().setTabState(payload.tabState);
      console.log(`Syncer: TabStore updated with state for tab ${payload.tabId}`);
    } else {
      console.warn("Syncer: BACKGROUND_STATE_UPDATE received with invalid payload. Setting TabStore to error state.", payload);
      useTabStore.getState().setTabState(DEFAULT_ERROR_TAB_STATE);
    }
    return { success: true }; // Acknowledge message
  });

  isSyncerInitialized = true;
  console.log("Syncer: TabStore synchronization message listeners initialized.");

  // Set an initial default/error state for TabStore until the first message from background arrives.
  const currentTabStoreState = useTabStore.getState();
  if (currentTabStoreState.tabId === -1) {
    console.log("Syncer: Setting TabStore to initial default/error state pending messages from background.")
    useTabStore.getState().setTabState(DEFAULT_ERROR_TAB_STATE);
  }

    console.log("Syncer: Requesting initial state from background script.");
    try {
      const response = await BackgroundMessenger.getInitialState();
      if (response.success) {
        console.log("Syncer: UI_REQUEST_INITIAL_STATE message successfully sent and acknowledged by background.");
        useTabStore.getState().setTabState(response.data.tabState)
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
  // Reset flags for potential remounts or re-initializations
  isSyncerInitialized = false;
  console.log("Syncer: TabStore synchronization flags reset. Listeners remain passive but will be re-evaluated on next init.");
} 