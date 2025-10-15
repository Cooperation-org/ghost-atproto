'use client';

import { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  TablePagination,
  Link,
  Button,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import PublishIcon from '@mui/icons-material/Publish';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { Post } from '@/lib/types';

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [publishing, setPublishing] = useState<string | null>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const postsData = await api.getAllPosts();
      setPosts(postsData);
    } catch (err) {
      setError('Failed to load posts');
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handlePublishToBluesky = async (postId: string) => {
    try {
      setPublishing(postId);
      // This would need to be implemented in the API
      // await api.publishToBluesky(postId);
      console.log('Publishing to Bluesky:', postId);
      await loadPosts(); // Refresh posts after publishing
    } catch (err) {
      console.error('Failed to publish to Bluesky:', err);
    } finally {
      setPublishing(null);
    }
  };

  const getStatusColor = (status: string): "success" | "error" | "warning" | "default" => {
    switch (status) {
      case 'published':
        return 'success';
      case 'draft':
        return 'warning';
      case 'scheduled':
        return 'default';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  };

  const paginatedPosts = posts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
          <Typography variant="h4">
            All Posts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Articles synced from Ghost to Bluesky by all authors
          </Typography>
        </Box>
        <Tooltip title="Refresh posts">
          <IconButton onClick={loadPosts} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Author</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ghost URL</TableCell>
                <TableCell>Bluesky Status</TableCell>
                <TableCell>Published</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedPosts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="textSecondary" sx={{ py: 4 }}>
                      No posts found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPosts.map((post) => (
                  <TableRow key={post.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="subtitle2" fontWeight="bold">
                          {post.title}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {truncateText(post.content.replace(/<[^>]*>/g, ''))}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {post.user?.name || 'Unknown Author'}
                        </Typography>
                        {post.user?.blueskyHandle && (
                          <Typography variant="caption" color="primary">
                            @{post.user.blueskyHandle}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={post.status}
                        color={getStatusColor(post.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {post.ghostUrl ? (
                        <Link href={post.ghostUrl} target="_blank" rel="noopener">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            View
                            <OpenInNewIcon fontSize="small" />
                          </Box>
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {post.atprotoUri ? (
                          <>
                            <CheckCircleIcon color="success" fontSize="small" />
                            <Typography variant="body2" color="success.main">
                              Published
                            </Typography>
                          </>
                        ) : (
                          <>
                            <PendingIcon color="disabled" fontSize="small" />
                            <Typography variant="body2" color="textSecondary">
                              Not published
                            </Typography>
                          </>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(post.publishedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {!post.atprotoUri && post.status === 'published' && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PublishIcon />}
                          onClick={() => handlePublishToBluesky(post.id)}
                          disabled={publishing === post.id}
                        >
                          {publishing === post.id ? 'Publishing...' : 'Publish to Bluesky'}
                        </Button>
                      )}
                      {post.atprotoUri && (
                        <Tooltip title={`ATProto URI: ${post.atprotoUri}`}>
                          <Typography variant="caption" color="textSecondary">
                            Published to Bluesky
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={posts.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </DashboardLayout>
  );
}