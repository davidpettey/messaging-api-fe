// Base API client for making requests to the backend

const DEFAULT_API_URL = 'https://messaging-api.cerebralvalley.ai';

type RequestOptions = {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  apiUrl?: string;
  userId?: string; 
  apiKey?: string;
};

type RequestBody = Record<string, any> | null;

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string = DEFAULT_API_URL) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  // Helper to build URL with query parameters
  private buildUrl(endpoint: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }
    
    return url.toString();
  }

  // Get headers with auth token if userId is provided
  private getHeaders(userId?: string, apiKey?: string, customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers = { ...this.defaultHeaders, ...customHeaders };
    
    // Add authorization header if userId is provided
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    
    // Add user ID as a separate header
    if (userId) {
      headers['x-user-id'] = userId;
      // Keep the Authorization header for backward compatibility
      headers['Authorization'] = `Bearer ${userId}`;
    }
    
    return headers;
  }

  // Generic request method
  private async request<T>(
    method: string,
    endpoint: string,
    body?: RequestBody,
    options: RequestOptions = {}
  ): Promise<T> {
    const { headers = {}, params, apiUrl, userId } = options;
    
    const url = this.buildUrl(endpoint, params);
    
    const requestOptions: RequestInit = {
      method,
      headers: this.getHeaders(userId, "test_key", headers),
    };

    if (body) {
      requestOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`
        );
      }

      // Check if response is empty
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // HTTP methods
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', endpoint, null, options);
  }

  async post<T>(endpoint: string, body: RequestBody, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', endpoint, body, options);
  }

  async put<T>(endpoint: string, body: RequestBody, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', endpoint, body, options);
  }

  async patch<T>(endpoint: string, body: RequestBody, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', endpoint, body, options);
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', endpoint, null, options);
  }
}

// Export a default instance
export const api = new ApiClient(); 