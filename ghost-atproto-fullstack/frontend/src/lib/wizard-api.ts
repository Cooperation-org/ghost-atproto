// Determine API base URL based on environment
const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // In production, use the same domain with /bridge prefix
  if (process.env.NODE_ENV === 'production') {
    return '/bridge';
  }
  
  // In development, use localhost
  return 'http://localhost:5001';
};

const API_BASE = getApiBase();

export interface GhostValidationResponse {
  valid: boolean;
  error?: string;
  site?: {
    title: string;
    description: string;
    url: string;
  };
}

export interface BlueskyValidationResponse {
  valid: boolean;
  error?: string;
  profile?: {
    handle: string;
    did: string;
    displayName: string;
  };
}

export interface WizardCompleteResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    name?: string;
    ghostUrl?: string;
    blueskyHandle?: string;
  };
  webhookUrl: string;
  nextSteps: {
    webhookInstructions: string[];
  };
}

export interface WizardStatusResponse {
  isComplete: boolean;
  isSkipped: boolean;
  hasGhost: boolean;
  hasBluesky: boolean;
}

class WizardApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'An error occurred',
      }));
      throw new Error(error.error);
    }

    return response.json();
  }

  async validateGhost(ghostUrl: string, ghostApiKey: string): Promise<GhostValidationResponse> {
    return this.request<GhostValidationResponse>('/api/wizard/validate-ghost', {
      method: 'POST',
      body: JSON.stringify({ ghostUrl, ghostApiKey }),
    });
  }

  async validateBluesky(blueskyHandle: string, blueskyPassword: string): Promise<BlueskyValidationResponse> {
    return this.request<BlueskyValidationResponse>('/api/wizard/validate-bluesky', {
      method: 'POST',
      body: JSON.stringify({ blueskyHandle, blueskyPassword }),
    });
  }

  async completeWizard(data: {
    ghostUrl: string;
    ghostApiKey: string;
    ghostContentApiKey?: string;
    blueskyHandle: string;
    blueskyPassword: string;
    name?: string;
    autoSync?: boolean;
  }): Promise<WizardCompleteResponse> {
    return this.request<WizardCompleteResponse>('/api/wizard/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getStatus(): Promise<WizardStatusResponse> {
    return this.request<WizardStatusResponse>('/api/wizard/status');
  }

  async skipWizard(): Promise<{ success: boolean; message: string; skipped: boolean }> {
    return this.request<{ success: boolean; message: string; skipped: boolean }>('/api/wizard/skip', {
      method: 'POST',
    });
  }
}

export const wizardApi = new WizardApiClient();

