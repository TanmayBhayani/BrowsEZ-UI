import React from 'react';
import NavigationControls from './NavigationControls';

const Message = ({ message, onNavigate }) => {
  // Format LLM answer text with basic markdown support
  const formatLlmAnswer = (text) => {
    if (!text) return '';

    // HTML-escape function
    const escapeHtml = (unsafe) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Process code blocks (e.g., ```python ... ``` or ``` ... ```)
    text = text.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)\n```|```([\s\S]*?)```/g, (match, contentWithLang, contentWithoutLang) => {
      const codeContent = contentWithLang || contentWithoutLang;
      if (codeContent === undefined || codeContent === null) return match; 
      return `<pre><code>${escapeHtml(codeContent.trim())}</code></pre>`;
    });

    // Process bold text (e.g., **text**)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Process numbered lists (e.g., 1. item)
    text = text.replace(/^(\d+\.\s(?:[^\n]*(?:\n(?!\d+\.|\n))?)+)/gm, (match) => {
      const items = match.trim().split(/\n(?=\d+\.\s)/).map(item => {
        const listItemText = item.replace(/^\d+\.\s+/, '').trim();
        return `<li>${listItemText}</li>`;
      }).join('');
      return `<ol>${items}</ol>`;
    });

    // Consolidate adjacent <ol> tags
    text = text.replace(/<\/ol>\s*(?:<br>\s*)*<ol>/g, '');

    // Replace newlines with <br> for general text, but not within <pre> or <li>
    // First, protect <pre> and <ol> blocks
    const placeholder = '___PLACEHOLDER___';
    const protectedBlocks = [];
    text = text.replace(/(<pre[\s\S]*?<\/pre>|<ol[\s\S]*?<\/ol>)/g, (block) => {
      protectedBlocks.push(block);
      return placeholder + (protectedBlocks.length - 1) + '__';
    });

    // Replace newlines with <br> in the remaining text
    text = text.replace(/\n/g, '<br>');

    // Restore protected blocks
    text = text.replace(new RegExp(placeholder + '(\\d+)__', 'g'), (match, index) => {
      return protectedBlocks[parseInt(index, 10)];
    });

    return text;
  };

  // For assistant messages that contain LLM answers
  if (message.role === 'assistant' && message.content) {
    return (
      <div className="message assistant">
        <div className="message-content" dangerouslySetInnerHTML={{ __html: formatLlmAnswer(message.content) }} />
        {message.timestamp && (
          <div className="message-timestamp">{new Date(message.timestamp).toLocaleTimeString()}</div>
        )}
      </div>
    );
  }

  // For system messages (search results, status updates)
  if (message.role === 'system') {
    return (
      <div className="message system">
        <div className="message-content">{message.content}</div>
        {message.timestamp && (
          <div className="message-timestamp">{new Date(message.timestamp).toLocaleTimeString()}</div>
        )}
      </div>
    );
  }

  // For navigation control messages
  if (message.role === 'navigation') {
    return (
      <div className="message navigation">
        <NavigationControls 
          currentPosition={message.currentPosition}
          totalResults={message.totalResults}
          onNavigate={onNavigate}
          visible={true}
        />
      </div>
    );
  }

  // Default is user message
  return (
    <div className="message user">
      <div className="message-content">{message.content}</div>
      {message.timestamp && (
        <div className="message-timestamp">{new Date(message.timestamp).toLocaleTimeString()}</div>
      )}
    </div>
  );
};

export default Message; 