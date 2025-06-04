import React, { useEffect, useCallback } from 'react';
import { useTabStore, selectDisplayConversation, selectIsTabLoading } from '@shared/state/tabStore';
import { SearchMessenger, BackgroundMessenger } from '@shared/utils/messaging';
import { ChatView } from './ChatView';
import { InputArea } from './InputArea';

export const ChatInterface: React.FC = () => {
  const tabState = useTabStore();
  const isLoading = selectIsTabLoading(tabState);

  // Toggle extension activation
  const handleToggleActivation = useCallback(async () => {
    try {
      console.log("Requesting toggle activation from background script");
      
      const response = await BackgroundMessenger.toggleActivation();
      
      if (!response.success) {
        console.error("Failed to toggle activation:", response.error);
      }
    } catch (error) {
      console.error("Error toggling activation:", error);
    }
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
      
      const systemMessage = {
        role: 'system' as const,
        content: 'Searching...',
        timestamp: new Date().toISOString(),
      };
      
      if (tabState.searchState) {
        // Filter out previous navigation and temporary messages
        const filteredConversation = (tabState.searchState.conversation || []).filter(
          (msg: any) => msg.role !== 'navigation' && 
          !(msg.role === 'system' && (msg.content === 'No relevant results found.' || msg.content === 'Searching...'))
        );

        const updatedConversation = [
          ...filteredConversation,
          userMessage,
          systemMessage
        ];
        
        tabState.updateSearchState({
          conversation: updatedConversation,
          searchStatus: 'searching'
        });
      }
      
      console.log("Sending search request:", { content, searchType });
      
      const response = await SearchMessenger.performSearch(content, searchType);
      
      if (!response.success) {
        console.error("Search failed:", response.error);
        // Update with error message
        if (tabState.searchState) {
          const errorMessage = {
            role: 'system' as const,
            content: `Search failed: ${response.error}`,
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
      const response = await SearchMessenger.clearChat();
      
      if (!response.success) {
        console.error("Failed to clear chat:", response.error);
      }
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  }, []);

  // Navigation handler
  const handleNavigation = useCallback(async (direction: 'next' | 'prev') => {
    try {
      console.log(`Requesting navigation: ${direction}`);
      
      const response = await SearchMessenger.navigate(direction);
      
      if (!response.success) {
        console.error("Navigation failed:", response.error);
      }
    } catch (error) {
      console.error("Error during navigation:", error);
    }
  }, []);

  // Check if extension is still initializing
  const isInitializing = tabState.tabId < 0;

  // Render initializing state
  if (isInitializing) {
    return (
      <div className="chat-interface initializing">
        <div className="chat-header">
          <h3>BrowsEZ</h3>
          <button 
            className="toggle-button disabled"
            disabled={true}
          >
            Initializing...
          </button>
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
          <button 
            onClick={handleToggleActivation}
            className="toggle-button inactive"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Activate'}
          </button>
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
        <button 
          onClick={handleToggleActivation}
          className="toggle-button active"
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Deactivate'}
        </button>
      </div>
      
      <ChatView 
        onNavigate={handleNavigation}
      />
      
      <div className="input-container">
        <InputArea 
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
        />
      </div>
    </div>
  );
}; 