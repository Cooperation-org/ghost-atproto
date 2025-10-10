'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Grid,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { User } from '@/lib/types';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    ghostUrl: '',
    ghostApiKey: '',
    atprotoHandle: '',
    atprotoAppPassword: '',
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await api.getMe();
        setUser(userData);
        setFormData({
          name: userData.name || '',
          ghostUrl: userData.ghostUrl || '',
          ghostApiKey: userData.ghostApiKey || '',
          atprotoHandle: userData.atprotoHandle || '',
          atprotoAppPassword: '',
        });
      } catch {
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updateData: {
        name: string;
        ghostUrl: string;
        ghostApiKey: string;
        atprotoHandle: string;
        atprotoAppPassword?: string;
      } = {
        name: formData.name,
        ghostUrl: formData.ghostUrl,
        ghostApiKey: formData.ghostApiKey,
        atprotoHandle: formData.atprotoHandle,
      };

      if (formData.atprotoAppPassword) {
        updateData.atprotoAppPassword = formData.atprotoAppPassword;
      }

      const updatedUser = await api.updateMe(updateData);
      setUser(updatedUser);
      setSuccess('Settings saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          Settings
        </Typography>
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={() => router.push('/wizard')}
        >
          Setup Wizard
        </Button>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Profile
        </Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Email"
              value={user?.email}
              disabled
              helperText="Email cannot be changed"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Display Name"
              value={formData.name}
              onChange={handleChange('name')}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Ghost Configuration
        </Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Ghost URL"
              value={formData.ghostUrl}
              onChange={handleChange('ghostUrl')}
              placeholder="https://yourblog.com"
              helperText="Your Ghost blog URL"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Ghost Admin API Key"
              value={formData.ghostApiKey}
              onChange={handleChange('ghostApiKey')}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              helperText="Found in Ghost Admin → Integrations"
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Bluesky Configuration
        </Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Bluesky Handle"
              value={formData.atprotoHandle}
              onChange={handleChange('atprotoHandle')}
              placeholder="yourhandle.bsky.social"
              helperText="Your Bluesky username"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Bluesky App Password"
              type="password"
              value={formData.atprotoAppPassword}
              onChange={handleChange('atprotoAppPassword')}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              helperText="Generate app password in Bluesky Settings → App Passwords"
            />
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>
    </DashboardLayout>
  );
}
