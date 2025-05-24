import React, { useState, useRef, useEffect } from 'react';

const InputArea = ({ disabled, onSendMessage, onClearChat }) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  // Handle input change
  const handleChange = (e) => {
    setMessage(e.target.value);
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      // Always use 'smart' search now that we've removed the dropdown
      onSendMessage(message.trim(), 'smart');
      setMessage('');
    }
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(120, textareaRef.current.scrollHeight)}px`;
    }
  }, [message]);

  // Handle keyboard shortcuts (Enter to submit, Shift+Enter for new line)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="input-area">
      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Generating..." : "Enter your prompt..."}
          disabled={disabled}
          rows="1"
          className={disabled ? 'disabled' : ''}
        />
        
        <div className="controls">
          <div className="search-options">
            <button 
              type="button" 
              onClick={onClearChat}
              className={`clear-button ${disabled ? 'disabled' : ''}`}
              disabled={disabled}
            >
              Clear
            </button>
          </div>
          
          <button 
            type="submit" 
            disabled={disabled || !message.trim()}
            className={`send-button ${disabled ? 'disabled' : ''} ${!message.trim() ? 'empty' : ''}`}
          >
            {disabled ? 'Generating...' : 'Search'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputArea; 