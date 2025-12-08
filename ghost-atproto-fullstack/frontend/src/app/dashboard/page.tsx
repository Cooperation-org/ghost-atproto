/**
 * Your Impact Dashboard - Shows user's civic engagement metrics
 *
 * File: frontend/src/app/dashboard/page.tsx
 */

'use client';

import { formatDateForDisplay } from '@/lib/hydration-utils';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventIcon from '@mui/icons-material/Event';
import ArticleIcon from '@mui/icons-material/Article';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageState, InlineError } from '@/components/PageState';
import { api, ApiError, CivicActionDto } from '@/lib/api';
import { Post } from '@/lib/types';

interface ImpactData {
  metrics: {
    completedActionsCount: number;
    activeCommitmentsCount: number;
    createdActionsCount: number;
    createdArticlesCount: number;
  };
  activeCommitments: Array<{
    id: string;
    status: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    civicAction: CivicActionDto;
  }>;
  completedActions: Array<{
    id: string;
    status: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    civicAction: CivicActionDto;
  }>;
  createdActions: CivicActionDto[];
  createdArticles: Post[];
}

export default function YourImpactPage() {
  const router = useRouter();
  const [impactData, setImpactData] = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    api.extractTokenFromUrl();

    try {
      const data = await api.getUserImpact();
      setImpactData(data);
    } catch (err) {
      console.error('[YourImpact] Failed to load:', err);
      if (err instanceof ApiError) {
        if (err.isUnauthorized()) {
          router.push('/login');
          return;
        }
        setError(err);
      } else {
        setError(new ApiError(
          err instanceof Error ? err.message : 'Failed to load data',
          500
        ));
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, engagementId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedEngagementId(engagementId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedEngagementId(null);
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedEngagementId) return;
    setActionError(null);

    try {
      await api.updateEngagement(selectedEngagementId, newStatus);
      const data = await api.getUserImpact();
      setImpactData(data);
    } catch (err) {
      console.error('[YourImpact] Failed to update engagement:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to update');
    }

    handleMenuClose();
  };

  const handleRemoveEngagement = async () => {
    if (!selectedEngagementId) return;
    setActionError(null);

    try {
      await api.deleteEngagement(selectedEngagementId);
      const data = await api.getUserImpact();
      setImpactData(data);
    } catch (err) {
      console.error('[YourImpact] Failed to remove engagement:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to remove');
    }

    handleMenuClose();
  };

  return (
    <DashboardLayout>
      <PageState
        loading={loading}
        error={error}
        onRetry={loadData}
        loadingText="Loading your impact data..."
      >
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
            Your Impact
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track your civic engagement and contributions
          </Typography>
        </Box>

        <InlineError error={actionError} onDismiss={() => setActionError(null)} />

        {impactData && (
          <>
            {/* Summary Metrics */}
            <Grid container spacing={3} sx={{ mb: 5 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main' }} />
                      <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                        {impactData.metrics.completedActionsCount}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Completed Actions
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <EventIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                      <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {impactData.metrics.activeCommitmentsCount}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Active Commitments
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <VolunteerActivismIcon sx={{ fontSize: 40, color: 'secondary.main' }} />
                      <Typography variant="h3" sx={{ fontWeight: 700, color: 'secondary.main' }}>
                        {impactData.metrics.createdActionsCount}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Created Actions
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <ArticleIcon sx={{ fontSize: 40, color: 'info.main' }} />
                      <Typography variant="h3" sx={{ fontWeight: 700, color: 'info.main' }}>
                        {impactData.metrics.createdArticlesCount}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Articles Published
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Active Commitments */}
            <Box sx={{ mb: 5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Active Commitments
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => router.push('/dashboard/civic-actions')}
                  sx={{ borderRadius: 2 }}
                >
                  Find Events
                </Button>
              </Box>

              {impactData.activeCommitments.length === 0 ? (
                <Paper
                  sx={{
                    p: 6,
                    textAlign: 'center',
                    borderRadius: 3,
                    border: '2px dashed',
                    borderColor: 'grey.300',
                    bgcolor: 'grey.50'
                  }}
                >
                  <EventIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No active commitments yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Find civic events and mark yourself as interested or going
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => router.push('/dashboard/civic-actions')}
                    sx={{ borderRadius: 2 }}
                  >
                    Browse Events
                  </Button>
                </Paper>
              ) : (
                <Grid container spacing={3}>
                  {impactData.activeCommitments.map((commitment) => {
                    const action = commitment.civicAction;
                    const isExternal = action.source !== 'user_submitted';

                    return (
                      <Grid size={{ xs: 12, md: 6 }} key={commitment.id}>
                        <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200' }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                              <Box sx={{ flexGrow: 1 }}>
                                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                                  <Chip
                                    label={commitment.status === 'interested' ? 'Interested' : 'Going'}
                                    size="small"
                                    color={commitment.status === 'going' ? 'primary' : 'default'}
                                    sx={{ fontWeight: 600 }}
                                  />
                                  {isExternal && (
                                    <Chip
                                      label={action.source}
                                      size="small"
                                      variant="outlined"
                                      sx={{ textTransform: 'capitalize' }}
                                    />
                                  )}
                                </Box>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                  {action.title}
                                </Typography>
                                {action.eventDate && (
                                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    {formatDateForDisplay(action.eventDate, {
                                      month: 'long',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </Typography>
                                )}
                                {action.location && (
                                  <Typography variant="body2" color="text.secondary">
                                    {action.location}
                                  </Typography>
                                )}
                              </Box>
                              <IconButton
                                onClick={(e) => handleMenuOpen(e, commitment.id)}
                                size="small"
                              >
                                <MoreVertIcon />
                              </IconButton>
                            </Box>
                            <Button
                              fullWidth
                              variant="outlined"
                              endIcon={isExternal ? <OpenInNewIcon /> : undefined}
                              onClick={() => {
                                if (isExternal && action.externalUrl) {
                                  window.open(action.externalUrl, '_blank');
                                } else {
                                  router.push('/dashboard/civic-actions');
                                }
                              }}
                              sx={{ borderRadius: 2, mt: 2 }}
                            >
                              {isExternal ? 'View on Mobilize' : 'View Details'}
                            </Button>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>

            {/* What You've Created */}
            <Box sx={{ mb: 5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  What You&apos;ve Created
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => router.push('/dashboard/civic-actions')}
                    sx={{ borderRadius: 2 }}
                  >
                    New Action
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => router.push('/dashboard/articles')}
                    sx={{ borderRadius: 2 }}
                  >
                    New Article
                  </Button>
                </Box>
              </Box>

              {impactData.createdActions.length === 0 && impactData.createdArticles.length === 0 ? (
                <Paper
                  sx={{
                    p: 6,
                    textAlign: 'center',
                    borderRadius: 3,
                    border: '2px dashed',
                    borderColor: 'grey.300',
                    bgcolor: 'grey.50'
                  }}
                >
                  <VolunteerActivismIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    You haven&apos;t created anything yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Create a civic action or publish an article to get started
                  </Typography>
                </Paper>
              ) : (
                <Grid container spacing={3}>
                  {/* Created Actions */}
                  {impactData.createdActions.map((action) => (
                    <Grid size={{ xs: 12, md: 6 }} key={action.id}>
                      <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200' }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <Chip
                              label={action.status}
                              size="small"
                              color={
                                action.status === 'approved' ? 'success' :
                                action.status === 'pending' ? 'warning' : 'error'
                              }
                              sx={{ textTransform: 'capitalize', fontWeight: 600 }}
                            />
                            {action.isPinned && (
                              <Chip label="Pinned" size="small" color="primary" />
                            )}
                          </Box>
                          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                            {action.title}
                          </Typography>
                          {action.eventDate && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              {formatDateForDisplay(action.eventDate, {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Typography>
                          )}
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {action.engagementCount} {action.engagementCount === 1 ? 'person' : 'people'} engaged
                          </Typography>
                          <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => router.push('/dashboard/civic-actions')}
                            sx={{ borderRadius: 2 }}
                          >
                            View Details
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}

                  {/* Created Articles */}
                  {impactData.createdArticles.slice(0, 4).map((article) => (
                    <Grid size={{ xs: 12, md: 6 }} key={article.id}>
                      <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'grey.200' }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <Chip
                              icon={article.atprotoUri ? <CheckCircleIcon /> : undefined}
                              label={article.atprotoUri ? 'Synced' : 'Pending'}
                              size="small"
                              color={article.atprotoUri ? 'success' : 'warning'}
                              sx={{ fontWeight: 600 }}
                            />
                          </Box>
                          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                            {article.title}
                          </Typography>
                          {article.publishedAt && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              {formatDateForDisplay(article.publishedAt, {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </Typography>
                          )}
                          <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => window.location.href = `/bridge/article/${article.id}`}
                            sx={{ borderRadius: 2 }}
                          >
                            Read Article
                          </Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </>
        )}

        {/* Engagement Status Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => handleUpdateStatus('interested')}>
            Mark as Interested
          </MenuItem>
          <MenuItem onClick={() => handleUpdateStatus('going')}>
            Mark as Going
          </MenuItem>
          <MenuItem onClick={() => handleUpdateStatus('completed')}>
            Mark as Completed
          </MenuItem>
          <MenuItem onClick={handleRemoveEngagement} sx={{ color: 'error.main' }}>
            Remove
          </MenuItem>
        </Menu>
      </PageState>
    </DashboardLayout>
  );
}
