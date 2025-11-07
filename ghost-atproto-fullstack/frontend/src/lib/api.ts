import { isClient } from './hydration-utils';
import { User, Post, SyncLog, LoginResponse, ApiError } from './types';

export interface CivicActionDto {
  id: string;
  title: string;
  status: string;
  location?: string | null;
  description?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  imageUrl?: string | null;
}

// Use 127.0.0.1 instead of localhost for AT Protocol OAuth (RFC 8252 requirement)
// In production, use absolute URLs based on current origin to avoid mixed content issues
// In development, use the configured API URL or default to localhost
const getApiBase = (): string => {
  // Client-side: use absolute URL based on current origin to ensure HTTPS
  // This prevents mixed content errors and works with nginx proxy
  if (typeof window !== 'undefined') {
    // Use the current origin (protocol + host) to ensure HTTPS is used
    // This way it works on both IP and domain, and respects the current protocol
    return window.location.origin;
  }
  // Server-side: use the configured API URL
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000';
};

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on client side
    if (isClient()) {
      // Check if token is in URL (from OAuth redirect)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      
      if (urlToken) {
        // Store token from URL
        localStorage.setItem('token', urlToken);
        this.token = urlToken;
        
        // Remove token from URL to keep it clean
        urlParams.delete('token');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      } else {
        // Load from localStorage
        this.token = localStorage.getItem('token');
      }
    }
  }

  // Method to extract and store token from URL (for OAuth redirects)
  extractTokenFromUrl(): void {
    if (isClient()) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      
      if (urlToken) {
        // Store token from URL
        localStorage.setItem('token', urlToken);
        this.token = urlToken;
        
        // Remove token from URL to keep it clean
        urlParams.delete('token');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      }
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Check for token in URL on each request (in case we just redirected)
    this.extractTokenFromUrl();
    
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

    // Build the full URL - use runtime check for client-side
    const apiBase = getApiBase();
    const url = apiBase ? `${apiBase}${endpoint}` : endpoint;
    console.log(`[API] Making request to: ${url}`);

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error(`[API] Request failed: ${url}`, {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        endpoint
      });
      
      let error: ApiError;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = {
          error: `HTTP ${response.status}: ${response.statusText} - ${errorText}`
        };
      }
      
      throw new Error(error.error || 'An error occurred');
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.token = data.token;
    if (isClient()) {
      localStorage.setItem('token', data.token);
    }

    return data;
  }

  async signup(email: string, password: string, role: 'USER' | 'AUTHOR' | 'ADMIN', name?: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, role, name }),
    });

    this.token = data.token;
    if (isClient()) {
      localStorage.setItem('token', data.token);
    }

    return data;
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' });
    this.token = null;
    if (isClient()) {
      localStorage.removeItem('token');
    }
  }

  // OAuth
  async getOAuthConfig(): Promise<{
    google: { enabled: boolean; buttonText: string };
    bluesky: { enabled: boolean; buttonText: string; requiresHandle: boolean; requiresPassword?: boolean; handlePlaceholder: string; passwordPlaceholder?: string };
  }> {
    return this.request('/api/auth/oauth/config');
  }

  async loginWithBluesky(handle: string, password: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>('/api/auth/bluesky', {
      method: 'POST',
      body: JSON.stringify({ handle, password }),
    });
    this.token = data.token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', data.token);
    }
    return data;
  }

  // For Google OAuth, just redirect to the backend route
  getGoogleOAuthUrl(): string {
    const base = getApiBase();
    return `${base}/api/auth/google`;
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

  // Civic Actions (user-submitted)
  
  // PUBLIC: Get approved civic actions (no authentication required)
  async getPublicCivicActions(): Promise<CivicActionDto[]> {
    const base = getApiBase();
    const response = await fetch(`${base}/api/public/civic-actions`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'An error occurred',
      }));
      throw new Error(error.error);
    }

    return response.json();
  }

  // PUBLIC: Get a single approved civic action by ID (no authentication required)
  async getPublicCivicActionById(id: string): Promise<CivicActionDto> {
    const base = getApiBase();
    const response = await fetch(`${base}/api/public/civic-actions/${id}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'An error occurred',
      }));
      throw new Error(error.error);
    }

    return response.json();
  }

  // AUTHENTICATED: Get civic actions (admins see all, users see approved)
  async getCivicActions(status?: string): Promise<CivicActionDto[]> {
    const queryString = status ? `?status=${status}` : '';
    return this.request<CivicActionDto[]>(`/api/civic-actions${queryString}`);
  }

  async getMyCivicActions(): Promise<CivicActionDto[]> {
    return this.request<CivicActionDto[]>('/api/civic-actions/mine');
  }

  async createCivicAction(data: {
    title: string;
    description: string;
    eventType?: string;
    location?: string;
    eventDate?: string;
    imageUrl?: string;
  }): Promise<CivicActionDto> {
    return this.request<CivicActionDto>('/api/civic-actions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async approveCivicAction(id: string, pinned: boolean = false): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/civic-actions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ pinned }),
    });
  }

  async rejectCivicAction(id: string, reason?: string): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/civic-actions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async togglePinCivicAction(id: string): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/civic-actions/${id}/toggle-pin`, {
      method: 'POST',
    });
  }

  async updateCivicAction(id: string, data: {
    title?: string;
    description?: string;
    eventType?: string;
    location?: string;
    eventDate?: string;
    imageUrl?: string;
  }): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/civic-actions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getCivicActionById(id: string): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/civic-actions/${id}`);
  }

  // Civic Events (Mobilize API)
  async getCivicEvents(params?: { 
    cursor?: string; 
    zipcode?: string; 
    organization_id?: string;
    event_type?: string;
    event_types?: string[];
    state?: string;
    timeslot_start_after?: string;
    timeslot_start_before?: string;
    timeslot_start?: string;
    timeslot_end?: string;
    is_virtual?: boolean;
    exclude_full?: boolean;
    max_dist?: number;
    updated_since?: string;
    visibility?: string;
    high_priority_only?: boolean;
    tag_id?: string[];
    event_campaign_id?: string;
    approval_status?: string[];
  }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    data: Array<{
      id: number;
      title: string;
      summary: string;
      description: string;
      event_type?: string | null;
      featured_image_url?: string;
      timeslots: Array<{
        start_date: number;
        end_date: number;
        id: number;
        is_full: boolean;
      }>;
      sponsor: {
        name: string;
        logo_url?: string;
        org_type: string;
        state?: string;
      };
      location?: {
        venue?: string;
        locality?: string;
        region?: string;
      };
      browser_url: string;
      is_virtual: boolean;
      timezone: string;
    }>;
  }> {
    const queryParams = new URLSearchParams();
    
    // Basic filters
    if (params?.cursor) queryParams.append('cursor', params.cursor);
    if (params?.zipcode) queryParams.append('zipcode', params.zipcode);
    if (params?.organization_id) queryParams.append('organization_id', params.organization_id);
    if (params?.state) queryParams.append('state', params.state);
    if (params?.updated_since) queryParams.append('updated_since', params.updated_since);
    if (params?.visibility) queryParams.append('visibility', params.visibility);
    if (params?.max_dist) queryParams.append('max_dist', params.max_dist.toString());
    if (params?.event_campaign_id) queryParams.append('event_campaign_id', params.event_campaign_id);
    
    // Event type filters
    if (params?.event_type) queryParams.append('event_type', params.event_type);
    if (params?.event_types) {
      params.event_types.forEach(type => queryParams.append('event_types', type));
    }
    
    // Boolean filters
    if (params?.is_virtual !== undefined) queryParams.append('is_virtual', params.is_virtual.toString());
    if (params?.exclude_full !== undefined) queryParams.append('exclude_full', params.exclude_full.toString());
    if (params?.high_priority_only !== undefined) queryParams.append('high_priority_only', params.high_priority_only.toString());
    
    // Date/time filters
    if (params?.timeslot_start_after) queryParams.append('timeslot_start_after', params.timeslot_start_after);
    if (params?.timeslot_start_before) queryParams.append('timeslot_start_before', params.timeslot_start_before);
    if (params?.timeslot_start) queryParams.append('timeslot_start', params.timeslot_start);
    if (params?.timeslot_end) queryParams.append('timeslot_end', params.timeslot_end);
    
    // Tag filters
    if (params?.tag_id) {
      params.tag_id.forEach(tag => queryParams.append('tag_id', tag));
    }
    
    // Approval status filters
    if (params?.approval_status) {
      params.approval_status.forEach(status => queryParams.append('approval_status', status));
    }
    
    const queryString = queryParams.toString();
    return this.request(`/api/civic-events${queryString ? `?${queryString}` : ''}`);
  }
}

export const api = new ApiClient();
