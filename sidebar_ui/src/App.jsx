import React, { useState, useEffect, useCallback } from 'react';
import ChatInterface from './ChatInterface';
import { 
  createDefaultTabState, 
  createSystemMessage, 
  MessageActions,
  ProcessingStatus,
  SearchStatus,
  createUItoBackgroundMessage
} from './utils/typesShared.js';

function App() {
  console.log("Find Extension: React app is loading");

  const [tabState, setTabState] = useState(createDefaultTabState());

  // Request initial state from background script
  const requestInitialStateFromBackground = useCallback(() => {
    console.log("Find Extension: App.jsx Requesting initial state from background script.");
    
    const message = createUItoBackgroundMessage(MessageActions.UI_REQUEST_INITIAL_STATE);
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Find Extension: Error receiving initial state:", chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success && response.tabState) {
        console.log("Find Extension: App.jsx Received tab state:", response.tabState);
        setTabState(response.tabState); 
      } else {
        console.error("Find Extension: App.jsx Failed to get initial state or invalid response:", response);
        
        // Create error state
        const errorState = createDefaultTabState(
          response?.tabState?.tabId || null,
          false
        );
        errorState.htmlProcessingStatus = ProcessingStatus.ERROR;
        errorState.searchState.searchStatus = SearchStatus.ERROR;
        errorState.searchState.conversation = [
          createSystemMessage('Failed to load initial state from background.')
        ];
        
        setTabState(errorState);
      }
    });
  }, []);

  useEffect(() => {
    console.log("Find Extension: App.jsx useEffect for listeners running");

    // Initial request for state
    requestInitialStateFromBackground();

    const messageListener = (message, sender, sendResponse) => {
      console.log("Find Extension: App.jsx Received message from background:", message);
      
      if (message.action === MessageActions.BACKGROUND_STATE_UPDATE) {
        // Ensure the message contains a valid tabState
        if (message.tabState) {
          setTabState(message.tabState);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      console.log("Find Extension: Cleaning up App.jsx message listener");
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [requestInitialStateFromBackground]);

  return (
    <div className="AppContainer">
      <ChatInterface tabState={tabState} />
    </div>
  );
}

export default App; 