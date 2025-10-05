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
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { Post, SyncLog, User } from '@/lib/types';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userData, postsData, logsData] = await Promise.all([
          api.getMe(),
          api.getPosts(),
          api.getLogs(),
        ]);
        setUser(userData);
        setPosts(postsData);
        setLogs(logsData);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  const successfulSyncs = logs.filter((log) => log.status === 'success').length;
  const failedSyncs = logs.filter((log) => log.status === 'error').length;

  return (
    <DashboardLayout>
      <Typography variant="h4" gutterBottom>
        Welcome back, {user?.name || user?.email}!
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ArticleIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Total Posts
                </Typography>
              </Box>
              <Typography variant="h3">{posts.length}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Successful Syncs
                </Typography>
              </Box>
              <Typography variant="h3">{successfulSyncs}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ErrorIcon color="error" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Failed Syncs
                </Typography>
              </Box>
              <Typography variant="h3">{failedSyncs}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Connection Status
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color={user?.ghostUrl ? 'success.main' : 'error.main'}>
                Ghost: {user?.ghostUrl || 'Not configured'}
              </Typography>
              <Typography variant="body2" color={user?.atprotoHandle ? 'success.main' : 'error.main'} sx={{ mt: 1 }}>
                Bluesky: {user?.atprotoHandle || 'Not configured'}
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            {logs.slice(0, 5).map((log) => (
              <Typography key={log.id} variant="body2" sx={{ mt: 1 }}>
                {log.action} - {log.status} ({new Date(log.createdAt).toLocaleString()})
              </Typography>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </DashboardLayout>
  );
}
