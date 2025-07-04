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
      <form onSubmit={handleSubmit}>
        <div className="input-controls">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search the page..."
            disabled={disabled}
          />
          <button type="submit" disabled={disabled || !input.trim()}>
            Search
          </button>
          <button type="button" onClick={onClearChat} disabled={disabled}>
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}; 