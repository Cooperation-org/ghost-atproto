'use client';

import { formatDateForDisplay } from '@/lib/hydration-utils';
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
  Avatar,
  Chip,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { Post } from '@/lib/types';

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const postsData = await api.getAllPosts(); // Get ALL posts from ALL users
        setPosts(postsData);
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

  return (
    <DashboardLayout>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Articles
        </Typography>
      </Box>

      {/* Articles Grid */}
      {posts.length === 0 ? (
        <Paper 
          sx={{ 
            p: 8, 
            textAlign: 'center', 
            borderRadius: 3,
            border: '2px dashed',
            borderColor: 'grey.300',
            bgcolor: 'grey.50'
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: 'primary.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3
            }}
          >
            <ArticleIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          </Box>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
            No Articles Yet
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400, mx: 'auto' }}>
            Connect your Ghost site to start syncing articles to Bluesky automatically
          </Typography>
        </Paper>
      ) : (
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
                  {/* Featured Image Placeholder */}
                  <Box
                    sx={{
                      height: 200,
                      background: gradient,
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
                    
                    {/* Article Icon */}
                    <ArticleIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.3)' }} />
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

                      {/* View Link */}
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
                        Read Full Article →
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </DashboardLayout>
  );
}
