const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

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
    atprotoHandle?: string;
  };
  webhookUrl: string;
  nextSteps: {
    webhookInstructions: string[];
  };
}

export interface WizardStatusResponse {
  isComplete: boolean;
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

  async validateBluesky(atprotoHandle: string, atprotoAppPassword: string): Promise<BlueskyValidationResponse> {
    return this.request<BlueskyValidationResponse>('/api/wizard/validate-bluesky', {
      method: 'POST',
      body: JSON.stringify({ atprotoHandle, atprotoAppPassword }),
    });
  }

  async completeWizard(data: {
    ghostUrl: string;
    ghostApiKey: string;
    atprotoHandle: string;
    atprotoAppPassword: string;
    name?: string;
  }): Promise<WizardCompleteResponse> {
    return this.request<WizardCompleteResponse>('/api/wizard/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getStatus(): Promise<WizardStatusResponse> {
    return this.request<WizardStatusResponse>('/api/wizard/status');
  }
}

export const wizardApi = new WizardApiClient();

