/**
 * SHARED TYPES MODULE
 * 
 * This file provides type definitions and utilities in a format that works for both
 * modern ES modules (background and React) and content scripts.
 * 
 * It uses a pattern that defines functions and constants on a global object 
 * but also exports them for ES module compatibility.
 */

// Create or get the global namespace, only if window is defined
let BrowsEZ = {};
if (typeof window !== 'undefined') {
  BrowsEZ = window.BrowsEZ = window.BrowsEZ || {};
}

// --------- STATE STRUCTURE DEFINITIONS ---------

/**
 * @typedef {Object} ConversationMessage
 * @property {string} role - The role of the message sender ('user', 'assistant', 'system', 'navigation')
 * @property {string} [content] - The text content of the message (required for user/assistant/system)
 * @property {string} timestamp - ISO timestamp when the message was created
 * @property {number} [currentPosition] - For navigation messages, the current result position
 * @property {number} [totalResults] - For navigation messages, the total results available
 */

/**
 * @typedef {Object} SearchState
 * @property {string|null} lastSearch - The most recent search query
 * @property {number} currentPosition - Current position in search results (1-based)
 * @property {number} totalResults - Total number of search results found
 * @property {string} searchStatus - Status of the search ('idle', 'searching', 'showing_results', 'error')
 * @property {Array<ConversationMessage>} conversation - Array of conversation messages
 * @property {Array<Object>} searchResults - Array of search result elements from server
 * @property {string} llmAnswer - LLM-generated answer for the search query
 * @property {Array<Object>} navigationLinks - Navigation links extracted from the search results
 */

/**
 * @typedef {Object} TabState
 * @property {number|null} tabId - The ID of the tab this state belongs to
 * @property {boolean} isActive - Whether the extension is active for this tab
 * @property {string} htmlProcessingStatus - Status of HTML processing ('not_sent', 'processing', 'ready', 'error')
 * @property {string|null} lastProcessedHTML - ISO timestamp of last successful HTML processing
 * @property {SearchState} searchState - The search state for this tab
 */

// --------- MESSAGE ACTION CONSTANTS ---------

const MessageActions = {
  // Background to/from React UI
  UI_REQUEST_INITIAL_STATE: 'uiLoadedGetInitialState',
  BACKGROUND_STATE_UPDATE: 'backgroundInitiatedStateUpdate',
  SEARCH_COMPLETE: 'searchComplete',
  
  // React UI to Background
  TOGGLE_ACTIVATION: 'toggleActivation',
  PERFORM_SEARCH: 'performSearch',
  CLEAR_CHAT: 'clearChat',
  NAVIGATE: 'navigate',
  
  // Background to/from Content
  SEND_HTML: 'sendHTML',
  GET_PAGE_HTML: 'getPageHTML',
  HIGHLIGHT_ELEMENT: 'highlightElement',
  REMOVE_HIGHLIGHTS: 'removeHighlights',
  NAVIGATE_TO_LINK: 'navigateToLink',
  CLEANUP_SESSION: 'cleanupSessionOnServer',
  GET_TAB_ID: 'getTabId'
};

// Search types
const SearchTypes = {
  SMART: 'smart',   // Uses LLM filtering
  BASIC: 'basic'    // Basic search without LLM
};

// Processing status values
const ProcessingStatus = {
  NOT_SENT: 'not_sent',
  PROCESSING: 'processing',
  READY: 'ready',
  ERROR: 'error'
};

// Search status values
const SearchStatus = {
  IDLE: 'idle',
  SEARCHING: 'searching',
  SHOWING_RESULTS: 'showing_results',
  ERROR: 'error'
};

// Message roles
const MessageRoles = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  NAVIGATION: 'navigation'
};

// --------- DEFAULT STATE CREATORS ---------

/**
 * Creates a default SearchState object
 * @returns {SearchState} A new SearchState object with default values
 */
function createDefaultSearchState() {
  return {
    lastSearch: null,
    currentPosition: 0,
    totalResults: 0,
    searchStatus: 'idle',
    conversation: [],
    searchResults: [],
    llmAnswer: '',
    navigationLinks: []
  };
}

/**
 * Creates a default TabState object
 * @param {number|null} tabId - The ID of the tab this state belongs to
 * @param {boolean} isActive - Whether the extension is active for this tab
 * @returns {TabState} A new TabState object with default values
 */
function createDefaultTabState(tabId = null, isActive = false) {
  return {
    tabId,
    isActive,
    htmlProcessingStatus: 'not_sent',
    lastProcessedHTML: null,
    searchState: createDefaultSearchState()
  };
}

// --------- MESSAGE CREATORS ---------

/**
 * Creates a properly formatted UI message to background
 * @param {string} action - The action to perform (use MessageActions constants)
 * @param {Object} payload - Additional data for the action
 * @returns {Object} Formatted message object
 */
function createUItoBackgroundMessage(action, payload = {}) {
  return {
    action,
    ...payload
  };
}

/**
 * Creates a properly formatted background to UI message
 * @param {string} action - The action being performed (use MessageActions constants)
 * @param {number} tabId - The ID of the tab this message concerns
 * @param {TabState} tabState - The updated tab state
 * @param {Object} additionalData - Any additional data to include
 * @returns {Object} Formatted message object
 */
