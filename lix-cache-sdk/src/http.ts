import {
  LixAuthError,
  LixConnectionError,
  LixNotFoundError,
  LixServerError,
  LixTimeoutError,
  LixTypeError,
} from './errors';

export interface HttpClientConfig {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  apiKey?: string;
}

export class HttpClient {
  constructor(private config: HttpClientConfig) {
    // Warn if connecting to remote server without API key
    if (!config.apiKey && !this.isLocalhost(config.baseUrl)) {
      console.warn(
        '⚠️  Lix Cache: Connecting to remote server without API key.\n' +
        'If authentication is enabled on the server, requests will fail.\n' +
        'Pass apiKey in config: new LixCache({ apiKey: "..." })'
      );
    }
  }

  /**
   * Check if URL is localhost
   */
  private isLocalhost(url: string): boolean {
    return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    const headers = this.buildHeaders();
    return this.request<T>(url, { method: 'GET', headers });
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const headers = this.buildHeaders({ 'Content-Type': 'application/json' });
    return this.request<T>(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    const headers = this.buildHeaders();
    return this.request<T>(url, { method: 'DELETE', headers });
  }

  /**
   * Make a request with retry logic
   */
  private async request<T>(
    url: string,
    options: RequestInit,
    retryCount = 0
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle successful responses
      if (response.ok) {
        return await response.json() as T;
      }

      // Handle error responses
      await this.handleErrorResponse(response);

      // This line should never be reached due to handleErrorResponse throwing
      throw new Error('Unexpected error');
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LixTimeoutError(this.config.timeout);
      }

      // Handle network errors with retry logic
      if (this.isNetworkError(error) && retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        await this.sleep(delay);
        return this.request<T>(url, options, retryCount + 1);
      }

      // Handle connection errors
      if (this.isNetworkError(error)) {
        throw new LixConnectionError(this.config.baseUrl, error);
      }

      // Re-throw if it's already a LixCache error
      throw error;
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const contentType = response.headers.get('content-type');
    let errorData: any;

    if (contentType?.includes('application/json')) {
      errorData = await response.json();
    } else {
      errorData = { error: await response.text() };
    }

    // Handle 401 - Unauthorized (authentication failed)
    if (response.status === 401) {
      throw new LixAuthError();
    }

    // Handle 404 - Not Found
    if (response.status === 404) {
      // Extract key from URL if possible
      const url = new URL(response.url);
      const key = url.searchParams.get('key') || 'unknown';
      throw new LixNotFoundError(key);
    }

    // Handle 400 - Bad Request (often type errors)
    if (response.status === 400) {
      const errorMessage = errorData.error || '';

      // Check if it's a non-numeric value error
      if (typeof errorMessage === 'string' && errorMessage.includes('non_numeric')) {
        const url = new URL(response.url);
        const path = url.pathname;
        const operation = path.includes('incr') ? 'incr' : 'decr';
        // We don't have the key from the error, so use a generic message
        throw new LixTypeError('unknown', operation as 'incr' | 'decr');
      }
    }

    // Handle all other server errors
    throw new LixServerError(response.status, errorData);
  }

  /**
   * Build headers with optional auth
   */
  private buildHeaders(headers: Record<string, string> = {}): Record<string, string> {
    const result = { ...headers };

    if (this.config.apiKey) {
      result['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return result;
  }

  /**
   * Build a full URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.config.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    return url.toString();
  }

  /**
   * Check if an error is a network error
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof TypeError) {
      return true;
    }
    if (error instanceof Error) {
      return error.message.includes('fetch') || error.message.includes('network');
    }
    return false;
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
