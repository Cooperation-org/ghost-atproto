'use client';

import { formatDateForDisplay } from '@/lib/hydration-utils';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Button,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Link,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudIcon from '@mui/icons-material/Cloud';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageState } from '@/components/PageState';
import { api, ApiError } from '@/lib/api';
import { Post } from '@/lib/types';

export default function ArticlesPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Bluesky publish dialog state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [postContent, setPostContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const postsData = await api.getAllPosts();
      setPosts(postsData);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized()) {
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err : new Error('Failed to load articles'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.extractTokenFromUrl();
    loadData();
  }, [router]);

  // Open publish dialog with pre-filled content
  const handleOpenPublishDialog = (post: Post) => {
    setSelectedPost(post);
    setPublishError('');
    setPublishSuccess('');

    // Pre-fill with title and link
    const textContent = post.content ? post.content.replace(/<[^>]*>/g, '').substring(0, 150) : '';
    let defaultContent = post.title;
    if (textContent) {
      defaultContent += `\n\n${textContent}...`;
    }
    if (post.ghostUrl) {
      defaultContent += `\n\n${post.ghostUrl}`;
    }
    // Trim to 300 chars if needed
    if (defaultContent.length > 300) {
      defaultContent = defaultContent.substring(0, 297) + '...';
    }
    setPostContent(defaultContent);
    setPublishDialogOpen(true);
  };

  const handleClosePublishDialog = () => {
    setPublishDialogOpen(false);
    setSelectedPost(null);
    setPostContent('');
    setPublishError('');
  };

  const handlePublishToBluesky = async () => {
    if (!selectedPost || !postContent.trim()) return;

    setPublishing(true);
    setPublishError('');
    setPublishSuccess('');

    try {
      const result = await api.publishToBluesky(selectedPost.id, postContent);
      setPublishSuccess(`Posted to Bluesky! View at: ${result.atprotoUri}`);

      // Update the post in the list to show it's synced
      setPosts(posts.map(p =>
        p.id === selectedPost.id
          ? { ...p, atprotoUri: result.atprotoUri, atprotoCid: result.atprotoCid }
          : p
      ));

      // Close dialog after a short delay
      setTimeout(() => {
        handleClosePublishDialog();
      }, 2000);
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Failed to publish to Bluesky');
    } finally {
      setPublishing(false);
    }
  };

  // Convert AT URI to Bluesky web URL
  const getBlueskyPostUrl = (atUri: string): string => {
    // at://did:plc:xxx/app.bsky.feed.post/xxx -> https://bsky.app/profile/did:plc:xxx/post/xxx
    const match = atUri.match(/at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/(.+)/);
    if (match) {
      return `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
    }
    return atUri;
  };

  return (
    <DashboardLayout>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Articles
        </Typography>
      </Box>

      <PageState
        loading={loading}
        error={error}
        empty={posts.length === 0}
        emptyMessage="No articles yet. Connect your Ghost site to start syncing."
        emptyIcon={<ArticleIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />}
        onRetry={loadData}
        loadingText="Loading articles..."
      >
        <Grid container spacing={4}>
          {posts.map((post: Post & { user?: { id: string; email: string; name?: string | null } }, index: number) => {
            // Generate a gradient based on index
            const gradients = [
              'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
              'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
              'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
            ];
            const gradient = gradients[index % gradients.length];

            return (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={post.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 3,
                    overflow: 'hidden',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    border: '1px solid',
                    borderColor: 'grey.200',
                    '&:hover': {
                      transform: 'translateY(-8px)',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                      borderColor: 'primary.main',
                    }
                  }}
                >
                  {/* Featured Image (fallback to gradient when missing) */}
                  <Box
                    sx={{
                      height: 200,
                      background: post.featureImage
                        ? `url(${post.featureImage})`
                        : gradient,
                      backgroundSize: post.featureImage ? 'cover' : undefined,
                      backgroundPosition: post.featureImage ? 'center' : undefined,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {/* Status Badge Overlay */}
                    <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
                      {post.atprotoUri ? (
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="Synced"
                          size="small"
                          sx={{
                            bgcolor: 'rgba(255, 255, 255, 0.95)',
                            color: 'success.main',
                            fontWeight: 600,
                            backdropFilter: 'blur(10px)'
                          }}
                        />
                      ) : (
                        <Chip
                          label="Pending"
                          size="small"
                          sx={{
                            bgcolor: 'rgba(255, 255, 255, 0.95)',
                            color: 'warning.main',
                            fontWeight: 600,
                            backdropFilter: 'blur(10px)'
                          }}
                        />
                      )}
                    </Box>

                    {/* Placeholder icon only when no image */}
                    {!post.featureImage && (
                      <ArticleIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.3)' }} />
                    )}
                  </Box>

                  <CardContent sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                    {/* Title */}
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        lineHeight: 1.4,
                        mb: 2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        color: 'text.primary',
                        minHeight: '3.5rem'
                      }}
                    >
                      {post.title}
                    </Typography>

                    {/* Excerpt */}
                    {post.content && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 3,
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.7,
                          flexGrow: 1
                        }}
                      >
                        {post.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
                      </Typography>
                    )}

                    {/* Footer Section */}
                    <Box sx={{ mt: 'auto' }}>
                      {/* Author & Date */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        {post.user && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar
                              sx={{
                                width: 32,
                                height: 32,
                                fontSize: '0.875rem',
                                bgcolor: 'primary.main',
                                fontWeight: 600
                              }}
                            >
                              {(post.user.name?.[0] || post.user.email[0]).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography variant="caption" display="block" fontWeight={600}>
                                {post.user.name || post.user.email.split('@')[0]}
                              </Typography>
                              {post.publishedAt && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {formatDateForDisplay(post.publishedAt, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        )}
                      </Box>

                      {/* Action Buttons */}
                      <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                        {/* Post to Bluesky button - only show if not already posted */}
                        {post.atprotoUri ? (
                          <Button
                            component={Link}
                            href={getBlueskyPostUrl(post.atprotoUri)}
                            target="_blank"
                            rel="noopener noreferrer"
                            fullWidth
                            variant="contained"
                            startIcon={<OpenInNewIcon />}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 2,
                              py: 1,
                              fontWeight: 600,
                              bgcolor: '#0085ff',
                              '&:hover': {
                                bgcolor: '#0066cc'
                              }
                            }}
                          >
                            View on Bluesky
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleOpenPublishDialog(post)}
                            fullWidth
                            variant="contained"
                            startIcon={<CloudIcon />}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 2,
                              py: 1,
                              fontWeight: 600,
                              bgcolor: '#0085ff',
                              '&:hover': {
                                bgcolor: '#0066cc'
                              }
                            }}
                          >
                            Post to Bluesky
                          </Button>
                        )}

                        <Button
                          onClick={() => window.location.href = `/bridge/article/${post.id}`}
                          fullWidth
                          variant="outlined"
                          sx={{
                            textTransform: 'none',
                            borderRadius: 2,
                            py: 1,
                            fontWeight: 600,
                            '&:hover': {
                              bgcolor: 'primary.main',
                              color: 'white',
                              borderColor: 'primary.main'
                            }
                          }}
                        >
                          Read Full Article
                        </Button>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </PageState>

      {/* Publish to Bluesky Dialog */}
      <Dialog
        open={publishDialogOpen}
        onClose={handleClosePublishDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudIcon sx={{ color: '#0085ff' }} />
            Post to Bluesky
          </Box>
        </DialogTitle>
        <DialogContent>
          {publishError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {publishError}
            </Alert>
          )}
          {publishSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {publishSuccess}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Edit the content below before posting to Bluesky. Maximum 300 characters.
          </Typography>

          {selectedPost && (
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Article: {selectedPost.title}
            </Typography>
          )}

          <TextField
            fullWidth
            multiline
            rows={6}
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            placeholder="Write your Bluesky post..."
            error={postContent.length > 300}
            helperText={`${postContent.length}/300 characters${postContent.length > 300 ? ' (exceeds limit)' : ''}`}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClosePublishDialog} disabled={publishing}>
            Cancel
          </Button>
          <Button
            onClick={handlePublishToBluesky}
            variant="contained"
            disabled={publishing || postContent.length === 0 || postContent.length > 300}
            startIcon={publishing ? <CircularProgress size={16} color="inherit" /> : <CloudIcon />}
            sx={{
              bgcolor: '#0085ff',
              '&:hover': { bgcolor: '#0066cc' }
            }}
          >
            {publishing ? 'Posting...' : 'Post to Bluesky'}
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
