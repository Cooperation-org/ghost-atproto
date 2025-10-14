import { User, Post, SyncLog, LoginResponse, ApiError } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on client side
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add any existing headers
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Include cookies
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'An error occurred',
      }));
      throw new Error(error.error);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password?: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.token = data.token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', data.token);
    }

    return data;
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' });
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  async getMe(): Promise<User> {
    return this.request<User>('/api/auth/me');
  }

  async updateMe(data: Partial<User>): Promise<User> {
    return this.request<User>('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Posts
  // Get all posts from all users (for dashboard)
  async getAllPosts(): Promise<Post[]> {
    return this.request<Post[]>('/api/posts');
  }

  // Get single post by ID
  async getPostById(id: string): Promise<Post> {
    return this.request<Post>(`/api/posts/${id}`);
  }

  // Get current user's posts (for profile)
  async getPosts(): Promise<Post[]> {
    return this.request<Post[]>('/api/auth/posts');
  }

  // Logs
  async getLogs(): Promise<SyncLog[]> {
    return this.request<SyncLog[]>('/api/auth/logs');
  }

  // Get profile stats
  async getProfileStats(): Promise<{
    totalPosts: number;
    successfulSyncs: number;
    failedSyncs: number;
    recentPosts: Post[];
    recentLogs: SyncLog[];
  }> {
    return this.request('/api/auth/profile/stats');
  }

  // Manual Sync
  async syncNow(limit?: number, force?: boolean): Promise<{ 
    message: string; 
    success: boolean; 
    syncedCount: number; 
    skippedCount: number; 
    totalProcessed: number;
  }> {
    return this.request('/api/auth/sync', {
      method: 'POST',
      body: JSON.stringify({ limit: limit || 50, force: force || false }),
    });
  }

  // Health
  async health(): Promise<{ status: string; message: string }> {
    return this.request('/api/health');
  }

  // Civic Events
  async getCivicEvents(params?: { cursor?: string; zipcode?: string; organization_id?: string }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.cursor) queryParams.append('cursor', params.cursor);
    if (params?.zipcode) queryParams.append('zipcode', params.zipcode);
    if (params?.organization_id) queryParams.append('organization_id', params.organization_id);
    
    const queryString = queryParams.toString();
    return this.request(`/api/civic-events${queryString ? `?${queryString}` : ''}`);
  }
}

export const api = new ApiClient();
