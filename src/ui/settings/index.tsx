import React from 'react';
import { createRoot } from 'react-dom/client';

const SettingsApp: React.FC = () => {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>BrowsEZ Settings</h1>
      <p>Settings page coming soon...</p>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SettingsApp />);
} 