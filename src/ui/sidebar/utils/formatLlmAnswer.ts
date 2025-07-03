export function formatLlmAnswer(text: string): string {
  if (!text) {
    return '';
  }

  // HTML-escape function
  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Process code blocks first (e.g., ```python ... ``` or ``` ... ```)
  // Handles optional language identifier and ensures trimming of content
  text = text.replace(/```(?:[a-zA-Z0-9]+)?\n?([\s\S]*?)\n?```/g, (match, codeContent) => {
    if (codeContent === undefined || codeContent === null) return match;
    return `<pre><code>${escapeHtml(codeContent.trim())}</code></pre>`;
  });

  // Process bold text (e.g., **text**)
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Process bullet lists (including nested ones)
  // This handles both top-level and indented bullet points
  text = text.replace(/^([ ]*\*\s.*(?:\n[ ]*\*\s.*|\n[ ]+(?!\*\s).*)*)/gm, (match) => {
    const lines = match.trim().split('\n');
    const result = [];
    const stack = []; // Stack to keep track of nesting levels
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('* ')) {
        // Count indentation level (number of spaces before *)
        const indentMatch = line.match(/^( *)\*/);
        const indent = indentMatch ? Math.floor(indentMatch[1].length / 4) : 0; // Assuming 4 spaces per indent level
        
        // Close lists if we're at a higher level
        while (stack.length > indent + 1) {
          result.push('</ul>');
          stack.pop();
        }
        
        // Open new list if needed
        if (stack.length <= indent) {
          result.push('<ul>');
          stack.push('ul');
        }
        
        // Add list item
        const itemText = trimmedLine.replace(/^\*\s+/, '').trim();
        result.push(`<li>${itemText}</li>`);
      } else if (trimmedLine && stack.length > 0) {
        // This is a continuation of the previous list item
        const itemText = trimmedLine;
        // Replace the last </li> with content + </li>
        const lastIndex = result.length - 1;
        if (result[lastIndex] && result[lastIndex].endsWith('</li>')) {
          result[lastIndex] = result[lastIndex].replace('</li>', ` ${itemText}</li>`);
        }
      }
    }
    
    // Close all remaining open lists
    while (stack.length > 0) {
      result.push('</ul>');
      stack.pop();
    }
    
    return result.join('');
  });

  // Process numbered lists (e.g., 1. item)
  // This regex handles multi-line list items and groups them into a single <ol>
  text = text.replace(/^(\d+\.\s(?:[^\n]*(?:\n(?!\d+\.|\n).*)*)?(?:\n(?=\d+\.\s))?)+/gm, (match) => {
    const items = match.trim().split(/\n(?=\d+\.\s)/).map(item => {
        // Remove the leading number and period (e.g., "1. ")
        const listItemText = item.replace(/^\d+\.\s+/, '').trim();
        return `<li>${listItemText}</li>`;
    }).join('');
    return `<ol>${items}</ol>`;
  });

  // Convert double newlines to paragraph breaks
  text = text.replace(/\n\n+/g, '</p><p>');
  
  // Convert single newlines to line breaks
  text = text.replace(/\n/g, '<br>');
  
  // Wrap in paragraph tags if there are paragraph breaks
  if (text.includes('</p><p>')) {
    text = `<p>${text}</p>`;
  }

  return text;
} 