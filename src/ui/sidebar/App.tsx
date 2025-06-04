import React, { useEffect, useCallback } from 'react';
import { useTabStore } from '@shared/state/tabStore';
import { ChatInterface } from './components/ChatInterface';
import { initTabStoreSync, cleanupTabStoreSync } from './tabStoreSyncer';
import type { TabState } from '@shared/types/extension';

const App: React.FC = () => {
  console.log("BrowsEZ Extension Sidebar: App.tsx is loading. Will rely on TabStore.");

  // App now exclusively uses TabStore.
  // tabStoreSyncer.ts is responsible for keeping TabStore in sync with ExtensionStore.
  const tabStore = useTabStore();
  const { tabId: currentTabIdFromTabStore, htmlProcessingStatus } = tabStore;

  // initTabStoreSync now handles the initial state request.
  // We just need to call it on mount and cleanup on unmount.
  useEffect(() => {
    console.log("BrowsEZ Sidebar App: Triggering TabStore synchronization.");
    // initTabStoreSync is now async, so we handle the promise.
    const initialize = async () => {
      try {
        await initTabStoreSync();
        console.log("BrowsEZ Sidebar App: TabStore synchronization process initiated.");
      } catch (error) {
        console.error("BrowsEZ Sidebar App: Error during TabStore synchronization initialization:", error);
      }
    };

    initialize();

    return () => {
      console.log("BrowsEZ Sidebar App: Cleaning up TabStore synchronization.");
      cleanupTabStoreSync();
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount.

  // Loading state is now determined solely by TabStore's state
  // The tabStore.tabId === -1 is a convention from tabStoreSyncer for uninitialized/error state.
  if (currentTabIdFromTabStore === -1 && htmlProcessingStatus !== 'error') {
    return (
      <div className="app-container loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading BrowsEZ sidebar...</p>
          <p>(Waiting for initial state)</p>
        </div>
      </div>
    );
  } else if (currentTabIdFromTabStore === -1 && htmlProcessingStatus === 'error') { // Explicit error state from TabStore
    return (
      <div className="app-container error">
        <div className="error-icon">⚠️</div>
        <h3>Initialization Error</h3>
        <p>{tabStore.searchState.llmAnswer || "Could not load extension data. Please try refreshing the tab or contacting support."}</p>
      </div>
    );
  }

  // Render ChatInterface, which will also use useTabStore or receive props from it.
  return (
    <div className="app-container">
      <ChatInterface />
    </div>
  );
};

export default App; 