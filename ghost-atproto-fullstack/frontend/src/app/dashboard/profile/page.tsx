'use client';

import { formatDate, formatDateTime } from '@/lib/hydration-utils';
import { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Button,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SyncIcon from '@mui/icons-material/Sync';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { Post, SyncLog, User } from '@/lib/types';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<{
    totalPosts: number;
    successfulSyncs: number;
    failedSyncs: number;
    recentPosts: Post[];
    recentLogs: SyncLog[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userData, statsData] = await Promise.all([
          api.getMe(),
          api.getProfileStats(),
        ]);
        setUser(userData);
        setStats(statsData);
      } catch (error) {
        console.error('Failed to load profile data:', error);
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
      // Sync with higher limit (50 posts) and force update
      const result = await api.syncNow(50, true);
      setSyncMessage(`✅ ${result.message} - Synced: ${result.syncedCount}, Skipped: ${result.skippedCount}, Total: ${result.totalProcessed}`);
      
      // Reload stats after sync
      const statsData = await api.getProfileStats();
      setStats(statsData);
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
            My Profile
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your personal sync statistics and activity
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

      {/* User Info */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Account Information
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body1">
            <strong>Name:</strong> {user?.name || 'Not set'}
          </Typography>
          <Typography variant="body1" sx={{ mt: 1 }}>
            <strong>Email:</strong> {user?.email}
          </Typography>
          <Typography variant="body1" color={user?.ghostUrl && user.ghostUrl !== 'SKIPPED' ? 'success.main' : user?.ghostUrl === 'SKIPPED' ? 'warning.main' : 'error.main'} sx={{ mt: 1 }}>
            <strong>Ghost Site:</strong> {user?.ghostUrl && user.ghostUrl !== 'SKIPPED' ? user.ghostUrl : user?.ghostUrl === 'SKIPPED' ? 'Skipped' : 'Not configured'}
          </Typography>
          <Typography variant="body1" color={user?.blueskyHandle && user.blueskyHandle !== 'SKIPPED' ? 'success.main' : user?.blueskyHandle === 'SKIPPED' ? 'warning.main' : 'error.main'} sx={{ mt: 1 }}>
            <strong>Bluesky Handle:</strong> {user?.blueskyHandle && user.blueskyHandle !== 'SKIPPED' ? user.blueskyHandle : user?.blueskyHandle === 'SKIPPED' ? 'Skipped' : 'Not configured'}
          </Typography>
        </Box>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ArticleIcon color="primary" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Total Posts Synced
                </Typography>
              </Box>
              <Typography variant="h3">{stats?.totalPosts || 0}</Typography>
              <Typography variant="caption" color="text.secondary">
                Successfully synced to Bluesky
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
                  Successful Syncs
                </Typography>
              </Box>
              <Typography variant="h3">{stats?.successfulSyncs || 0}</Typography>
              <Typography variant="caption" color="text.secondary">
                All-time successful operations
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ErrorIcon color="error" sx={{ mr: 1 }} />
                <Typography color="textSecondary" variant="h6">
                  Failed Syncs
                </Typography>
              </Box>
              <Typography variant="h3">{stats?.failedSyncs || 0}</Typography>
              <Typography variant="caption" color="text.secondary">
                Errors encountered
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Posts */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          My Recent Posts
        </Typography>
        {!stats?.recentPosts || stats.recentPosts.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No posts yet. Complete the wizard to start syncing!
          </Typography>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Bluesky</TableCell>
                  <TableCell>Published</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.recentPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {post.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={post.status}
                        color={post.status === 'published' ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {post.atprotoUri ? (
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Synced"
                          color="success"
                          size="small"
                        />
                      ) : (
                        <Chip label="Pending" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(post.publishedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {post.ghostUrl && (
                        <Button
                          size="small"
                          startIcon={<OpenInNewIcon />}
                          href={post.ghostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Recent Sync Activity */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recent Sync Activity
        </Typography>
        {!stats?.recentLogs || stats.recentLogs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No sync activity yet
          </Typography>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Action</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Source → Target</TableCell>
                  <TableCell>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Typography variant="body2" textTransform="capitalize">
                        {log.action}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.status}
                        color={log.status === 'success' ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {log.source} → {log.target}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDateTime(log.createdAt)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </DashboardLayout>
  );
}

