'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  Avatar,
  Stack,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PeopleIcon from '@mui/icons-material/People';
import CampaignIcon from '@mui/icons-material/Campaign';
import CloudIcon from '@mui/icons-material/Cloud';
import SearchIcon from '@mui/icons-material/Search';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface EventTimeslot {
  start_date: number;
  end_date: number;
  id: number;
  is_full: boolean;
}

interface EventSponsor {
  name: string;
  logo_url?: string;
  org_type: string;
  state?: string;
}

interface CivicEvent {
  id: number | string; // Can be number (Mobilize) or string (database ID)
  title: string;
  summary: string;
  description: string;
  event_type?: string | null;
  featured_image_url?: string;
  timeslots: EventTimeslot[];
  sponsor: EventSponsor;
  location?: {
    venue?: string;
    locality?: string;
    region?: string;
  };
  browser_url: string;
  is_virtual: boolean;
  timezone: string;
  actionId?: string; // Store the original database civic action ID
}

// Helper to ensure event ID is number for imageErrors Set
const getEventIdAsNumber = (event: CivicEvent): number => {
  if (typeof event.id === 'number') return event.id;
  // Convert string ID to number for hashing
  return typeof event.id === 'string' ? parseInt(event.id, 10) || 0 : 0;
};

interface CivicEventsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  data: CivicEvent[];
}

