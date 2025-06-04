import React from 'react';
import { useTabStore, selectDisplayConversation } from '@shared/state/tabStore';

interface ChatViewProps {
  onNavigate: (direction: 'next' | 'prev') => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ onNavigate }) => {
  const tabState = useTabStore();
  const conversation = selectDisplayConversation(tabState);

  return (
    <div className="chat-view">
      {conversation.map((message, index) => (
        <div key={index} className={`message ${message.role}`}>
          {message.role === 'navigation' ? (
            <div className="navigation-controls">
              <button onClick={() => onNavigate('prev')}>Previous</button>
              <span>{message.content}</span>
              <button onClick={() => onNavigate('next')}>Next</button>
            </div>
          ) : (
            <div className="message-content">{message.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}; 