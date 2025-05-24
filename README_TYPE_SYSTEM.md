# BrowsEZ Extension Type System

## Overview

The BrowsEZ extension uses a unified type system to ensure consistent interfaces between different components:

1. Background script (`background.js`)
2. Content scripts (`content.js`)
3. React UI components (`App.jsx`, `ChatInterface.jsx`, etc.)

## Design Pattern

We use a hybrid approach that works with both ES Module imports (for background.js and React) and non-module context (for content scripts):

### The Shared Types Module

The core of this system is `typesShared.js`, which:

- Defines all types, constants, and utility functions
- Exposes them through both ES Module exports and global window object
- Creates a global namespace `window.BrowsEZ` accessible in content scripts

## How It Works

### In Manifest.json

The `typesShared.js` file is configured in manifest.json as a content script that loads before `content.js`:

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["seedrandom.min.js", "sidebar_ui/src/utils/typesShared.js", "content.js"]
  }
]
```

### In Background Script

The background script uses ES Module imports:

```javascript
import {
  MessageActions,
  ProcessingStatus,
  SearchStatus,
  createDefaultTabState,
  // ...
} from './sidebar_ui/src/utils/typesShared.js';
```

### In React Components

React components also use ES Module imports:

```javascript
import {
  createUserMessage,
  createSystemMessage,
  MessageActions,
  SearchTypes,
  // ...
} from './utils/typesShared.js';
```

### In Content Scripts

Content scripts access the same functions through the global namespace:

```javascript
// The window.BrowsEZ namespace has already been created by typesShared.js
const { MessageActions } = window.BrowsEZ;
  
const message = window.BrowsEZ.createContentToBackgroundMessage(
  MessageActions.SEND_HTML,
  { html, url: window.location.href }
);
```

## Key Benefits

1. **Single Source of Truth**: All types and constants are defined in one place
2. **Compatibility**: Works with both ES Modules and content scripts
3. **Type Safety**: Consistent interfaces throughout the codebase
4. **Documentation**: JSDoc comments provide type information
5. **Maintainability**: Changes to messages or types only need to be made in one file

## Types and Constants

The shared module defines:

### Constants
- `MessageActions`: Message types for communication between components
- `SearchTypes`: Types of search (smart/basic)
- `ProcessingStatus`: HTML processing statuses
- `SearchStatus`: Search operation statuses
- `MessageRoles`: Roles in conversation (user/system/assistant)

### State Definitions
- `TabState`: Complete state for a tab
- `SearchState`: Search state for a tab
- `ConversationMessage`: A message in the conversation

### Helper Functions
- Message creators (createUserMessage, etc.)
- State creators (createDefaultTabState, etc.)
- Utility functions (buildDisplayConversation, etc.)

## Best Practices

1. Always use the constants and helper functions when sending messages
2. Add new message types to the MessageActions object
3. Keep typesShared.js as the single source of truth for interfaces
4. Add JSDoc comments when adding new types or functions 