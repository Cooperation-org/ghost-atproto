'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Button,
  Chip,
  CardMedia,
  Stack,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CampaignIcon from '@mui/icons-material/Campaign';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { PublicCivicActionsLayout } from '@/components/layout/PublicCivicActionsLayout';
import { api, CivicActionDto } from '@/lib/api';

interface CivicActionDetail extends CivicActionDto {
  createdAt?: string;
  updatedAt?: string;
  submittedBy?: string;
}

export default function CivicActionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [action, setAction] = useState<CivicActionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const id = params.id as string;

  useEffect(() => {
    async function loadAction() {
      try {
        setLoading(true);
        // Try public API first (works without authentication)
        try {
          const data = await api.getPublicCivicActionById(id);
          setAction(data);
          setError(null);
        } catch {
          // If public API fails, try authenticated API (for pending/rejected actions owned by user or admin)
          const data = await api.getCivicActionById(id);
          setAction(data);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load civic action');
        console.error('Failed to load civic action:', err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      loadAction();
    }
  }, [id]);

  if (loading) {
    return (
      <PublicCivicActionsLayout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </PublicCivicActionsLayout>
    );
  }

  if (error || !action) {
    return (
      <PublicCivicActionsLayout>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" color="error" gutterBottom>
            {error || 'Civic action not found'}
          </Typography>
          <Button
            variant="contained"
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push('/dashboard/civic-actions')}
            sx={{ mt: 2 }}
          >
            Back to Civic Actions
          </Button>
        </Box>
      </PublicCivicActionsLayout>
    );
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Not specified';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <PublicCivicActionsLayout>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/dashboard/civic-actions')}
        sx={{ mb: 3 }}
      >
        Back to Civic Actions
      </Button>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {/* Hero Section with Image */}
        {action.imageUrl && (
          <Box sx={{ position: 'relative', height: 400, bgcolor: 'grey.900' }}>
            <CardMedia
              component="img"
              height="400"
              image={action.imageUrl}
              alt={action.title}
              sx={{ objectFit: 'cover' }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                p: 3,
              }}
            >
              <Chip
                label={action.status.toUpperCase()}
                color={getStatusColor(action.status)}
                sx={{ mb: 2 }}
              />
              <Typography variant="h3" sx={{ color: 'white', fontWeight: 700 }}>
                {action.title}
              </Typography>
            </Box>
          </Box>
        )}

        {!action.imageUrl && (
          <Box
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              p: 6,
              textAlign: 'center',
            }}
          >
            <CampaignIcon sx={{ fontSize: 80, mb: 2, opacity: 0.3 }} />
            <Chip
              label={action.status.toUpperCase()}
              color={getStatusColor(action.status)}
              sx={{ mb: 2 }}
            />
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              {action.title}
            </Typography>
          </Box>
        )}

        {/* Content Section */}
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4 }}>
            {/* Main Description */}
            <Box sx={{ flex: { md: 2 } }}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
                About This Event
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.8,
                  color: 'text.secondary',
                  fontSize: '1.1rem',
                }}
              >
                {action.description || 'No description available.'}
              </Typography>
            </Box>

            {/* Details Sidebar */}
            <Box sx={{ flex: { md: 1 } }}>
              <Card
                elevation={2}
                sx={{
                  borderRadius: 2,
                  p: 2,
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Event Details
                </Typography>

                <Stack spacing={2}>
                  {/* Event Type */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Event Type
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {action.eventType || 'Not specified'}
                    </Typography>
                  </Box>

                  {/* Location */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      <LocationOnIcon
                        sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }}
                      />
                      Location
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {action.location || 'Not specified'}
                    </Typography>
                  </Box>

                  {/* Date/Time */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      <CalendarTodayIcon
                        sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }}
                      />
                      Event Date
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {formatDate(action.eventDate)}
                    </Typography>
                  </Box>

                  {/* Status */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Status
                    </Typography>
                    <Chip
                      label={action.status}
                      color={getStatusColor(action.status)}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>
                </Stack>

                {/* Action Buttons */}
                <Box sx={{ mt: 3, display: 'flex', gap: 1, flexDirection: 'column' }}>
                  {action.status === 'approved' && (
                    <>
                      <Button
                        variant="contained"
                        fullWidth
                        sx={{
                          textTransform: 'none',
                          py: 1.5,
                          fontWeight: 600,
                          borderRadius: 2,
                        }}
                      >
                        Join Event
                      </Button>
                      <Button
                        variant="outlined"
                        fullWidth
                        sx={{
                          textTransform: 'none',
                          py: 1.5,
                          borderRadius: 2,
                        }}
                      >
                        Share Event
                      </Button>
                    </>
                  )}
                </Box>
              </Card>
            </Box>
          </Box>
        </CardContent>
      </Paper>

      {/* Additional Info Section */}
      <Paper sx={{ mt: 3, p: 3, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Get Involved
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Interested in this civic action? Mark your calendar and show up! Civic engagement helps
          strengthen our communities and democracy. Your participation matters.
        </Typography>
      </Paper>
    </PublicCivicActionsLayout>
  );
}

