# Modern Chrome Extension Architecture Example

## 1. Project Structure
```
browsez-extension/
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   ├── ExtensionStore.ts
│   │   └── backgroundSyncer.ts
│   │   └── actions/
│   ├── content/
│   │   ├── index.ts
│   │   ├── contentSyncer.ts
│   │   └── contentMessenger.ts
│   ├── ui/
│   │   ├── sidebar/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   ├── utils/
│   │   │   ├── tabStoreSyncer.ts
│   │   │   ├── App.tsx
│   │   │   ├── index.html
│   │   │   ├── index.tsx
│   │   ├── settings/
│   │   │   ├── App.tsx
│   │   │   └── index.tsx
│   ├── shared/
│   │   ├── state/
│   │   │   ├── store.ts
│   │   │   ├── slices/
│   │   │   └── types.ts
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── index.ts
│   │   │   └── endpoints.ts
│   │   ├── types/
│   │   │   ├── messages.ts
│   │   │   ├── extension.ts
│   │   │   └── ui.ts
│   │   └── utils/
│   │       └── messaging.ts
│   └── assets/
├── tools/
│   ├── build.ts
│   ├── dev.ts
│   └── webpack.config.ts
├── tests/
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## 2. Unified State Management

```typescript
// src/shared/state/store.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ExtensionState {
  isActive: boolean
  currentTab: Tab | null
  searchResults: SearchResult[]
  // Shared across ALL contexts
}

export const useExtensionStore = create<ExtensionState>()(
  devtools((set, get) => ({
    isActive: false,
    currentTab: null,
    searchResults: [],
    // Actions that work everywhere
  }))
)

// Works in background, content, AND UI!
```

## 3. Unified Build System

```typescript
// webpack.config.ts
export default {
  entry: {
    background: './src/background/index.ts',
    content: './src/content/index.ts',
    sidebar: './src/ui/sidebar/index.tsx',
    settings: './src/ui/settings/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    }
  },
  // Single config builds EVERYTHING
}
```

## 4. Type-Safe Messaging

```typescript
// src/shared/types/messages.ts
export interface ExtensionMessage<T = any> {
  type: MessageType
  payload: T
  source: 'background' | 'content' | 'ui'
  target: 'background' | 'content' | 'ui'
}

// src/shared/utils/messaging.ts
export class TypedMessenger {
  static async send<T>(message: ExtensionMessage<T>): Promise<any> {
    return chrome.runtime.sendMessage(message)
  }
  
  static onMessage<T>(
    type: MessageType,
    handler: (payload: T) => void
  ): void {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === type) {
        handler(message.payload)
      }
    })
  }
}
```

## 5. Shared Components

```tsx
// src/ui/shared/components/SearchResults.tsx
export const SearchResults: React.FC<SearchResultsProps> = ({ results }) => {
  // This component works in sidebar AND settings
  return (
    <div className="search-results">
      {results.map(result => (
        <SearchResultItem key={result.id} result={result} />
      ))}
    </div>
  )
}

// Used in both sidebar and settings
```

## 6. Hot Reload Development

```typescript
// tools/dev.ts
import { spawn } from 'child_process'

// Start webpack dev server for UI
const ui = spawn('webpack', ['serve', '--config', 'webpack.ui.config.js'])

// Watch and rebuild extension files
const extension = spawn('webpack', ['--watch', '--config', 'webpack.extension.config.js'])

// Auto-reload extension in Chrome
const reloader = spawn('web-ext', ['run', '--source-dir', 'dist'])
```

## 7. Comprehensive Testing

```typescript
// tests/integration/extension.test.ts
describe('Extension Integration', () => {
  test('background and content scripts communicate', async () => {
    const message = await sendMessageFromContent('search', { query: 'test' })
    expect(message.results).toBeDefined()
  })
  
  test('UI updates when background state changes', async () => {
    render(<SidebarApp />)
    // Test full integration
  })
})
```

## Benefits of This Architecture

✅ **Single Build System**: One command builds everything
✅ **Shared Code**: No duplication between scripts
✅ **Type Safety**: 100% TypeScript across all contexts  
✅ **Unified State**: Same state management everywhere
✅ **Hot Reload**: Fast development cycle
✅ **Component Reuse**: UI components work everywhere
✅ **Easy Testing**: Everything is testable
✅ **Maintainable**: Easy to add features and fix bugs 