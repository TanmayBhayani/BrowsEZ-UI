import React, { useEffect, useState } from 'react';
import { apiClient, AuthUser } from '@shared/api/client';

interface UserAuthProps {
  onAuthChange?: (authenticated: boolean) => void;
}

export const UserAuth: React.FC<UserAuthProps> = ({ onAuthChange }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const authStatus = await apiClient.checkAuth();
      setUser(authStatus.user);
      setLoading(false);
      setLoginError(null);
      onAuthChange?.(authStatus.authenticated);
    } catch (error) {
      console.error('Failed to check auth status:', error);
      setLoading(false);
      setLoginError('Failed to check authentication status');
      onAuthChange?.(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoginError(null);
      await apiClient.login();
      
      // Set up a periodic check for successful authentication
      // This checks every 2 seconds for up to 2 minutes
      let attempts = 0;
      const maxAttempts = 60;
      
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const authStatus = await apiClient.checkAuth();
          if (authStatus.authenticated) {
            clearInterval(checkInterval);
            setUser(authStatus.user);
            onAuthChange?.(true);
            setLoginError(null);
          }
        } catch (error) {
          console.error('Error checking auth during login flow:', error);
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          setLoginError('Login timeout - please try again');
        }
      }, 2000);
      
    } catch (error) {
      console.error('Failed to initiate login:', error);
      setLoginError('Failed to start login process');
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      setUser(null);
      setShowDropdown(false);
      onAuthChange?.(false);
      // Reload the extension after logout
      chrome.runtime.reload();
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  if (loading) {
    return (
      <div className="user-auth-container">
        <div className="loading-spinner small"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-auth-container">
        <button 
          className="login-button"
          onClick={handleLogin}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
        {loginError && (
          <div className="auth-error">
            <p>{loginError}</p>
            <button 
              className="retry-button"
              onClick={() => {
                setLoginError(null);
                checkAuthStatus();
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="user-auth-container">
      <div 
        className="user-info"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {user.picture_url ? (
          <img 
            src={user.picture_url} 
            alt={user.name} 
            className="user-avatar"
          />
        ) : (
          <div className="user-avatar-placeholder">
            {user.name?.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="user-name">{user.name || user.email}</span>
        <svg className="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12">
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      
      {showDropdown && (
        <div className="user-dropdown">
          <div className="dropdown-item user-email">{user.email}</div>
          <div className="dropdown-divider"></div>
          <button 
            className="dropdown-item logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserAuth;