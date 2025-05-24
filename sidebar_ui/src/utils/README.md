# BrowsEZ Extension Type System

## Overview

This directory contains utility files that standardize the data structures and communication patterns used throughout the BrowsEZ browser extension. The goal is to maintain consistent interfaces between the different components of the extension:

- Background script (`background.js`)
- Content scripts (`content.js`)
- React UI (`App.jsx`, `ChatInterface.jsx`, etc.)

## Key Files

- **`typesShared.js`**: Defines standardized types, message formats, and utility functions that work in both ES modules and content scripts
- **`conversationUtils.js`**: Conversation display and formatting utilities

## Design Patterns

### State Management

The extension follows a centralized state management pattern:

1. **Background Script as State Manager**: `background.js` is the only component that:
   - Communicates with the server
   - Accesses browser storage APIs
   - Communicates directly with browser APIs
   - Delivers the state of each tab to the UI

2. **UI as State Consumer**: The React components:
   - Receive state updates via message passing
   - Use utility functions to format and display data
   - Send actions to the background script

3. **Content Script as DOM Interface**: The content scripts:
   - Interact with the page DOM
   - Send page data to the background script
   - Apply visual changes based on commands from background script

### Message Passing

All communication between components uses standardized message formats:

1. **Action Constants**: All message types are defined as constants in `MessageActions`
2. **Message Creators**: Helper functions create properly formatted messages
3. **Typed Payloads**: Message payloads follow consistent formats

## Using the Type System

### In Background Script

```javascript
import { 
  createBackgroundToUIMessage,
  MessageActions,
  ProcessingStatus 
} from './sidebar_ui/src/utils/typesShared.js';

// Send state update to UI
const message = createBackgroundToUIMessage(
  MessageActions.BACKGROUND_STATE_UPDATE,
  tabId, 
  tabState
);
chrome.runtime.sendMessage(message);
```

### In React Components

```javascript
import { 
  createUItoBackgroundMessage,
  MessageActions,
  SearchTypes
} from './utils/typesShared.js';

// Send search request
const message = createUItoBackgroundMessage(
  MessageActions.PERFORM_SEARCH,
  {
    searchString: query,
    searchType: SearchTypes.SMART
  }
);
chrome.runtime.sendMessage(message);
```

### In Content Script

Content scripts can access the shared types through the global namespace:

```javascript
// Access the message actions
const { MessageActions } = window.BrowsEZ;

// Create a message to background
const message = window.BrowsEZ.createContentToBackgroundMessage(
  MessageActions.SEND_HTML,
  { html, url: window.location.href }
);
chrome.runtime.sendMessage(message);
```

## Type Definitions

The system defines several standard types:

1. **TabState**: The complete state for a tab
2. **SearchState**: Search-related state for a tab
3. **ConversationMessage**: A message in the chat interface

See JSDoc comments in `typesShared.js` for detailed type definitions.

## Benefits

- **Consistency**: Standardized interfaces throughout the codebase
- **Type Safety**: Well-defined structures help catch errors early
- **Maintainability**: Easier to understand and modify the codebase
- **Testability**: Clear interfaces make components easier to test in isolation 