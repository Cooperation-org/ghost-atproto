'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Tabs,
  Tab,
  Button,
  Divider,
  ListItemIcon,
} from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import CampaignIcon from '@mui/icons-material/Campaign';
import ArticleIcon from '@mui/icons-material/Article';
import BarChartIcon from '@mui/icons-material/BarChart';
import LoginIcon from '@mui/icons-material/Login';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { api } from '@/lib/api';
import { User } from '@/lib/types';

export function DashboardLayout({ children }: { readonly children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [currentTab, setCurrentTab] = useState<string | false>('/dashboard/civic-actions');

  const tabOptions = user
    ? ['/dashboard', '/dashboard/articles', '/dashboard/civic-actions']
    : ['/dashboard/civic-actions'];
  const activeTab = tabOptions.includes(String(currentTab))
    ? currentTab
    : tabOptions[tabOptions.length - 1];

  useEffect(() => {
    // Update currentTab based on pathname
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const cleanPath = basePath ? pathname.replace(basePath, '') : pathname;

    // Match tab routing logic
    if (cleanPath === '/dashboard') {
      setCurrentTab('/dashboard');
    } else if (cleanPath === '/dashboard/articles' || cleanPath.startsWith('/dashboard/articles/')) {
      setCurrentTab('/dashboard/articles');
    } else if (cleanPath === '/dashboard/civic-actions' || cleanPath.startsWith('/dashboard/civic-actions/')) {
      setCurrentTab('/dashboard/civic-actions');
    } else {
      // Default to civic actions for public view
      setCurrentTab('/dashboard/civic-actions');
    }
  }, [pathname]);

  useEffect(() => {
    // Try to load user data (optional - doesn't redirect if fails)
    const loadUser = async () => {
      try {
        const userData = await api.getMe();
        setUser(userData);
      } catch {
        // User not logged in - this is fine for public pages
        setUser(null);
      }
    };

    loadUser();
  }, []);

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
    setUser(null);
    router.push('/dashboard/civic-actions'); // Stay on public page
  };

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
            onClick={() => router.push('/dashboard/civic-actions')}
          >
            <CloudIcon sx={{ color: 'primary.main', fontSize: 32 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
              civicsky
            </Typography>
          </Box>
          
          {/* Show login/signup buttons if not logged in */}
          {!user && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<LoginIcon />}
                onClick={() => router.push('/login')}
                sx={{ textTransform: 'none' }}
              >
                Login
              </Button>
              <Button
                variant="contained"
                startIcon={<PersonAddIcon />}
                onClick={() => router.push('/signup')}
                sx={{ textTransform: 'none' }}
              >
                Sign Up
              </Button>
            </Box>
          )}

          {/* Show profile avatar if logged in */}
          {user && (
            <>
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
                    sx: { minWidth: 200, mt: 1 }
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
            </>
          )}
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
            value={activeTab} 
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
            {user && [
              <Tab
                key="dashboard"
                icon={<BarChartIcon />}
                iconPosition="start"
                label="Your Impact"
                value="/dashboard"
              />,
              <Tab
                key="articles"
                icon={<ArticleIcon />}
                iconPosition="start"
                label="Articles"
                value="/dashboard/articles"
              />
            ]}
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

