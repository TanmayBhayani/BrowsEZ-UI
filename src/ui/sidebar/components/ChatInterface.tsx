import React, { useEffect, useCallback } from 'react';
import { useTabStore, selectDisplayConversation, selectIsTabLoading, initialSearchState } from '@shared/state/tabStore';
import { ApplicationMessenger } from '@shared/utils/messaging';
import { ChatView } from './ChatView';
import { InputArea } from './InputArea';

export const ChatInterface: React.FC = () => {
  const tabState = useTabStore();
  const isLoading = selectIsTabLoading(tabState);

  // Toggle extension activation
  const handleToggleActivation = useCallback(async () => {
    tabState.toggleActiveState();
  }, [tabState.tabId]);

  // Open settings page
  const handleOpenSettings = useCallback(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }, []);

  // Send search message
  const handleSendMessage = useCallback(async (content: string, searchType: 'smart' | 'basic') => {
    if (!content.trim() || tabState.tabId < 0) return;
    
    try {
      // Update conversation immediately in store for responsiveness
      const userMessage = {
        role: 'user' as const,
        content,
        timestamp: new Date().toISOString(),
      };
      
      if (tabState.searchState) {
        // Filter out previous navigation and temporary messages
        const filteredConversation = (tabState.searchState.conversation || []).filter(
          (msg: any) => msg.role !== 'navigation' && 
          !(msg.role === 'system' && msg.content === 'No relevant results found.')
        );

        const updatedConversation = [
          ...filteredConversation,
          userMessage
        ];
        
        tabState.updateSearchState({
          conversation: updatedConversation
        });
      }
      
      console.log("Sending search request:", { content, searchType });
      
      const response = await ApplicationMessenger.performSearch(content, searchType, tabState.tabId);
      
      if (!response.success) {
        console.error("Search failed:", response.error);
        // Update with error message
        if (tabState.searchState) {
          let errorContent = `Search failed: ${response.error}`;
          
          // Check if it's a token limit error
          if (response.error?.includes('Token limit exceeded') || response.error?.includes('429')) {
            errorContent = `⚠️ Token Limit Reached\n\nYou have reached your monthly token limit. To continue using BrowsEZ:\n\n• Wait until next month when your limit resets\n• Upgrade to a paid plan for higher limits\n\nView your usage in Settings.`;
          }
          
          const errorMessage = {
            role: 'system' as const,
            content: errorContent,
            timestamp: new Date().toISOString(),
          };
          
          const errorConversation = [
            ...(tabState.searchState.conversation || []).filter(msg => msg.content !== 'Searching...'),
            errorMessage
          ];
          
          tabState.updateSearchState({
            conversation: errorConversation,
            searchStatus: 'error'
          });
          
          // Open settings page if it's a token limit error
          if (response.error?.includes('Token limit exceeded')) {
            setTimeout(() => {
              chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
            }, 2000);
          }
        }
      }
    } catch (error) {
      console.error("Error during search:", error);
      if (tabState.searchState) {
        const errorMessage = {
          role: 'system' as const,
          content: `Error during search: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        };
        
        const errorConversation = [
          ...(tabState.searchState.conversation || []).filter(msg => msg.content !== 'Searching...'),
          errorMessage
        ];
        
        tabState.updateSearchState({
          conversation: errorConversation,
          searchStatus: 'error'
        });
      }
    }
  }, [tabState]);

  // Clear chat
  const handleClearChat = useCallback(async () => {
    try {
      // Clear chat locally; syncer will propagate
      tabState.updateSearchState(initialSearchState);
      // remove any highlights on page
      await ApplicationMessenger.removeHighlights();
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  }, []);

  // Navigation handler
  const handleNavigation = useCallback(async (direction: 'next' | 'prev') => {
    try {
      // Compute next/prev position locally
      const { searchState } = tabState;
      if (!searchState || searchState.totalResults === 0) return;
      let newPos = searchState.currentPosition;
      if (direction === 'next' && newPos < searchState.totalResults) newPos += 1;
      if (direction === 'prev' && newPos > 1) newPos -= 1;

      // Update position only if it has changed; but still highlight the element even if unchanged.
      const positionChanged = newPos !== searchState.currentPosition;
      if (positionChanged) {
        tabState.updateSearchPosition(newPos);
      }

      // Always attempt to highlight the element corresponding to the current/updated position.
      const element = searchState.searchResults[newPos - 1];
      if (element) {
        const isLink = element.tag === 'a' || !!(element.attributes?.href) || (element.attributes && 'href' in element.attributes);
        await ApplicationMessenger.highlightElement(element, isLink);
      }
    } catch (error) {
      console.error("Error during navigation:", error);
    }
  }, [tabState]);

  // Check if extension is still initializing
  const isInitializing = tabState.tabId < 0;

  // Render initializing state
  if (isInitializing) {
    return (
      <div className="chat-interface initializing">
        <div className="chat-header">
          <h3>BrowsEZ</h3>
          <div className="header-controls">
            <button 
              onClick={handleOpenSettings}
              className="settings-button"
              title="Settings"
              aria-label="Open settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19.14,12.94a7.14,7.14,0,0,0,.05-.94,7.14,7.14,0,0,0-.05-.94l2.11-1.65a.5.5,0,0,0,.12-.64l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.28,7.28,0,0,0-1.63-.94l-.38-2.65A.5.5,0,0,0,13,1.5H11a.5.5,0,0,0-.49.41L10.13,4.56a7.28,7.28,0,0,0-1.63.94l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.64L5.64,11.06a7.14,7.14,0,0,0-.05.94,7.14,7.14,0,0,0,.05.94L3.53,14.59a.5.5,0,0,0-.12.64l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.28,7.28,0,0,0,1.63.94l.38,2.65A.5.5,0,0,0,11,22.5h2a.5.5,0,0,0,.49-.41l.38-2.65a7.28,7.28,0,0,0,1.63-.94l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0,.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" fill="currentColor"/>
              </svg>
            </button>
            <button 
              className="toggle-button disabled"
              disabled={true}
            >
              Initializing...
            </button>
          </div>
        </div>
        
        <div className="inactive-message">
          <div className="inactive-icon">⏳</div>
          <h4>Extension Initializing</h4>
          <p>Please wait while BrowsEZ connects to the current tab...</p>
        </div>
      </div>
    );
  }

  // Render inactive state
  if (!tabState.isActive) {
    return (
      <div className="chat-interface inactive">
        <div className="chat-header">
          <h3>BrowsEZ</h3>
          <div className="header-controls">
            <button 
              onClick={handleOpenSettings}
              className="settings-button"
              title="Settings"
              aria-label="Open settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19.14,12.94a7.14,7.14,0,0,0,.05-.94,7.14,7.14,0,0,0-.05-.94l2.11-1.65a.5.5,0,0,0,.12-.64l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.28,7.28,0,0,0-1.63-.94l-.38-2.65A.5.5,0,0,0,13,1.5H11a.5.5,0,0,0-.49.41L10.13,4.56a7.28,7.28,0,0,0-1.63.94l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.64L5.64,11.06a7.14,7.14,0,0,0-.05.94,7.14,7.14,0,0,0,.05.94L3.53,14.59a.5.5,0,0,0-.12.64l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.28,7.28,0,0,0,1.63.94l.38,2.65A.5.5,0,0,0,11,22.5h2a.5.5,0,0,0,.49-.41l.38-2.65a7.28,7.28,0,0,0,1.63-.94l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0,.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" fill="currentColor"/>
              </svg>
            </button>
            <button 
              onClick={handleToggleActivation}
              className="toggle-button inactive"
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Activate'}
            </button>
          </div>
        </div>
        
        <div className="inactive-message">
          <div className="inactive-icon">🔍</div>
          <h4>Extension Inactive</h4>
          <p>Click 'Activate' to enable the BrowsEZ extension for this website.</p>
        </div>
      </div>
    );
  }

  // Render active state
  return (
    <div className="chat-interface active">
      <div className="chat-header">
        <h3>BrowsEZ</h3>
        <div className="header-controls">
          <button 
            onClick={handleOpenSettings}
            className="settings-button"
            title="Settings"
            aria-label="Open settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19.14,12.94a7.14,7.14,0,0,0,.05-.94,7.14,7.14,0,0,0-.05-.94l2.11-1.65a.5.5,0,0,0,.12-.64l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.28,7.28,0,0,0-1.63-.94l-.38-2.65A.5.5,0,0,0,13,1.5H11a.5.5,0,0,0-.49.41L10.13,4.56a7.28,7.28,0,0,0-1.63.94l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.64L5.64,11.06a7.14,7.14,0,0,0-.05.94,7.14,7.14,0,0,0,.05.94L3.53,14.59a.5.5,0,0,0-.12.64l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.28,7.28,0,0,0,1.63.94l.38,2.65A.5.5,0,0,0,11,22.5h2a.5.5,0,0,0,.49-.41l.38-2.65a7.28,7.28,0,0,0,1.63-.94l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0,.12-.64ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" fill="currentColor"/>
            </svg>
          </button>
          <button 
            onClick={handleToggleActivation}
            className="toggle-button active"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Deactivate'}
          </button>
        </div>
      </div>
      
      <ChatView 
        onNavigate={handleNavigation}
      />
      
      {/* Generating indicator displayed only while searching */}
      {tabState.searchState?.searchStatus === 'searching' && (
        <div className="generating-indicator">Generating</div>
      )}
      
      <div className="input-container">
        <InputArea 
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
        />
      </div>
    </div>
  );
}; 