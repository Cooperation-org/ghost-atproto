export interface User {
  id: string;
  email: string;
  name: string | null;
  blueskyHandle: string | null;
  blueskyPassword: string | null;
  ghostUrl: string | null;
  ghostApiKey: string | null;
  ghostContentApiKey: string | null;
  createdAt: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  slug: string;
  status: string;
  featureImage: string | null;
  ghostId: string | null;
  ghostSlug: string | null;
  ghostUrl: string | null;
  atprotoUri: string | null;
  atprotoCid: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    blueskyHandle?: string | null;
  };
}

export interface SyncLog {
  id: string;
  action: string;
  status: string;
  source: string;
  target: string;
  postId: string | null;
  ghostId: string | null;
  atprotoUri: string | null;
  error: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface ApiError {
  error: string;
}
