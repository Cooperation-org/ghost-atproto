export interface User {
  id: string;
  email: string;
  name: string | null;
  atprotoHandle: string | null;
  ghostUrl: string | null;
  ghostApiKey: string | null;
  createdAt: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  slug: string;
  status: string;
  ghostId: string | null;
  ghostSlug: string | null;
  ghostUrl: string | null;
  atprotoUri: string | null;
  atprotoCid: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
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
