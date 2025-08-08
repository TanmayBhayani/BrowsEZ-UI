// API Client - Centralized API communication layer

import { ConversationMessage } from '../types/extension';
const API_BASE_URL = 'https://find-production.up.railway.app';

// const API_BASE_URL = 'http://localhost:5000';

export interface SessionResponse {
  sessionId?: string;
  message?: string;
  status: string;
}

export interface HTMLProcessingResponse {
  status: number;
  message: string;
}

export interface SearchResponse {
  searchResults?: {
    metadatas?: Array<any[]>;
  };
  navigationLinks?: any[];
  llmAnswer?: string;
  message?: string;
}

export interface AuthUser {
  user_id: number;
  email: string;
  name: string;
  picture_url: string;
  role: string;
  google_id: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser | null;
}

class APIClient {
  private baseUrl: string;
  private retryCount: number;
  private authChecked: boolean = false;
  private currentUser: AuthUser | null = null;
  private loginInProgress: boolean = false;

  constructor(baseUrl: string = API_BASE_URL, retryCount: number = 3) {
    this.baseUrl = baseUrl;
    this.retryCount = retryCount;
  }

  /**
   * Initialize session with the server (for backward compatibility only)
   * Note: New users should authenticate first instead of creating anonymous sessions
   */
  async initializeSession(retryCount = 0): Promise<SessionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/initialize_session`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        // User needs to authenticate first
        throw new Error('Authentication required for new sessions');
      }

      console.log('Response headers:', response.headers);
      const data = await response.json();
      console.log('Session initialized:', data);

      return data;
    } catch (error) {
      console.error('Session initialization failed:', error);
      if (retryCount < this.retryCount && !error.message.includes('Authentication required')) {
        console.log('Retrying session initialization...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.initializeSession(retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Send HTML to server for processing
   */
  async sendHTML(html: string, tabId: number): Promise<HTMLProcessingResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/receive_html`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: html,
          tabId: tabId
        })
      });

      if (response.status === 401) {
        console.log('Unauthorized, user needs to login');
        // Don't automatically trigger login - let the UI handle it
        throw new Error('Authentication required - please login');
      }

      const data = await response.json();
      if (!data.message) {
        throw new Error('Invalid response format');
      }
      data.status = response.status;
      return data as HTMLProcessingResponse;
    } catch (error) {
      console.error('Error sending HTML to server:', error);
      throw error;
    }
  }

  /**
   * Search on the server with full conversation context
   */
  async search(searchString: string, tabId: number, useLlmFiltering = true, conversation?: ConversationMessage[]): Promise<SearchResponse> {
    // Build the conversation payload
    const payload = {
      conversation: conversation || [
        {
          role: 'user',
          content: searchString
        }
      ],
      tabId: `${tabId}`
    };

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        console.log('Unauthorized, user needs to login');
        // Don't automatically trigger login - let the UI handle it
        throw new Error('Authentication required - please login');
      }
      
      if (response.status === 404) {
        throw new Error('Container not found');
      }

      const data = await response.json();
      console.log("Search results received from server:", data);
      return data;
    } catch (error: any) {
      console.error('Error searching on server:', error);
      throw error;
    }
  }

  /**
   * Clean up session on server
   */
  async cleanupSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/cleanup_session`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        console.log('Session cleaned up successfully');
      }
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }
  }

  /**
   * Check authentication status
   */
  async checkAuth(): Promise<AuthStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/user`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      this.authChecked = true;
      this.currentUser = data.user;
      return data as AuthStatus;
    } catch (error) {
      console.error('Failed to check auth status:', error);
      this.authChecked = true;
      this.currentUser = null;
      return { authenticated: false, user: null };
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!this.authChecked) {
      const authStatus = await this.checkAuth();
      return authStatus.user;
    }
    return this.currentUser;
  }

  /**
   * Initiate login flow
   */
  async login(): Promise<void> {
    if (this.loginInProgress) {
      console.log('Login already in progress, ignoring duplicate request');
      return;
    }
    
    this.loginInProgress = true;
    try {
      // Open the login URL in a new tab
      const loginUrl = `${this.baseUrl}/auth/login`;
      chrome.tabs.create({ url: loginUrl });
      
      // Reset login flag after a delay
      setTimeout(() => {
        this.loginInProgress = false;
      }, 3000);
    } catch (error) {
      this.loginInProgress = false;
      throw error;
    }
  }

  /**
   * Logout the current user
   */
  async logout(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        this.currentUser = null;
        this.authChecked = false;
        console.log('Logged out successfully');
      }
    } catch (error) {
      console.error('Error logging out:', error);
      // Clear local state even if logout request fails
      this.currentUser = null;
      this.authChecked = false;
      throw error;
    }
  }
}

// Export singleton instance
export const apiClient = new APIClient();

// Export for testing or custom instances
export { APIClient }; 