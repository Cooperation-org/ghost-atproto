'use client';

import { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Button,
  Alert,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SyncIcon from '@mui/icons-material/Sync';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { Post, SyncLog, User } from '@/lib/types';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userData, postsData] = await Promise.all([
          api.getMe(),
          api.getAllPosts(), // Get ALL posts from ALL users
        ]);
        setUser(userData);
        setPosts(postsData);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage('');
    setSyncError('');

    try {
      const result = await api.syncNow(5);
      setSyncMessage(`✅ ${result.message} - Synced: ${result.syncedCount}, Skipped: ${result.skippedCount}, Total: ${result.totalProcessed}`);
      
      // Reload posts after sync
      const updatedPosts = await api.getAllPosts();
      setPosts(updatedPosts);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            All Articles
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Showing all synced articles from all connected authors
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={syncing ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
          onClick={handleSyncNow}
          disabled={syncing}
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </Box>

      {syncMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSyncMessage('')}>
          {syncMessage}
        </Alert>
      )}

      {syncError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSyncError('')}>
          {syncError}
        </Alert>
      )}

      {/* Stats Card */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ArticleIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Total Articles
                </Typography>
              </Box>
              <Typography variant="h3">{posts.length}</Typography>
              <Typography variant="caption" color="text.secondary">
                From all connected authors
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Synced to Bluesky
                </Typography>
              </Box>
              <Typography variant="h3">{posts.filter(p => p.atprotoUri).length}</Typography>
              <Typography variant="caption" color="text.secondary">
                Successfully published
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ArticleIcon color="info" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Pending
                </Typography>
              </Box>
              <Typography variant="h3">{posts.filter(p => !p.atprotoUri).length}</Typography>
              <Typography variant="caption" color="text.secondary">
                Not yet synced
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Posts List */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recent Articles
        </Typography>
        {posts.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No articles yet. Complete the wizard to start syncing posts!
          </Typography>
        ) : (
          <Box sx={{ mt: 2 }}>
            {posts.slice(0, 20).map((post: any) => (
              <Card key={post.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" gutterBottom>
                        {post.title}
                      </Typography>
                      {post.content && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {post.content.substring(0, 150)}...
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        {post.user && (
                          <Typography variant="caption" color="text.secondary">
                            By: {post.user.name || post.user.email}
                          </Typography>
                        )}
                        {post.ghostUrl && (
                          <Typography variant="caption" color="primary">
                            <a href={post.ghostUrl} target="_blank" rel="noopener noreferrer">
                              View on Ghost →
                            </a>
                          </Typography>
                        )}
                        {post.atprotoUri && (
                          <Typography variant="caption" color="success.main">
                            ✓ Synced to Bluesky
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Paper>
    </DashboardLayout>
  );
}
