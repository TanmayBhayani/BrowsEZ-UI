import React, { useState } from 'react';
import { useTabStore, selectIsTabLoading } from '@shared/state/tabStore';

interface InputAreaProps {
  onSendMessage: (content: string, searchType: 'smart' | 'basic') => void;
  onClearChat: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ 
  onSendMessage, 
  onClearChat 
}) => {
  const [input, setInput] = useState('');
  // Always use smart search by default; UI selector removed for simplicity

  const tabState = useTabStore();
  const disabled = selectIsTabLoading(tabState);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim(), 'smart');
      setInput('');
    }
  };

  return (
    <div className="input-area">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-field">
          <span className="leading-icon" aria-hidden>
            {/* Search icon */}
            <svg viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27a6.471 6.471 0 0 0 1.57-4.23C15.99 6.01 13.48 3.5 10.5 3.5S5.01 6.01 5.01 9s2.51 5.5 5.49 5.5c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-5 0C8.01 14 6 11.99 6 9.5S8.01 5 10.5 5 15 7.01 15 9.5 12.99 14 10.5 14z" fill="currentColor"/>
            </svg>
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search the page"
            disabled={disabled}
            aria-label="Search the page"
          />
          <button
            type="button"
            className="icon-button"
            onClick={onClearChat}
            disabled={disabled}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            {/* Clear icon */}
            <svg viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true">
              <path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
            </svg>
          </button>
          <button
            type="submit"
            className="icon-button submit"
            disabled={disabled || !input.trim()}
            title="Search"
            aria-label="Search"
          >
            {/* Send/Search icon */}
            <svg viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}; 