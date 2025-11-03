'use client';

import { isClient } from '@/lib/hydration-utils';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Divider,
  IconButton,
  ListItemIcon,
  CircularProgress,
  Avatar,
  Menu,
  MenuItem,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ArticleIcon from '@mui/icons-material/Article';
import CloudIcon from '@mui/icons-material/Cloud';
import CampaignIcon from '@mui/icons-material/Campaign';
import { api } from '@/lib/api';
import { User } from '@/lib/types';

export function DashboardLayout({ children }: { readonly children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<{
    totalPosts: number;
    successfulSyncs: number;
    failedSyncs: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [currentTab, setCurrentTab] = useState<string | false>('/dashboard');

  useEffect(() => {
    // Update currentTab based on current path
    if (isClient()) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const rawPath = window.location.pathname;
      const path = basePath ? rawPath.replace(basePath, '') : rawPath;
      let matched: string | false = false;
      if (path === '/dashboard') {
        matched = '/dashboard';
      } else if (path === '/dashboard/civic-actions' || path.startsWith('/dashboard/civic-actions/')) {
        matched = '/dashboard/civic-actions';
      } else {
        matched = false; // Do not highlight a tab for other dashboard subpages (e.g., settings, profile)
      }
      setCurrentTab(matched);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userData, statsData] = await Promise.all([
          api.getMe(),
          api.getProfileStats(),
        ]);
        setUser(userData);
        setStats(statsData);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setCurrentTab(newValue);
    router.push(newValue);
  };

  const handleProfileClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileClose = () => {
    setAnchorEl(null);
  };

  const handleSettings = () => {
    handleProfileClose();
    router.push('/dashboard/settings');
  };

  const handleLogout = async () => {
    await api.logout();
    router.push('/login');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fafafa' }}>
      {/* Top Navigation Bar */}
      <AppBar position="fixed" sx={{ bgcolor: 'white', color: 'text.primary', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <Toolbar>
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1, 
              flexGrow: 1,
              cursor: 'pointer',
              '&:hover': {
                opacity: 0.8
              }
            }}
            onClick={() => router.push('/dashboard')}
          >
            <CloudIcon sx={{ color: 'primary.main', fontSize: 32 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
              civicsky
            </Typography>
          </Box>
          
          {/* Profile Avatar with Dropdown */}
          <IconButton onClick={handleProfileClick} sx={{ p: 0 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
              {user?.name?.[0]?.toUpperCase() || user?.email[0].toUpperCase()}
            </Avatar>
          </IconButton>
          
          {/* Profile Dropdown Menu */}
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleProfileClose}
            slotProps={{
              paper: {
                sx: { minWidth: 280, mt: 1 }
              }
            }}
          >
            {/* User Info */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {user?.name || 'User'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
            
            <Divider />
            
            {/* Profile Stats - Clickable */}
            <MenuItem 
              onClick={() => {
                handleProfileClose();
                router.push('/dashboard/profile');
              }}
              sx={{ py: 2 }}
            >
              <Box sx={{ width: '100%' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1.5, display: 'block' }}>
                  MY STATS
                </Typography>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ArticleIcon fontSize="small" color="primary" />
                      <Typography variant="body2">Posts Synced</Typography>
                    </Box>
                    <Chip 
                      label={stats?.totalPosts || 0} 
                      size="small" 
                      color="primary"
                    />
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleIcon fontSize="small" color="success" />
                      <Typography variant="body2">Successful</Typography>
                    </Box>
                    <Chip 
                      label={stats?.successfulSyncs || 0} 
                      size="small" 
                      color="success"
                    />
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ErrorIcon fontSize="small" color="error" />
                      <Typography variant="body2">Failed</Typography>
                    </Box>
                    <Chip 
                      label={stats?.failedSyncs || 0} 
                      size="small" 
                      color="error"
                    />
                  </Box>
                </Box>
                
                <Typography variant="caption" color="primary.main" sx={{ mt: 1.5, display: 'block', textAlign: 'right' }}>
                  View Details →
                </Typography>
              </Box>
            </MenuItem>
            
            <Divider />
            
            {/* Settings & Logout */}
            <MenuItem onClick={handleSettings}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      
      {/* Navigation Tabs */}
      <Box sx={{ 
        bgcolor: 'white', 
        borderBottom: 1, 
        borderColor: 'divider',
        position: 'fixed',
        top: 64,
        left: 0,
        right: 0,
        zIndex: 1100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <Box sx={{ maxWidth: '1400px', mx: 'auto', px: 3 }}>
          <Tabs 
            value={currentTab} 
            onChange={handleTabChange}
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.95rem',
                minHeight: 48,
              }
            }}
          >
            <Tab 
              icon={<ArticleIcon />} 
              iconPosition="start" 
              label="Articles" 
              value="/dashboard" 
            />
            <Tab 
              icon={<CampaignIcon />} 
              iconPosition="start" 
              label="Civic Actions" 
              value="/dashboard/civic-actions" 
            />
          </Tabs>
        </Box>
      </Box>
      
      {/* Main Content - Full Width */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          pt: 18, // Increased to account for both AppBar and Tabs
          maxWidth: '1400px',
          mx: 'auto',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
