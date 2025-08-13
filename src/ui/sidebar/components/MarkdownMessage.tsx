import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  return (
    <ReactMarkdown
      // Do not enable raw HTML; we want to avoid XSS and malformed HTML breaking rendering
      remarkPlugins={[remarkGfm]}
      components={{
        code({ inline, className, children, ...props }: any) {
          const languageMatch = /language-(\w+)/.exec(className || '');
          if (!inline && languageMatch) {
            return (
              <pre>
                <code className={className} {...props}>
                  {String(children)}
                </code>
              </pre>
            );
          }
          return (
            <code className={className} {...props}>
              {String(children)}
            </code>
          );
        },
        // Optional: ensure lists, paragraphs, and line breaks render nicely
        p({ children }) {
          return <p style={{ margin: '0.5em 0' }}>{children}</p>;
        },
        ul({ children }) {
          return <ul style={{ paddingLeft: '1.25em', margin: '0.5em 0' }}>{children}</ul>;
        },
        ol({ children }) {
          return <ol style={{ paddingLeft: '1.25em', margin: '0.5em 0' }}>{children}</ol>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownMessage;


