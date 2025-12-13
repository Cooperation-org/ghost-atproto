'use client';

import { formatDateForDisplay } from '@/lib/hydration-utils';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Grid,
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
import SyncIcon from '@mui/icons-material/Sync';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api, ApiError } from '@/lib/api';
import { Post } from '@/lib/types';

export default function ArticlesPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncingCommentsFor, setSyncingCommentsFor] = useState<string | null>(null);
  const [commentSyncMessage, setCommentSyncMessage] = useState<{postId: string, message: string, errors?: string[]} | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState<string | null>(null);

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
      const postsData = await api.getPosts();
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

  const handleSyncFromGhost = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await api.syncPostsFromGhost();
      setSyncMessage(`✓ ${result.message} (${result.newPosts} new, ${result.updatedPosts} updated)`);
      // Reload posts after sync
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setSyncMessage(`✗ ${err.message}`);
      } else {
        setSyncMessage('✗ Failed to sync from Ghost. Check your Ghost URL and API key in settings.');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncComments = async (postId: string) => {
    setSyncingCommentsFor(postId);
    setCommentSyncMessage(null);
    try {
      const result = await api.syncCommentsForPost(postId);
      if (result.newComments > 0) {
        setCommentSyncMessage({
          postId,
          message: `✓ Synced ${result.newComments} new comment${result.newComments > 1 ? 's' : ''} from Bluesky`
        });
      } else {
        setCommentSyncMessage({
          postId,
          message: `✓ No new comments to sync`
        });
      }
      if (result.errors.length > 0) {
        setCommentSyncMessage({
          postId,
          message: `⚠ Synced with ${result.errors.length} error(s)`,
          errors: result.errors
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCommentSyncMessage({
          postId,
          message: `✗ ${err.message}`
        });
      } else {
        setCommentSyncMessage({
          postId,
          message: `✗ Failed to sync comments`
        });
      }
    } finally {
      setSyncingCommentsFor(null);
    }
  };

  // Open publish dialog with pre-filled content
  const handleOpenPublishDialog = (post: Post) => {
    setSelectedPost(post);
    setPublishError('');
    setPublishSuccess('');

    // Pre-fill with title and link
    // Replace HTML tags with a space to preserve word boundaries
    const textContent = post.content
      ? post.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150)
      : '';
    let defaultContent = post.title;
    if (textContent) {
      defaultContent += '\n\n' + textContent + '...';
    }
    if (post.ghostUrl) {
      defaultContent += '\n\n' + post.ghostUrl;
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
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Articles
        </Typography>
        <Button
          variant="contained"
          onClick={handleSyncFromGhost}
          disabled={syncing}
          startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <CloudIcon />}
          sx={{ textTransform: 'none' }}
        >
          {syncing ? 'Syncing...' : 'Sync from Ghost'}
        </Button>
      </Box>

      {/* Show sync message */}
      {syncMessage && (
        <Alert severity={syncMessage.startsWith('✓') ? 'success' : 'error'} sx={{ mb: 3 }} onClose={() => setSyncMessage('')}>
          {syncMessage}
        </Alert>
      )}

      {/* Show error if present */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} action={
          <Button color="inherit" size="small" onClick={loadData}>
            Retry
          </Button>
        }>
          {error.message}
        </Alert>
      )}

      {/* Show loading state */}
      {loading && posts.length === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            Loading articles...
          </Typography>
        </Box>
      )}

      {/* Show empty state */}
      {!loading && posts.length === 0 && !error && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
          <ArticleIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            No articles yet. Connect your Ghost site to start syncing.
          </Typography>
        </Box>
      )}

      {/* Show posts grid */}
      {posts.length > 0 && (
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
                  onClick={() => post.ghostUrl && window.open(post.ghostUrl, '_blank')}
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 3,
                    overflow: 'hidden',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    border: '1px solid',
                    borderColor: 'grey.200',
                    cursor: post.ghostUrl ? 'pointer' : 'default',
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
                            onClick={(e) => e.stopPropagation()}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPublishDialog(post);
                            }}
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

                        {/* Sync Comments button - only show if published to Bluesky */}
                        {post.atprotoUri && (
                          <>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSyncComments(post.id);
                              }}
                              fullWidth
                              variant="outlined"
                              disabled={syncingCommentsFor === post.id}
                              startIcon={syncingCommentsFor === post.id ? <CircularProgress size={16} /> : <SyncIcon />}
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
                              {syncingCommentsFor === post.id ? 'Syncing...' : 'Sync Comments'}
                            </Button>
                            {commentSyncMessage && commentSyncMessage.postId === post.id && (
                              <Alert
                                severity={commentSyncMessage.message.startsWith('✓') ? 'success' : 'error'}
                                sx={{ mt: 1 }}
                                onClose={() => {
                                  setCommentSyncMessage(null);
                                  setShowErrorDetails(null);
                                }}
                              >
                                <Box>
                                  {commentSyncMessage.errors && commentSyncMessage.errors.length > 0 ? (
                                    <>
                                      <Box
                                        component="span"
                                        sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                                        onClick={() => setShowErrorDetails(showErrorDetails === post.id ? null : post.id)}
                                      >
                                        {commentSyncMessage.message}
                                      </Box>
                                      {showErrorDetails === post.id && (
                                        <Box sx={{ mt: 1, fontSize: '0.875rem' }}>
                                          {commentSyncMessage.errors.map((error, idx) => (
                                            <Box key={idx} sx={{ mt: 0.5 }}>• {error}</Box>
                                          ))}
                                        </Box>
                                      )}
                                    </>
                                  ) : (
                                    commentSyncMessage.message
                                  )}
                                </Box>
                              </Alert>
                            )}
                          </>
                        )}

                        {post.ghostUrl && (
                          <Button
                            component={Link}
                            href={post.ghostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            fullWidth
                            variant="outlined"
                            startIcon={<OpenInNewIcon />}
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
                            Read on Ghost
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

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