function createBackgroundToUIMessage(action, tabId, tabState, additionalData = {}) {
  return {
    action,
    tabId,
    tabState,
    ...additionalData
  };
}

/**
 * Creates a properly formatted content script to background message
 * @param {string} action - The action to perform (use MessageActions constants)
 * @param {Object} payload - Additional data for the action
 * @returns {Object} Formatted message object
 */
function createContentToBackgroundMessage(action, payload = {}) {
  return {
    action,
    ...payload
  };
}

/**
 * Creates a properly formatted background to content script message
 * @param {string} action - The action to perform (use MessageActions constants)
 * @param {Object} payload - Additional data for the action
 * @returns {Object} Formatted message object
 */
function createBackgroundToContentMessage(action, payload = {}) {
  return {
    action,
    ...payload
  };
}

// --------- CONVERSATION MESSAGE CREATORS ---------

/**
 * Creates a user message for the conversation
 * @param {string} content - Message content
 * @returns {ConversationMessage} Formatted conversation message
 */
function createUserMessage(content) {
  return {
    role: MessageRoles.USER,
    content,
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates a system message for the conversation
 * @param {string} content - Message content
 * @returns {ConversationMessage} Formatted conversation message
 */
function createSystemMessage(content) {
  return {
    role: MessageRoles.SYSTEM,
    content,
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates an assistant message for the conversation
 * @param {string} content - Message content
 * @returns {ConversationMessage} Formatted conversation message
 */
function createAssistantMessage(content) {
  return {
    role: MessageRoles.ASSISTANT,
    content,
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates a navigation message for the conversation
 * @param {number} currentPosition - Current position in results
 * @param {number} totalResults - Total number of results
 * @returns {ConversationMessage} Formatted conversation message
 */
function createNavigationMessage(currentPosition, totalResults) {
  return {
    role: MessageRoles.NAVIGATION,
    currentPosition,
    totalResults,
    timestamp: new Date().toISOString()
  };
}

// --------- CONVERSATION DISPLAY UTILITIES ---------

/**
 * Builds a complete conversation for display from raw conversation data and search state
 * @param {SearchState} searchState - The current search state
 * @returns {Array<ConversationMessage>} The processed conversation ready for display
 */
function buildDisplayConversation(searchState) {
  let currentConversation = [...(searchState.conversation || [])];

  // Remove any existing navigation, specific assistant, or system messages that will be re-added
  currentConversation = currentConversation.filter(msg => 
    msg.role !== MessageRoles.NAVIGATION &&
    !(msg.role === MessageRoles.ASSISTANT && msg.content === searchState.llmAnswer && searchState.llmAnswer) && 
    !(msg.role === MessageRoles.SYSTEM && msg.content === 'No relevant results found.')
  );

  // Add LLM answer if available
  if (searchState.searchStatus === SearchStatus.SHOWING_RESULTS && searchState.llmAnswer) {
    if (!currentConversation.some(msg => msg.role === MessageRoles.ASSISTANT && msg.content === searchState.llmAnswer)) {
      currentConversation.push(createAssistantMessage(searchState.llmAnswer));
    }
  }

  // Add navigation controls message or no results message
  if (searchState.searchStatus === SearchStatus.SHOWING_RESULTS) {
    if (searchState.totalResults > 0) {
      currentConversation.push(
        createNavigationMessage(
          searchState.currentPosition > 0 ? searchState.currentPosition : 1,
          searchState.totalResults
        )
      );
    } else if (!searchState.llmAnswer) { 
      currentConversation.push(createSystemMessage('No relevant results found.'));
    }
  }
  
  return currentConversation;
}

// Assign to global namespace for content scripts, only if window is defined
if (typeof window !== 'undefined') {
  BrowsEZ.MessageActions = MessageActions;
  BrowsEZ.SearchTypes = SearchTypes;
  BrowsEZ.ProcessingStatus = ProcessingStatus;
  BrowsEZ.SearchStatus = SearchStatus;
  BrowsEZ.MessageRoles = MessageRoles;
  BrowsEZ.createDefaultSearchState = createDefaultSearchState;
  BrowsEZ.createDefaultTabState = createDefaultTabState;
  BrowsEZ.createUItoBackgroundMessage = createUItoBackgroundMessage;
  BrowsEZ.createBackgroundToUIMessage = createBackgroundToUIMessage;
  BrowsEZ.createContentToBackgroundMessage = createContentToBackgroundMessage;
  BrowsEZ.createBackgroundToContentMessage = createBackgroundToContentMessage;
  BrowsEZ.createUserMessage = createUserMessage;
  BrowsEZ.createSystemMessage = createSystemMessage;
  BrowsEZ.createAssistantMessage = createAssistantMessage;
  BrowsEZ.createNavigationMessage = createNavigationMessage;
  BrowsEZ.buildDisplayConversation = buildDisplayConversation;
}

// Export for ES module usage
export {
  MessageActions,
  SearchTypes,
  ProcessingStatus,
  SearchStatus,
  MessageRoles,
  createDefaultSearchState,
  createDefaultTabState,
  createUItoBackgroundMessage,
  createBackgroundToUIMessage,
  createContentToBackgroundMessage,
  createBackgroundToContentMessage,
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createNavigationMessage,
  buildDisplayConversation
}; 