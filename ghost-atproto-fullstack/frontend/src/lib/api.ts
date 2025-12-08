/**
 * API Client for ghost-atproto-fullstack
 *
 * Features:
 * - Request timeout (30s default)
 * - Automatic retry on network errors (3 attempts)
 * - Structured error responses
 * - Token management (localStorage + URL extraction for OAuth)
 */

import { isClient } from './hydration-utils';
import { User, Post, SyncLog, LoginResponse } from './types';

// =============================================================================
// Types
// =============================================================================

export interface CivicActionDto {
  id: string;
  title: string;
  status: string;
  location?: string | null;
  description?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  imageUrl?: string | null;
  externalUrl?: string | null;
  source?: string;
  isPinned?: boolean;
  engagementCount?: number;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  status: number;
}

// =============================================================================
// Custom Error Class
// =============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(data: ApiErrorResponse): ApiError {
    return new ApiError(data.error, data.status, data.code, data.details);
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isNetworkError(): boolean {
    return this.status === 0;
  }
}

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second between retries
  retryableStatuses: [502, 503, 504], // Gateway errors are retryable
};

// =============================================================================
// Helpers
// =============================================================================

const getApiBase = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000';
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// =============================================================================
// API Client Class
// =============================================================================

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (isClient()) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');

      if (urlToken) {
        localStorage.setItem('token', urlToken);
        this.token = urlToken;
        urlParams.delete('token');
        const newUrl =
          window.location.pathname +
          (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      } else {
        this.token = localStorage.getItem('token');
      }
    }
  }

  extractTokenFromUrl(): void {
    if (isClient()) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');

      if (urlToken) {
        localStorage.setItem('token', urlToken);
        this.token = urlToken;
        urlParams.delete('token');
        const newUrl =
          window.location.pathname +
          (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Core Request Method
  // ---------------------------------------------------------------------------

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    this.extractTokenFromUrl();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const apiBase = getApiBase();
    const url = `${apiBase}${endpoint}`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: Partial<ApiErrorResponse> = { status: response.status };

        try {
          const body = await response.json();
          errorData = {
            error: body.error || body.message || response.statusText,
            code: body.code,
            details: body.details,
            status: response.status,
          };
        } catch {
          errorData.error = response.statusText || `HTTP ${response.status}`;
        }

        // Retry on gateway errors
        if (
          CONFIG.retryableStatuses.includes(response.status) &&
          retryCount < CONFIG.retries
        ) {
          await sleep(CONFIG.retryDelay * (retryCount + 1));
          return this.request<T>(endpoint, options, retryCount + 1);
        }

        throw ApiError.fromResponse(errorData as ApiErrorResponse);
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text);
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError('Request timed out', 0, 'TIMEOUT');
      }

      // Handle network errors with retry
      if (
        error instanceof TypeError &&
        error.message.includes('fetch') &&
        retryCount < CONFIG.retries
      ) {
        await sleep(CONFIG.retryDelay * (retryCount + 1));
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      // Re-throw ApiError as-is
      if (error instanceof ApiError) {
        throw error;
      }

      // Wrap other errors
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error',
        0,
        'NETWORK_ERROR'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

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

  async signup(
    email: string,
    password: string,
    role: 'USER' | 'AUTHOR' | 'ADMIN',
    name?: string
  ): Promise<LoginResponse> {
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
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.token = null;
      if (isClient()) {
        localStorage.removeItem('token');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // OAuth
  // ---------------------------------------------------------------------------

  async getOAuthConfig(): Promise<{
    google: { enabled: boolean; buttonText: string };
    bluesky: {
      enabled: boolean;
      buttonText: string;
      requiresHandle: boolean;
      requiresPassword?: boolean;
      handlePlaceholder: string;
      passwordPlaceholder?: string;
    };
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

  getGoogleOAuthUrl(): string {
    return `${getApiBase()}/api/auth/google`;
  }

  getBlueskyOAuthUrl(handle: string): string {
    return `${getApiBase()}/api/auth/bluesky?handle=${encodeURIComponent(handle)}`;
  }

  async loginWithBlueskyDev(handle: string, password: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>('/api/auth/bluesky/dev', {
      method: 'POST',
      body: JSON.stringify({ handle, password }),
    });
    this.token = data.token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', data.token);
    }
    return data;
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

  // ---------------------------------------------------------------------------
  // Posts
  // ---------------------------------------------------------------------------

  async getAllPosts(): Promise<Post[]> {
    return this.request<Post[]>('/api/posts');
  }

  async getPostById(id: string): Promise<Post> {
    return this.request<Post>(`/api/posts/${id}`);
  }

  async getPosts(): Promise<Post[]> {
    return this.request<Post[]>('/api/auth/posts');
  }

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------

  async getLogs(): Promise<SyncLog[]> {
    return this.request<SyncLog[]>('/api/auth/logs');
  }

  async getProfileStats(): Promise<{
    totalPosts: number;
    successfulSyncs: number;
    failedSyncs: number;
    recentPosts: Post[];
    recentLogs: SyncLog[];
  }> {
    return this.request('/api/auth/profile/stats');
  }

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  async syncNow(
    limit?: number,
    force?: boolean
  ): Promise<{
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

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async health(): Promise<{ status: string; message: string }> {
    return this.request('/api/health');
  }

  // ---------------------------------------------------------------------------
  // Shim Configuration
  // ---------------------------------------------------------------------------

  async saveShimConfig(
    shimUrl: string,
    shimSecret: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/api/ghost/shim/config', {
      method: 'POST',
      body: JSON.stringify({ shimUrl, shimSecret }),
    });
  }

  async getShimStatus(): Promise<{
    configured: boolean;
    healthy: boolean;
    shimUrl?: string;
    message?: string;
  }> {
    return this.request('/api/ghost/shim/status');
  }

  // ---------------------------------------------------------------------------
  // Civic Actions (Public)
  // ---------------------------------------------------------------------------

  async getPublicCivicActions(): Promise<CivicActionDto[]> {
    return this.request<CivicActionDto[]>('/api/public/civic-actions');
  }

  async getPublicCivicActionById(id: string): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/public/civic-actions/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Civic Actions (Authenticated)
  // ---------------------------------------------------------------------------

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

  async approveCivicAction(id: string, pinned = false): Promise<CivicActionDto> {
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

  async updateCivicAction(
    id: string,
    data: {
      title?: string;
      description?: string;
      eventType?: string;
      location?: string;
      eventDate?: string;
      imageUrl?: string;
    }
  ): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/civic-actions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getCivicActionById(id: string): Promise<CivicActionDto> {
    return this.request<CivicActionDto>(`/api/civic-actions/${id}`);
  }

  // ---------------------------------------------------------------------------
  // User Engagement
  // ---------------------------------------------------------------------------

  async getUserImpact(): Promise<{
    metrics: {
      completedActionsCount: number;
      activeCommitmentsCount: number;
      createdActionsCount: number;
      createdArticlesCount: number;
    };
    activeCommitments: Array<{
      id: string;
      status: string;
      notes?: string | null;
      createdAt: string;
      updatedAt: string;
      civicAction: CivicActionDto;
    }>;
    completedActions: Array<{
      id: string;
      status: string;
      notes?: string | null;
      createdAt: string;
      updatedAt: string;
      civicAction: CivicActionDto;
    }>;
    createdActions: CivicActionDto[];
    createdArticles: Post[];
  }> {
    return this.request('/api/user/impact');
  }

  async createEngagement(
    civicActionId: string,
    status?: string,
    notes?: string
  ): Promise<{
    id: string;
    userId: string;
    civicActionId: string;
    status: string;
    notes?: string | null;
  }> {
    return this.request('/api/user/engagements', {
      method: 'POST',
      body: JSON.stringify({ civicActionId, status, notes }),
    });
  }

  async updateEngagement(
    id: string,
    status?: string,
    notes?: string
  ): Promise<{
    id: string;
    userId: string;
    civicActionId: string;
    status: string;
    notes?: string | null;
  }> {
    return this.request(`/api/user/engagements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    });
  }

  async deleteEngagement(id: string): Promise<{ message: string }> {
    return this.request(`/api/user/engagements/${id}`, {
      method: 'DELETE',
    });
  }

  // ---------------------------------------------------------------------------
  // Bluesky Publishing
  // ---------------------------------------------------------------------------

  async publishToBluesky(
    postId: string,
    customText: string
  ): Promise<{
    success: boolean;
    message: string;
    postId: string;
    title: string;
    atprotoUri: string;
    atprotoCid: string;
  }> {
    return this.request('/api/atproto/publish', {
      method: 'POST',
      body: JSON.stringify({ postId, customText }),
    });
  }

  // ---------------------------------------------------------------------------
  // Civic Events (Mobilize API)
  // ---------------------------------------------------------------------------

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

    if (params?.cursor) queryParams.append('cursor', params.cursor);
    if (params?.zipcode) queryParams.append('zipcode', params.zipcode);
    if (params?.organization_id)
      queryParams.append('organization_id', params.organization_id);
    if (params?.state) queryParams.append('state', params.state);
    if (params?.updated_since)
      queryParams.append('updated_since', params.updated_since);
    if (params?.visibility) queryParams.append('visibility', params.visibility);
    if (params?.max_dist)
      queryParams.append('max_dist', params.max_dist.toString());
    if (params?.event_campaign_id)
      queryParams.append('event_campaign_id', params.event_campaign_id);
    if (params?.event_type) queryParams.append('event_type', params.event_type);
    if (params?.event_types) {
      params.event_types.forEach((type) =>
        queryParams.append('event_types', type)
      );
    }
    if (params?.is_virtual !== undefined)
      queryParams.append('is_virtual', params.is_virtual.toString());
    if (params?.exclude_full !== undefined)
      queryParams.append('exclude_full', params.exclude_full.toString());
    if (params?.high_priority_only !== undefined)
      queryParams.append(
        'high_priority_only',
        params.high_priority_only.toString()
      );
    if (params?.timeslot_start_after)
      queryParams.append('timeslot_start_after', params.timeslot_start_after);
    if (params?.timeslot_start_before)
      queryParams.append('timeslot_start_before', params.timeslot_start_before);
    if (params?.timeslot_start)
      queryParams.append('timeslot_start', params.timeslot_start);
    if (params?.timeslot_end)
      queryParams.append('timeslot_end', params.timeslot_end);
    if (params?.tag_id) {
      params.tag_id.forEach((tag) => queryParams.append('tag_id', tag));
    }
    if (params?.approval_status) {
      params.approval_status.forEach((status) =>
        queryParams.append('approval_status', status)
      );
    }

    const queryString = queryParams.toString();
    return this.request(`/api/civic-events${queryString ? `?${queryString}` : ''}`);
  }
}

export const api = new ApiClient();
