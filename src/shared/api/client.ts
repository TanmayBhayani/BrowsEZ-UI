// API Client - Centralized API communication layer

const API_BASE_URL = 'https://find-production.up.railway.app';

export interface SessionResponse {
  sessionId?: string;
  message?: string;
  status: string;
}

export interface HTMLProcessingResponse {
  status: string;
  message: string;
  processed?: boolean;
}

export interface SearchResponse {
  searchResults?: {
    metadatas?: Array<any[]>;
  };
  navigationLinks?: any[];
  llmAnswer?: string;
  message?: string;
}

class APIClient {
  private baseUrl: string;
  private retryCount: number;

  constructor(baseUrl: string = API_BASE_URL, retryCount: number = 3) {
    this.baseUrl = baseUrl;
    this.retryCount = retryCount;
  }

  /**
   * Initialize session with the server
   */
  async initializeSession(retryCount = 0): Promise<SessionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/initialize_session`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Response headers:', response.headers);
      const data = await response.json();
      console.log('Session initialized:', data);

      // Get cookies for debugging
      if (typeof chrome !== 'undefined' && chrome.cookies) {
        const cookies = await chrome.cookies.getAll({
          domain: new URL(this.baseUrl).hostname
        });
        console.log('All cookies:', cookies);
      }

      return data;
    } catch (error) {
      console.error('Session initialization failed:', error);
      if (retryCount < this.retryCount) {
        console.log('Retrying session initialization...');
        await new Promise(resolve => setTimeout(resolve, 5000));
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
        console.log('Unauthorized, re-initializing session...');
        await this.initializeSession();
        // Retry the request
        return this.sendHTML(html, tabId);
      }

      const data = await response.json();
      console.log('HTML sent to server:', data);
      return data;
    } catch (error) {
      console.error('Error sending HTML to server:', error);
      throw error;
    }
  }

  /**
   * Search on the server
   */
  async search(searchString: string, tabId: number, useLlmFiltering = true): Promise<SearchResponse> {
    const searchParams = new URLSearchParams({
      searchString: searchString,
      useLlmFiltering: useLlmFiltering.toString()
    });

    try {
      const response = await fetch(`${this.baseUrl}/search?${searchParams.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'tabId': tabId.toString()
        }
      });

      if (response.status === 401 || response.status === 404) {
        throw new Error('Unauthorized');
      }

      const data = await response.json();
      console.log("Search results received from server:", data);
      return data;
    } catch (error: any) {
      if (error.message === 'Unauthorized') {
        console.log('Unauthorized, re-initializing session...');
        await this.initializeSession();
        throw error; // Let caller handle retry
      }
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
}

// Export singleton instance
export const apiClient = new APIClient();

// Export for testing or custom instances
export { APIClient }; 