import React, { useState, useEffect } from 'react';
import ChatView from './components/ChatView';
import InputArea from './components/InputArea';
import { buildDisplayConversation } from './utils/typesShared.js';
import { 
  createUserMessage, 
  createSystemMessage, 
  MessageActions, 
  ProcessingStatus, 
  SearchStatus,
  SearchTypes,
  createUItoBackgroundMessage
} from './utils/typesShared.js';

const ChatInterface = ({ tabState }) => {
  // Local state to manage the conversation
  const [localConversation, setLocalConversation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // When tabState changes, update our local conversation and loading state
  useEffect(() => {
    console.log("ChatInterface: tabState updated", tabState);
    if (tabState && tabState.searchState) {
      // Use the utility function to build the conversation display
      const displayConversation = buildDisplayConversation(tabState.searchState);
      setLocalConversation(displayConversation);
    } else {
      setLocalConversation([]);
    }
    
    if (tabState) {
      const isProcessing = tabState.htmlProcessingStatus === ProcessingStatus.PROCESSING;
      const isSearching = tabState.searchState && tabState.searchState.searchStatus === SearchStatus.SEARCHING;
      console.log(`ChatInterface: isLoading set to ${isProcessing || isSearching} (processing: ${isProcessing}, searching: ${isSearching})`);
      setIsLoading(isProcessing || isSearching);
    } else {
      setIsLoading(false);
    }
  }, [tabState]);

  // Handler for toggle activation of the extension
  const handleToggleActivation = async () => {
    try {
      console.log("Requesting toggle activation from background script");
      setIsLoading(true);
      
      const message = createUItoBackgroundMessage(MessageActions.TOGGLE_ACTIVATION);
      await chrome.runtime.sendMessage(message);
    } catch (e) {
      console.error("Error sending toggleActivation message:", e);
      setIsLoading(false);
    }
  };

  // Handler for sending a search query
  const handleSendMessage = async (content, searchType) => {
    if (!content.trim()) return;
    
    try {
      setIsLoading(true);
      // Navigation is reset by background script sending new conversation state
      
      const userMessage = createUserMessage(content);
      const systemMessage = createSystemMessage('Generating...');
      
      const filteredConversation = localConversation.filter(
        msg => msg.role !== 'navigation' && 
               !(msg.role === 'system' && (msg.content === 'No relevant results found.' || msg.content === 'Generating...'))
      );

      const updatedLocalConversation = [
        ...filteredConversation,
        userMessage,
        systemMessage
      ];
      setLocalConversation(updatedLocalConversation);
      
      console.log("Sending performSearch request to background script:", { searchString: content, searchType });
      
      const message = createUItoBackgroundMessage(MessageActions.PERFORM_SEARCH, {
        searchString: content,
        searchType: searchType === 'smart' ? SearchTypes.SMART : SearchTypes.BASIC
      });
      
      await chrome.runtime.sendMessage(message);
      
    } catch (error) {
      console.error("Error sending performSearch message:", error);
      const errorMessage = createSystemMessage(`Error during search: ${error.message}`);
      setLocalConversation(prev => [...prev.filter(msg => msg.content !== 'Generating...'), errorMessage]);
      setIsLoading(false);
    }
  };

  // Handler for clearing the chat
  const handleClearChat = async () => {
    try {
      setIsLoading(true);
      
      const message = createUItoBackgroundMessage(MessageActions.CLEAR_CHAT);
      await chrome.runtime.sendMessage(message);
      
      setLocalConversation([]);
    } catch (error) {
      console.error("Error sending clearChat message:", error);
      setIsLoading(false);
    }
  };

  // Handler for navigation buttons
  const handleNavigation = async (direction) => {
    try {
      console.log(`Requesting navigation from background script: ${direction}`);
      
      const message = createUItoBackgroundMessage(MessageActions.NAVIGATE, { direction });
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error("Error sending navigate message:", error);
    }
  };

  // Determine what to render based on active state
  if (!tabState || !tabState.isActive) {
    return (
      <div className="chat-interface inactive">
        <div className="chat-header">
          <h3>BrowsEZ</h3>
          <button 
            onClick={handleToggleActivation}
            className="toggle-button inactive"
            disabled={isLoading}
          >
            Activate
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

  // Active state UI
  return (
    <div className="chat-interface active">
      <div className="chat-header">
        <h3>BrowsEZ</h3>
        <button 
          onClick={handleToggleActivation}
          className="toggle-button active"
          disabled={isLoading}
        >
          Deactivate
        </button>
      </div>
      
      <ChatView 
        conversation={localConversation} 
        onNavigate={handleNavigation}
      />
      
      <div className="input-container">
        <InputArea 
          disabled={isLoading} 
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
        />
      </div>
    </div>
  );
};

export default ChatInterface; 