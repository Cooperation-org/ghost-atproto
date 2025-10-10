'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Paper,
  CircularProgress,
  Avatar,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { Post } from '@/lib/types';

export default function ArticlePage() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPost = async () => {
      try {
        if (params?.id && typeof params.id === 'string') {
          const postData = await api.getPostById(params.id);
          setPost(postData);
        }
      } catch (err) {
        console.error('Failed to load article:', err);
        setError(err instanceof Error ? err.message : 'Failed to load article');
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [params?.id]);

  if (loading) {
    return (
      <DashboardLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress size={60} />
        </Box>
      </DashboardLayout>
    );
  }

  if (error || !post) {
    return (
      <DashboardLayout>
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Paper sx={{ p: 6, textAlign: 'center' }}>
            <Typography variant="h5" color="error" gutterBottom>
              {error || 'Article not found'}
            </Typography>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => router.push('/dashboard')}
              sx={{ mt: 3 }}
            >
              Back to Dashboard
            </Button>
          </Paper>
        </Container>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Container maxWidth="md" sx={{ py: 4 }}>
        {/* Back Button */}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/dashboard')}
          sx={{ mb: 3 }}
        >
          Back to Articles
        </Button>

        {/* Article Card */}
        <Paper
          elevation={2}
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            mb: 4,
          }}
        >
          {/* Feature Image */}
          {post.featureImage && (
            <Box
              sx={{
                width: '100%',
                height: 400,
                backgroundImage: `url(${post.featureImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          )}

          {/* Article Content */}
          <Box sx={{ p: 4 }}>
            {/* Status Badge */}
            {post.atprotoUri && (
              <Chip
                icon={<CheckCircleIcon />}
                label="Synced to Bluesky"
                color="success"
                sx={{ mb: 3 }}
              />
            )}

            {/* Title */}
            <Typography
              variant="h3"
              component="h1"
              gutterBottom
              sx={{
                fontWeight: 700,
                lineHeight: 1.2,
                mb: 3,
              }}
            >
              {post.title}
            </Typography>

            {/* Meta Information */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                mb: 4,
                flexWrap: 'wrap',
              }}
            >
              {/* Author */}
              {post.user && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: 'primary.main',
                    }}
                  >
                    {(post.user.name?.[0] || post.user.email[0]).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {post.user.name || post.user.email.split('@')[0]}
                    </Typography>
                    {post.user.atprotoHandle && (
                      <Typography variant="caption" color="text.secondary">
                        @{post.user.atprotoHandle}
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}

              {/* Published Date */}
              {post.publishedAt && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {new Date(post.publishedAt).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider sx={{ mb: 4 }} />

            {/* Article Content */}
            <Box
              sx={{
                '& img': {
                  maxWidth: '100%',
                  height: 'auto',
                  borderRadius: 2,
                  my: 3,
                },
                '& p': {
                  fontSize: '1.125rem',
                  lineHeight: 1.8,
                  mb: 2,
                  color: 'text.primary',
                },
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                  fontWeight: 600,
                  mt: 4,
                  mb: 2,
                  lineHeight: 1.3,
                },
                '& h2': {
                  fontSize: '2rem',
                },
                '& h3': {
                  fontSize: '1.5rem',
                },
                '& ul, & ol': {
                  pl: 3,
                  mb: 2,
                },
                '& li': {
                  fontSize: '1.125rem',
                  lineHeight: 1.8,
                  mb: 1,
                },
                '& a': {
                  color: 'primary.main',
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline',
                  },
                },
                '& blockquote': {
                  borderLeft: '4px solid',
                  borderColor: 'primary.main',
                  pl: 3,
                  py: 1,
                  my: 3,
                  fontStyle: 'italic',
                  color: 'text.secondary',
                },
                '& code': {
                  bgcolor: 'grey.100',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: '0.9em',
                  fontFamily: 'monospace',
                },
                '& pre': {
                  bgcolor: 'grey.900',
                  color: 'white',
                  p: 2,
                  borderRadius: 2,
                  overflow: 'auto',
                  my: 3,
                  '& code': {
                    bgcolor: 'transparent',
                    color: 'inherit',
                    p: 0,
                  },
                },
              }}
              dangerouslySetInnerHTML={{ __html: post.content || '' }}
            />

            {/* Share/Social Section */}
            <Box sx={{ mt: 6, pt: 4, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Published on CivicSky
              </Typography>
              {post.atprotoUri && (
                <Typography variant="caption" color="text.secondary">
                  Synced to Bluesky
                </Typography>
              )}
            </Box>
          </Box>
        </Paper>

        {/* Navigation */}
        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant="contained"
            onClick={() => router.push('/dashboard')}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            View All Articles
          </Button>
        </Box>
      </Container>
    </DashboardLayout>
  );
}

