import React, { useRef, useEffect } from 'react';
import Message from './Message';

const ChatView = ({ conversation = [], onNavigate }) => {
  const chatEndRef = useRef(null);

  // Automatically scroll to the bottom when new messages are added
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  // Navigation messages are no longer filtered out here
  // const filteredConversation = conversation.filter(msg => msg.role !== 'navigation');

  return (
    <div className="chat-view">
      {conversation.length === 0 ? (
        <div className="empty-chat">
          <p>Type a search query to begin.</p>
        </div>
      ) : (
        <>
          {conversation.map((message, index) => (
            <Message 
              key={index} 
              message={message} 
              onNavigate={message.role === 'navigation' ? onNavigate : undefined} // Pass onNavigate if it's a navigation message
            />
          ))}
        </>
      )}
      <div ref={chatEndRef} />
    </div>
  );
};

export default ChatView; 