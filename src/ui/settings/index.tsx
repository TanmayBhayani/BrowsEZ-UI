import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { apiClient } from '@shared/api/client';
import { UsageStats } from '@shared/types/extension';
import './styles.css';

const SettingsApp: React.FC = () => {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsageStats();
  }, []);

  const fetchUsageStats = async () => {
    try {
      const response = await fetch(`${apiClient['baseUrl']}/usage/stats`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch usage stats: ${response.status}`);
      }

      const data = await response.json();
      setUsageStats(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      setError('Failed to load usage statistics. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const getProgressBarColor = (percentage: number): string => {
    if (percentage < 50) return '#4ade80'; // green
    if (percentage < 80) return '#fbbf24'; // yellow
    return '#ef4444'; // red
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading usage statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-container">
        <div className="error-message">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={fetchUsageStats} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!usageStats) {
    return (
      <div className="settings-container">
        <p>No usage data available</p>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <header className="settings-header">
        <h1>BrowsEZ Settings</h1>
        <div className="user-info">
          <span className="user-name">{usageStats.user.name || usageStats.user.email}</span>
          <span className="user-role">{usageStats.user.role.replace('_', ' ')}</span>
        </div>
      </header>

      <section className="usage-section">
        <h2>Usage Statistics</h2>
        
        <div className="usage-card">
          <div className="usage-header">
            <h3>Token Usage</h3>
            <span className="usage-label">This Month</span>
          </div>
          
          {usageStats.usage.tokens.unlimited ? (
            <div className="unlimited-usage">
              <span className="usage-count">{formatNumber(usageStats.usage.tokens.used)}</span>
              <span className="usage-limit">Unlimited</span>
            </div>
          ) : (
            <>
              <div className="usage-details">
                <span className="usage-count">{formatNumber(usageStats.usage.tokens.used)}</span>
                <span className="usage-limit">/ {formatNumber(usageStats.usage.tokens.limit)} tokens</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{
                    width: `${Math.min(usageStats.usage.tokens.percentage, 100)}%`,
                    backgroundColor: getProgressBarColor(usageStats.usage.tokens.percentage)
                  }}
                />
              </div>
              <div className="usage-percentage">
                {usageStats.usage.tokens.percentage.toFixed(1)}% used
              </div>
            </>
          )}
        </div>

        {usageStats.user.role === 'free_user' && (
          <div className="upgrade-prompt">
            <h3>Need more tokens?</h3>
            <p>Upgrade to a paid plan for higher limits and additional features.</p>
            <button className="upgrade-button" disabled>
              Upgrade Plan (Coming Soon)
            </button>
          </div>
        )}
      </section>

      <section className="info-section">
        <h2>About Token Usage</h2>
        <div className="info-card">
          <p>
            Tokens are consumed when you use the search functionality. Each search query uses tokens based on:
          </p>
          <ul>
            <li>The length of your question</li>
            <li>The amount of content searched</li>
            <li>The complexity of the generated answer</li>
          </ul>
          <p className="info-note">
            Token usage resets at the beginning of each month. Your current usage period started on the 1st of this month.
          </p>
        </div>
      </section>

      <footer className="settings-footer">
        <button onClick={() => window.close()} className="close-button">
          Close Settings
        </button>
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SettingsApp />);
}