export default function CivicActionsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<CivicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [allEvents, setAllEvents] = useState<CivicEvent[]>([]);
  interface MyCivicAction {
    id: string;
    title: string;
    status: 'pending' | 'approved' | 'rejected' | string;
    location?: string | null;
    description?: string | null;
    eventType?: string | null;
    eventDate?: string | null;
    imageUrl?: string | null;
  }
  const [myActions, setMyActions] = useState<MyCivicAction[]>([]);
  const [adminPending, setAdminPending] = useState<MyCivicAction[]>([]);
  const [approvedActions, setApprovedActions] = useState<MyCivicAction[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modLoadingId, setModLoadingId] = useState<string | null>(null);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  
  // Admin detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<MyCivicAction | null>(null);
  
  // Advanced filters
  const [zipcodeFilter, setZipcodeFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState('');
  const [excludeFullFilter, setExcludeFullFilter] = useState(false);
  const [highPriorityFilter, setHighPriorityFilter] = useState(false);

  // Create Civic Action modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newEventType, setNewEventType] = useState('');
  const [newEventTypeOther, setNewEventTypeOther] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newEventDate, setNewEventDate] = useState(''); // ISO string
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputId = 'civic-action-image-input';

  // Cleanup blob URLs on unmount and validate on mount
  useEffect(() => {
    // On mount, clear any stale blob URLs (from hot reload or cached state)
    if (imagePreview && imagePreview.startsWith('blob:')) {
      setImagePreview(null);
      setImageFile(null);
    }
    
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(imagePreview);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEvents = useCallback(async (cursor?: string, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const response = await api.getCivicEvents({ cursor }) as unknown as CivicEventsResponse;
      
      if (append) {
        setAllEvents(prev => {
          // Filter out duplicate events by ID
          const existingIds = new Set(prev.map(event => event.id));
          const newEvents = response.data.filter(event => !existingIds.has(event.id));
          return [...prev, ...newEvents];
        });
      } else {
        setAllEvents(response.data);
      }
      
      setNextCursor(response.next);
      setHasMore(!!response.next);
    } catch (error) {
      console.error('Failed to load civic events:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMoreEvents = useCallback(() => {
    if (nextCursor && !loadingMore) {
      loadEvents(nextCursor, true);
    }
  }, [nextCursor, loadingMore, loadEvents]);

  // Convert approved civic actions to CivicEvent format
  const convertToCivicEvent = useCallback((action: MyCivicAction): CivicEvent => {
    const eventDate = action.eventDate ? new Date(action.eventDate).getTime() / 1000 : Date.now() / 1000;
    return {
      id: Date.now() + Math.floor(Math.random() * 1000), // Unique display ID
      actionId: action.id, // Store original database ID
      title: action.title,
      summary: action.description || '',
      description: action.description || '',
      event_type: action.eventType || 'COMMUNITY',
      featured_image_url: action.imageUrl || undefined,
      timeslots: [{
        start_date: eventDate,
        end_date: eventDate + 3600, // 1 hour default duration
        id: Date.now() + Math.floor(Math.random() * 1000),
        is_full: false,
      }],
      sponsor: {
        name: 'Community Action',
        org_type: 'COMMUNITY',
      },
      location: action.location ? {
        venue: action.location,
        locality: action.location,
        region: '',
      } : undefined,
      browser_url: '#',
      is_virtual: false,
      timezone: 'America/New_York',
    };
  }, []);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter and search effect
  useEffect(() => {
    // Merge Mobilize events with approved civic actions
    const approvedCivicEvents = approvedActions.map(convertToCivicEvent);
    let filteredEvents = [...allEvents, ...approvedCivicEvents];

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filteredEvents = filteredEvents.filter(event => 
        event.title.toLowerCase().includes(query) ||
        event.summary.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.sponsor.name.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (categoryFilter) {
      filteredEvents = filteredEvents.filter(event => event.event_type === categoryFilter);
    }

    // Apply location filter
    if (statusFilter === 'virtual') {
      filteredEvents = filteredEvents.filter(event => event.is_virtual);
    } else if (statusFilter === 'in-person') {
      filteredEvents = filteredEvents.filter(event => !event.is_virtual);
    }

    // Apply date range filter
    if (dateRangeFilter) {
      const now = Math.floor(Date.now() / 1000);
      filteredEvents = filteredEvents.filter(event => {
        if (!event.timeslots || event.timeslots.length === 0) return false;
        const eventStart = event.timeslots[0].start_date;
        
        switch (dateRangeFilter) {
          case 'today': {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            return eventStart >= Math.floor(todayStart.getTime() / 1000) && 
                   eventStart <= Math.floor(todayEnd.getTime() / 1000);
          }
          case 'this-week': {
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            return eventStart >= Math.floor(weekStart.getTime() / 1000);
          }
          case 'this-month': {
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            return eventStart >= Math.floor(monthStart.getTime() / 1000);
          }
          case 'upcoming':
            return eventStart >= now;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filteredEvents.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'type':
          return (a.event_type || '').localeCompare(b.event_type || '');
        case 'date':
        default:
          const aDate = a.timeslots?.[0]?.start_date || 0;
          const bDate = b.timeslots?.[0]?.start_date || 0;
          return bDate - aDate; // Sort descending (latest first)
      }
    });

    setEvents(filteredEvents);
  }, [allEvents, approvedActions, debouncedSearchQuery, categoryFilter, statusFilter, dateRangeFilter, sortBy, convertToCivicEvent]);

  // Function to compress image before converting to base64
  const compressImage = useCallback((file: File, maxWidth: number = 600, quality: number = 0.6): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }, []);

  // Function to convert image file to base64
  const convertImageToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // Function to refresh civic action data
  const refreshCivicActions = useCallback(async () => {
    try {
      // Load approved civic actions using PUBLIC API (works without authentication)
      const approved = await api.getPublicCivicActions();
      const cleanedApproved = approved.map(action => ({
        ...action,
        imageUrl: action.imageUrl && action.imageUrl.startsWith('blob:') ? null : action.imageUrl,
      }));
      setApprovedActions(cleanedApproved);
    } catch (error) {
      console.log('Could not load public civic actions:', error);
    }

    // Try to load authenticated user data (optional - only if logged in)
    try {
      // Load user's own civic actions (pending/approved/rejected)
      const mine = await api.getMyCivicActions();
      const cleanedMine = mine.map(action => ({
        ...action,
        imageUrl: action.imageUrl && action.imageUrl.startsWith('blob:') ? null : action.imageUrl,
      }));
      setMyActions(cleanedMine);
    } catch {
      // User not logged in - this is fine
    }

    try {
      // Check admin and load pending submissions for moderation
      const me = await api.getMe();
      if (me.role === 'ADMIN') {
        setIsAdmin(true);
        const pending = await api.getCivicActions('pending');
        const cleanedPending = pending.map(action => ({
          ...action,
          imageUrl: action.imageUrl && action.imageUrl.startsWith('blob:') ? null : action.imageUrl,
        }));
        setAdminPending(cleanedPending);
      }
    } catch {
      // User not logged in or not admin - this is fine
    }
  }, []);

  // Load initial events
  useEffect(() => {
    loadEvents();
    refreshCivicActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 1000 && // Load when 1000px from bottom
        hasMore &&
        !loadingMore &&
        !loading
      ) {
        loadMoreEvents();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loading, loadMoreEvents]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getEventTypeColor = (type?: string | null) => {
    if (!type) return '#757575';
    const colors: Record<string, string> = {
      'CANVASS': '#1976d2',
      'PHONE_BANK': '#2e7d32',
      'TEXT_BANK': '#7b1fa2',
      'MEETING': '#d32f2f',
      'COMMUNITY': '#f57c00',
      'TRAINING': '#0288d1',
    };
    return colors[type] || '#757575';
  };

  const handleImageError = (eventId: number) => {
    setImageErrors(prev => new Set(prev).add(eventId));
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
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Civic Actions Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Discover and participate in civic engagement events in your community
        </Typography>
      </Box>

      {/* Search and Filter Bar */}
      <Paper
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 2,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          gap: 2, 
          alignItems: 'center', 
          flexWrap: 'wrap',
          flexDirection: { xs: 'column', sm: 'row' },
        }}>
          {/* Search Bar */}
          <TextField
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              width: { xs: '100%', sm: 300 },
              minWidth: { xs: 'auto', sm: 300 },
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }
            }}
          />

          {/* Filters Row */}
          <Box sx={{ 
            display: 'flex', 
            gap: 2, 
            alignItems: 'center',
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
            justifyContent: { xs: 'space-between', sm: 'flex-start' },
          }}>
            {/* Category Filter */}
            <FormControl sx={{ 
              minWidth: { xs: 'calc(50% - 8px)', sm: 150 },
              width: { xs: 'auto', sm: 'auto' },
            }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryFilter}
                label="Category"
                onChange={(e) => setCategoryFilter(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Categories</MenuItem>
                <MenuItem value="CANVASS">Canvass</MenuItem>
                <MenuItem value="PHONE_BANK">Phone Bank</MenuItem>
                <MenuItem value="TEXT_BANK">Text Bank</MenuItem>
                <MenuItem value="MEETING">Meeting</MenuItem>
                <MenuItem value="COMMUNITY">Community</MenuItem>
                <MenuItem value="TRAINING">Training</MenuItem>
              </Select>
            </FormControl>

            {/* Status Filter */}
            <FormControl sx={{ 
              minWidth: { xs: 'calc(50% - 8px)', sm: 120 },
              width: { xs: 'auto', sm: 'auto' },
            }}>
              <InputLabel>Location</InputLabel>
              <Select
                value={statusFilter}
                label="Location"
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Locations</MenuItem>
                <MenuItem value="virtual">Virtual Events</MenuItem>
                <MenuItem value="in-person">In-Person Events</MenuItem>
              </Select>
            </FormControl>

            {/* Sort By */}
            <FormControl sx={{ 
              minWidth: { xs: 'calc(50% - 8px)', sm: 120 },
              width: { xs: 'auto', sm: 'auto' },
            }}>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={sortBy}
                label="Sort By"
                onChange={(e) => setSortBy(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="date">Date</MenuItem>
                <MenuItem value="title">Title</MenuItem>
                <MenuItem value="type">Type</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Advanced Filters Row */}
          <Box sx={{ 
            display: 'flex', 
            gap: 2, 
            alignItems: 'center',
            flexWrap: 'wrap',
            width: '100%',
            mt: 2,
            pt: 2,
            borderTop: '1px solid',
            borderColor: 'grey.200',
          }}>
            {/* Zipcode Filter */}
            <TextField
              placeholder="Enter zipcode for location-based results"
              value={zipcodeFilter}
              onChange={(e) => setZipcodeFilter(e.target.value)}
              sx={{
                width: { xs: '100%', sm: 250 },
                minWidth: { xs: 'auto', sm: 250 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LocationOnIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }
              }}
            />

            {/* Date Range Filter */}
            <FormControl sx={{ 
              minWidth: { xs: 'calc(50% - 8px)', sm: 150 },
              width: { xs: 'auto', sm: 'auto' },
            }}>
              <InputLabel>Date Range</InputLabel>
              <Select
                value={dateRangeFilter}
                label="Date Range"
                onChange={(e) => setDateRangeFilter(e.target.value)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="">All Dates</MenuItem>
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="this-week">This Week</MenuItem>
                <MenuItem value="this-month">This Month</MenuItem>
                <MenuItem value="upcoming">Upcoming Only</MenuItem>
              </Select>
            </FormControl>

            {/* Advanced Options */}
            <Box sx={{ 
              display: 'flex', 
              gap: 1, 
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              <Button
                variant={excludeFullFilter ? "contained" : "outlined"}
                size="small"
                onClick={() => setExcludeFullFilter(!excludeFullFilter)}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  px: 2,
                  py: 0.5,
                  fontSize: '0.8rem',
                }}
              >
                Exclude Full Events
              </Button>
              
              <Button
                variant={highPriorityFilter ? "contained" : "outlined"}
                size="small"
                onClick={() => setHighPriorityFilter(!highPriorityFilter)}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  px: 2,
                  py: 0.5,
                  fontSize: '0.8rem',
                }}
              >
                High Priority Only
              </Button>
            </Box>
          </Box>

          {/* Clear Filters Button */}
          <Button
            variant="outlined"
            onClick={() => {
              setSearchQuery('');
              setCategoryFilter('');
              setStatusFilter('');
              setSortBy('date');
              setZipcodeFilter('');
              setDateRangeFilter('');
              setExcludeFullFilter(false);
              setHighPriorityFilter(false);
            }}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              px: 3,
              py: 1.5,
              fontWeight: 600,
              ml: { xs: 0, sm: 1 },
              width: { xs: '100%', sm: 'auto' },
              mt: { xs: 1, sm: 0 },
            }}
          >
            Clear Filters
          </Button>

          {/* Create New Action Button */}
          <Button
            variant="contained"
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              px: 3,
              py: 1.5,
              fontWeight: 600,
              ml: { xs: 0, sm: 1 },
              width: { xs: '100%', sm: 'auto' },
              mt: { xs: 1, sm: 0 },
            }}
            onClick={() => {
              // Clear any stale state before opening
              setImagePreview(null);
              setImageFile(null);
              setCreateOpen(true);
            }}
          >
            Create New Action
          </Button>
        </Box>
      </Paper>

      {/* Create Civic Action Dialog */}
      <Dialog open={createOpen} onClose={() => {
        if (!createLoading) {
          // Clean up blob URL when closing
          if (imagePreview && imagePreview.startsWith('blob:')) {
            try { URL.revokeObjectURL(imagePreview); } catch {}
          }
          setCreateOpen(false);
        }
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Create Civic Action</DialogTitle>
        <DialogContent dividers>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              fullWidth
              required
              disabled={createLoading}
            />
            <TextField
              label="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              fullWidth
              required
              multiline
              minRows={3}
              disabled={createLoading}
            />
            <FormControl fullWidth required>
              <InputLabel>Event Type</InputLabel>
              <Select
                value={newEventType}
                label="Event Type"
                onChange={(e) => setNewEventType(String(e.target.value))}
                disabled={createLoading}
              >
                <MenuItem value="">Select type</MenuItem>
                <MenuItem value="CANVASS">Canvass</MenuItem>
                <MenuItem value="PHONE_BANK">Phone Bank</MenuItem>
                <MenuItem value="TEXT_BANK">Text Bank</MenuItem>
                <MenuItem value="MEETING">Meeting</MenuItem>
                <MenuItem value="COMMUNITY">Community</MenuItem>
                <MenuItem value="TRAINING">Training</MenuItem>
                <MenuItem value="OTHER">Other</MenuItem>
              </Select>
            </FormControl>
            {newEventType === 'OTHER' && (
              <TextField
                label="Specify Event Type"
                value={newEventTypeOther}
                onChange={(e) => setNewEventTypeOther(e.target.value)}
                fullWidth
                required
                disabled={createLoading}
                helperText="Provide a custom event type"
              />
            )}
            <TextField
              label="Location"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              fullWidth
              required
              disabled={createLoading}
            />
            <TextField
              label="Event Date"
              type="datetime-local"
              value={newEventDate}
              onChange={(e) => setNewEventDate(e.target.value)}
              fullWidth
              required
              disabled={createLoading}
              InputLabelProps={{ shrink: true }}
              helperText="Local time will be converted to UTC"
            />

            {/* Add Photo (optional) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input
                id={fileInputId}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  // Revoke previous blob to avoid leaks/broken refs
                  if (imagePreview && imagePreview.startsWith('blob:')) {
                    try { URL.revokeObjectURL(imagePreview); } catch {}
                  }
                  setImageFile(file || null);
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setImagePreview(url);
                  } else {
                    setImagePreview(null);
                  }
                }}
              />
              <Button
                variant="outlined"
                onClick={() => document.getElementById(fileInputId)?.click()}
                disabled={createLoading}
              >
                {imageFile ? 'Change Photo' : 'Add Photo (optional)'}
              </Button>
              {imageFile && (
                <Button
                  variant="text"
                  color="error"
                  onClick={() => { 
                    // Revoke blob URL before removing
                    if (imagePreview && imagePreview.startsWith('blob:')) {
                      try { URL.revokeObjectURL(imagePreview); } catch {}
                    }
                    setImageFile(null); 
                    setImagePreview(null); 
                  }}
                  disabled={createLoading}
                >
                  Remove
                </Button>
              )}
            </Box>
            {imagePreview && (
              <Box sx={{ mt: 1 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  style={{ maxWidth: '100%', borderRadius: 8 }} 
                  onError={() => {
                    // If image fails to load (e.g., invalid blob URL), hide it
                    console.warn('Image preview failed to load:', imagePreview);
                    setImagePreview(null);
                    setImageFile(null);
                  }}
                />
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={createLoading} onClick={() => { 
            // Clean up blob URL when canceling
            if (imagePreview && imagePreview.startsWith('blob:')) {
              try { URL.revokeObjectURL(imagePreview); } catch {}
            }
            setCreateOpen(false); 
            (globalThis as { __editActionId?: string }).__editActionId = undefined; 
          }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={createLoading}
            onClick={async () => {
              setCreateError(null);
              if (!newTitle.trim() || !newDescription.trim() || !newEventType || (newEventType === 'OTHER' && !newEventTypeOther.trim()) || !newLocation.trim() || !newEventDate) {
                setCreateError('All fields are required except the photo');
                return;
              }
              setCreateLoading(true);
              try {
                const isoDate = newEventDate ? new Date(newEventDate).toISOString() : undefined;
                const editId = (globalThis as { __editActionId?: string }).__editActionId;
                
                // Convert image file to base64 if present
                let imageUrl: string | undefined = undefined;
                if (imageFile) {
                  // Compress image first to reduce size
                  const compressedFile = await compressImage(imageFile);
                  imageUrl = await convertImageToBase64(compressedFile);
                } else if (imagePreview && !imagePreview.startsWith('blob:')) {
                  // Use existing image URL if it's not a blob
                  imageUrl = imagePreview;
                }
                
                if (editId) {
                  await api.updateCivicAction(editId, {
                    title: newTitle.trim(),
                    description: newDescription.trim(),
                    eventType: newEventType === 'OTHER' ? newEventTypeOther.trim() : newEventType,
                    location: newLocation || undefined,
                    eventDate: isoDate,
                    imageUrl,
                  });
                  setCreateSuccess('Civic action updated');
                  // Refresh civic actions to show updated action
                  await refreshCivicActions();
                } else {
                  await api.createCivicAction({
                    title: newTitle.trim(),
                    description: newDescription.trim(),
                    eventType: newEventType === 'OTHER' ? newEventTypeOther.trim() : newEventType,
                    location: newLocation || undefined,
                    eventDate: isoDate,
                    imageUrl,
                  });
                  setCreateSuccess('Civic action submitted for review');
                  // Refresh civic actions to show the new pending action
                  await refreshCivicActions();
                }
                // Clean up blob URL after successful submission
                if (imagePreview && imagePreview.startsWith('blob:')) {
                  try { URL.revokeObjectURL(imagePreview); } catch {}
                }
                // reset form
                setNewTitle('');
                setNewDescription('');
                setNewEventType('');
                setNewEventTypeOther('');
                setNewLocation('');
                setNewEventDate('');
                setImageFile(null);
                setImagePreview(null);
                setCreateOpen(false);
                (globalThis as { __editActionId?: string }).__editActionId = undefined;
                // Optionally refresh approved list for non-admins; admins will see pending via dedicated screen later
                // No change to Mobilize events list; this submission is handled in admin moderation views
              } catch (e: unknown) {
                setCreateError(e instanceof Error ? e.message : 'Failed to submit action');
              } finally {
                setCreateLoading(false);
              }
            }}
          >
            {createLoading ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(createSuccess)}
        autoHideDuration={3000}
        onClose={() => setCreateSuccess(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setCreateSuccess(null)} severity="success" sx={{ width: '100%' }}>
          {createSuccess}
        </Alert>
      </Snackbar>

      {/* Admin Detail Modal */}
      <Dialog 
        open={detailModalOpen} 
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedAction(null);
        }} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CampaignIcon color="primary" />
            <Typography variant="h6">Civic Action Details</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedAction && (
            <Stack spacing={3} sx={{ mt: 1 }}>
              {/* Image */}
              {selectedAction.imageUrl && (
                <Box sx={{ textAlign: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={selectedAction.imageUrl} 
                    alt={selectedAction.title}
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '300px', 
                      borderRadius: 8,
                      objectFit: 'cover'
                    }}
                  />
                </Box>
              )}
              
              {/* Title */}
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  {selectedAction.title}
                </Typography>
                <Chip 
                  label={selectedAction.status} 
                  color={selectedAction.status === 'pending' ? 'warning' : selectedAction.status === 'approved' ? 'success' : 'error'}
                  size="small"
                />
              </Box>

              {/* Description */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Description
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {selectedAction.description}
                </Typography>
              </Box>

              {/* Event Details */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Event Type
                  </Typography>
                  <Typography variant="body2">
                    {selectedAction.eventType || 'Not specified'}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Location
                  </Typography>
                  <Typography variant="body2">
                    {selectedAction.location || 'Not specified'}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Event Date
                  </Typography>
                  <Typography variant="body2">
                    {selectedAction.eventDate 
                      ? new Date(selectedAction.eventDate).toLocaleString()
                      : 'Not specified'
                    }
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Submitted
                  </Typography>
                  <Typography variant="body2">
                    {new Date().toLocaleDateString()} {/* You might want to add createdAt to the data */}
                  </Typography>
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setDetailModalOpen(false);
            setSelectedAction(null);
          }}>
            Close
          </Button>
          {selectedAction && (
            <>
              <Button
                variant="contained"
                color="success"
                disabled={modLoadingId === selectedAction.id}
                onClick={async () => {
                  setModLoadingId(selectedAction.id);
                  try {
                    await api.approveCivicAction(selectedAction.id, false);
                    setAdminPending(prev => prev.filter(x => x.id !== selectedAction.id));
                    // Refresh approved actions list
                    const approved = await api.getCivicActions('approved');
                    const cleanedApproved = approved.map(action => ({
                      ...action,
                      imageUrl: action.imageUrl && action.imageUrl.startsWith('blob:') ? null : action.imageUrl,
                    }));
                    setApprovedActions(cleanedApproved);
                    setDetailModalOpen(false);
                    setSelectedAction(null);
                  } finally {
                    setModLoadingId(null);
                  }
                }}
              >
                Approve
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={modLoadingId === selectedAction.id}
                onClick={async () => {
                  setModLoadingId(selectedAction.id);
                  try {
                    await api.rejectCivicAction(selectedAction.id, 'Not approved');
                    setAdminPending(prev => prev.filter(x => x.id !== selectedAction.id));
                    setDetailModalOpen(false);
                    setSelectedAction(null);
                  } finally {
                    setModLoadingId(null);
                  }
                }}
              >
                Reject
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* My Pending Actions (visible to creator only) */}
      {myActions.length > 0 && (
        <Paper sx={{ p: 2, mb: 4, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>My Pending Actions</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These are actions you submitted. Only you can see pending ones until reviewed by an admin.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {myActions
              .filter(a => a.status === 'pending')
              .map(a => (
                <Box 
                  key={a.id} 
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    cursor: 'pointer',
                    p: 1,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    background: a.imageUrl ? `url(${a.imageUrl}) center/cover no-repeat` : 'transparent',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onClick={() => {
                    // open editor prefilled
                    setCreateOpen(true);
                    setCreateError(null);
                    setNewTitle(a.title || '');
                    setNewDescription(a.description || '');
                    setNewEventType((a.eventType && ['CANVASS','PHONE_BANK','TEXT_BANK','MEETING','COMMUNITY','TRAINING'].includes(a.eventType)) ? a.eventType : (a.eventType ? 'OTHER' : ''));
                    setNewEventTypeOther((a.eventType && !['CANVASS','PHONE_BANK','TEXT_BANK','MEETING','COMMUNITY','TRAINING'].includes(a.eventType)) ? a.eventType : '');
                    setNewLocation(a.location || '');
                    setNewEventDate(a.eventDate ? new Date(a.eventDate).toISOString().slice(0,16) : '');
                    setImagePreview(a.imageUrl || null);
                    // store id to update instead of create
                    (globalThis as { __editActionId?: string }).__editActionId = a.id;
                  }}
                >
                  {a.imageUrl && (
                    <Box sx={{
                      position: 'absolute',
                      inset: 0,
                      backdropFilter: 'blur(2px)',
                      backgroundColor: 'rgba(0,0,0,0.25)'
                    }} />
                  )}
                  <Chip label={a.status} color="warning" size="small" />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.title}</Typography>
                  <Typography variant="caption" color="text.secondary">• {a.location || 'No location'}</Typography>
                </Box>
              ))}
            {myActions.filter(a => a.status === 'pending').length === 0 && (
              <Typography variant="body2" color="text.secondary">No pending actions.</Typography>
            )}
          </Box>
        </Paper>
      )}

      {/* Admin Pending Moderation */}
      {isAdmin && (
        <Paper sx={{ p: 2, mb: 4, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Pending Civic Actions (Admin)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Review submissions and approve or reject them. Approved/rejected items disappear from this list.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {adminPending.length === 0 && (
              <Typography variant="body2" color="text.secondary">No pending submissions.</Typography>
            )}
            {adminPending.map(a => (
              <Card 
                key={a.id} 
                sx={{ 
                  width: 320, 
                  borderRadius: 2, 
                  overflow: 'hidden', 
                  border: '1px solid', 
                  borderColor: 'grey.200',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    borderColor: 'primary.main',
                  }
                }}
                onClick={() => {
                  setSelectedAction(a);
                  setDetailModalOpen(true);
                }}
              >
                <Box sx={{ position: 'relative', height: 140, bgcolor: 'grey.100' }}>
                  {a.imageUrl ? (
                    <CardMedia component="img" height={140} image={a.imageUrl} alt={a.title} sx={{ objectFit: 'cover' }} />
                  ) : (
                    <Box sx={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.100' }}>
                      <CampaignIcon sx={{ fontSize: 40, color: 'grey.500' }} />
                    </Box>
                  )}
                  <Chip label="pending" size="small" color="warning" sx={{ position: 'absolute', top: 8, left: 8 }} />
                </Box>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom noWrap title={a.title}>{a.title}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    {a.location || 'No location'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.75rem' }}>
                    Click to view details
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      disabled={modLoadingId === a.id}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click
                        setModLoadingId(a.id);
                        api.approveCivicAction(a.id, false).then(() => {
                          setAdminPending(prev => prev.filter(x => x.id !== a.id));
                          // Refresh approved actions list
                          api.getCivicActions('approved').then(approved => {
                            const cleanedApproved = approved.map(action => ({
                              ...action,
                              imageUrl: action.imageUrl && action.imageUrl.startsWith('blob:') ? null : action.imageUrl,
                            }));
                            setApprovedActions(cleanedApproved);
                          });
                        }).finally(() => {
                          setModLoadingId(null);
                        });
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      disabled={modLoadingId === a.id}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click
                        setModLoadingId(a.id);
                        api.rejectCivicAction(a.id, 'Not approved').then(() => {
                          setAdminPending(prev => prev.filter(x => x.id !== a.id));
                        }).finally(() => {
                          setModLoadingId(null);
                        });
                      }}
                    >
                      Reject
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Paper>
      )}

      {/* Results Counter */}
      {events.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {events.length} event{events.length !== 1 ? 's' : ''}
            {(searchQuery || categoryFilter || statusFilter || zipcodeFilter || dateRangeFilter || excludeFullFilter || highPriorityFilter) && (
              <span> (filtered from {allEvents.length} total)</span>
            )}
            {zipcodeFilter && (
              <span> • Sorted by distance from {zipcodeFilter}</span>
            )}
          </Typography>
        </Box>
      )}

      {/* Events Grid */}
      {events.length === 0 && !loading ? (
        <Paper
          sx={{
            p: 8,
            textAlign: 'center',
            borderRadius: 3,
            border: '2px dashed',
            borderColor: 'grey.300',
            bgcolor: 'grey.50',
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
              mb: 3,
            }}
          >
            <CampaignIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          </Box>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
            {searchQuery || categoryFilter || statusFilter || zipcodeFilter || dateRangeFilter || excludeFullFilter || highPriorityFilter ? 'No Events Match Your Filters' : 'No Events Available'}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {searchQuery || categoryFilter || statusFilter || zipcodeFilter || dateRangeFilter || excludeFullFilter || highPriorityFilter 
              ? 'Try adjusting your search criteria or clear filters to see more events'
              : 'Check back soon for civic engagement opportunities'
            }
          </Typography>
        </Paper>
      ) : (
        <>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 3,
              width: '100%',
            }}
          >
            {events.map((event, index) => {
              const gradients = [
                'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
              ];
              const gradient = gradients[index % gradients.length];

              // Check if this is a user-submitted civic action
              const isUserSubmission = event.sponsor.name === 'Community Action';
              // Use actionId if available (database civic action), otherwise use the event ID
              const actionId = isUserSubmission ? (event.actionId || event.id.toString()) : null;

              const handleCardClick = () => {
                // TODO: Define what should happen when clicking a card
                // This is the civic actions DASHBOARD, not the Ghost editor card
                // Cards are displayed here for browsing, but selection happens in Ghost editor via koenig-civic-action-card
              };

              return (
                <Box
                  key={`${event.id}-${index}`}
                  sx={{
                    width: {
                      xs: '100%',
                      sm: 'calc(50% - 12px)',
                      md: 'calc(33.333% - 16px)',
                    },
                    minWidth: 0,
                  }}
                >
                  <Card
                    sx={{
                      height: 420,
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 3,
                      overflow: 'visible', // Allow logo badge to overflow
                      position: 'relative',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      border: '1px solid',
                      borderColor: 'grey.200',
                      '&:hover': {
                        transform: 'translateY(-8px)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                        borderColor: 'primary.main',
                        '& .civicsky-badge': {
                          transform: 'scale(1.05)',
                          boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)',
                        },
                      },
                    }}
                  >
                    {/* Featured Image or Gradient */}
                    {event.featured_image_url && !imageErrors.has(getEventIdAsNumber(event)) ? (
                      <CardMedia
                        component="img"
                        height="180"
                        image={event.featured_image_url}
                        alt={event.title}
                        sx={{ objectFit: 'cover' }}
                        onError={() => handleImageError(getEventIdAsNumber(event))}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: 180,
                          background: gradient,
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CloudIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.3)' }} />
                      </Box>
                    )}

                    {/* Civicsky Logo Badge - Creative Design with Hover Effect */}
                    <Box 
                      className="civicsky-badge"
                      sx={{ 
                        position: 'absolute', 
                        top: -8, 
                        left: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: 'primary.main',
                        borderRadius: '0 0 12px 12px',
                        px: 2.5,
                        py: 1,
                        boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                        zIndex: 2,
                        transition: 'all 0.3s ease',
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: -2,
                          right: -2,
                          bottom: -2,
                          background: 'linear-gradient(135deg, #42a5f5, #1976d2)',
                          borderRadius: '0 0 14px 14px',
                          zIndex: -1,
                          opacity: 0,
                          transition: 'opacity 0.3s ease',
                        },
                        '&:hover': {
                          '&::before': {
                            opacity: 1,
                          },
                        },
                      }}
                    >
                      <CloudIcon sx={{ fontSize: 17, color: 'white', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          fontWeight: 800, 
                          color: 'white',
                          fontSize: '0.75rem',
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase',
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        }}
                      >
                        Civicsky
                      </Typography>
                    </Box>

                    {/* Event Type Badge */}
                    <Box sx={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 1, flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Chip
                        label={(event.event_type ?? 'OTHER').replace(/_/g, ' ')}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(255, 255, 255, 0.95)',
                          color: getEventTypeColor(event.event_type),
                          fontWeight: 600,
                          backdropFilter: 'blur(10px)',
                          border: '1px solid rgba(255,255,255,0.2)',
                        }}
                      />
                      {event.sponsor.name === 'Community Action' && (
                        <Chip
                          label="Community"
                          size="small"
                          sx={{
                            bgcolor: 'rgba(76, 175, 80, 0.95)',
                            color: 'white',
                            fontWeight: 600,
                            backdropFilter: 'blur(10px)',
                          }}
                        />
                      )}
                    </Box>

                    <CardContent sx={{ 
                      flexGrow: 1, 
                      p: 2, 
                      display: 'flex', 
                      flexDirection: 'column',
                      height: 240,
                      width: '100%',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                    }}>
                      {/* Title */}
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 700,
                          lineHeight: 1.2,
                          mb: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          color: 'text.primary',
                          fontSize: '1rem',
                          minHeight: '2.4rem',
                          width: '100%',
                          wordBreak: 'break-word',
                        }}
                      >
                        {event.title}
                      </Typography>

                      {/* Summary */}
                      {event.summary && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mb: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.4,
                            fontSize: '0.8rem',
                            width: '100%',
                            wordBreak: 'break-word',
                          }}
                        >
                          {event.summary}
                        </Typography>
                      )}

                      {/* Event Details */}
                      <Stack spacing={0.5} sx={{ mb: 1.5, flexGrow: 1, width: '100%' }}>
                        {/* Date & Time */}
                        {event.timeslots?.length > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
                            <CalendarTodayIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
                            <Typography 
                              variant="caption" 
                              color="text.secondary" 
                              sx={{ 
                                fontSize: '0.7rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                              }}
                            >
                              {formatDate(event.timeslots[0].start_date)} at{' '}
                              {formatTime(event.timeslots[0].start_date)}
                            </Typography>
                          </Box>
                        )}

                        {/* Location */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
                          <LocationOnIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontSize: '0.7rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {(() => {
                              if (event.is_virtual) return 'Virtual Event';
                              if (event.location?.locality && event.location?.region) {
                                return `${event.location.locality}, ${event.location.region}`;
                              }
                              return 'Location TBA';
                            })()}
                          </Typography>
                        </Box>

                        {/* Organizer */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
                          {event.sponsor.logo_url ? (
                            <Avatar
                              src={event.sponsor.logo_url}
                              alt={event.sponsor.name}
                              sx={{ width: 18, height: 18, flexShrink: 0 }}
                            />
                          ) : (
                            <PeopleIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
                          )}
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontSize: '0.7rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {event.sponsor.name}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>
              );
            })}
          </Box>

          {/* Loading More Indicator */}
          {loadingMore && (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              mt: 4,
              mb: 2,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary">
                  Loading more events...
                </Typography>
              </Box>
            </Box>
          )}

          {/* Load More Button */}
          {hasMore && events.length > 0 && !loadingMore && (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              mt: 4,
              mb: 2,
            }}>
              <Button
                variant="outlined"
                onClick={loadMoreEvents}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  px: 4,
                  py: 1.5,
                  fontWeight: 600,
                  minWidth: 150,
                }}
              >
                Load More Events
              </Button>
            </Box>
          )}

          {/* No More Events Message */}
          {!hasMore && events.length > 0 && (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              mt: 4,
              mb: 2,
            }}>
              <Typography variant="body2" color="text.secondary">
                No more events to load
              </Typography>
            </Box>
          )}
        </>
      )}
    </DashboardLayout>
  );
}