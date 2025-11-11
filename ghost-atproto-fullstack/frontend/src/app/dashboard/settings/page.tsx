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
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WebhookIcon from '@mui/icons-material/Webhook';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SyncIcon from '@mui/icons-material/Sync';
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
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState('');
  const [syncError, setSyncError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    ghostUrl: '',
    ghostApiKey: '',
    ghostContentApiKey: '',
    blueskyHandle: '',
    blueskyPassword: '',
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
          ghostContentApiKey: userData.ghostContentApiKey || '',
          blueskyHandle: userData.blueskyHandle || '',
          blueskyPassword: userData.blueskyPassword || '',
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
    setSyncSuccess('');
    setSyncError('');

    try {
      const updateData: {
        name: string;
        ghostUrl: string;
        ghostApiKey: string;
        ghostContentApiKey?: string;
        blueskyHandle: string;
        blueskyPassword?: string;
      } = {
        name: formData.name,
        ghostUrl: formData.ghostUrl,
        ghostApiKey: formData.ghostApiKey,
        blueskyHandle: formData.blueskyHandle,
      };

      if (formData.ghostContentApiKey) {
        updateData.ghostContentApiKey = formData.ghostContentApiKey;
      }

      if (formData.blueskyPassword) {
        updateData.blueskyPassword = formData.blueskyPassword;
      }

      const updatedUser = await api.updateMe(updateData);
      setUser(updatedUser);
      setSuccess('Settings saved successfully!');
      
      // Auto-trigger sync if Ghost settings are present
      const hasGhost = (updateData.ghostUrl && updateData.ghostUrl.trim() !== '') &&
                       (updateData.ghostApiKey && updateData.ghostApiKey.trim() !== '');
      if (hasGhost) {
        try {
          setSyncing(true);
          const result = await api.syncNow(50, false);
          setSyncSuccess('Sync started. Your articles are being fetched from Ghost.');
        } catch (syncErr: any) {
          setSyncError(syncErr?.message || 'Failed to start sync');
        } finally {
          setSyncing(false);
        }
      }
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" gutterBottom>
            Ghost Configuration
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={syncing ? <CircularProgress size={18} color="inherit" /> : <SyncIcon />}
              onClick={async () => {
                setSyncSuccess('');
                setSyncError('');
                try {
                  setSyncing(true);
                  await api.syncNow(50, false);
                  setSyncSuccess('Sync started. Your articles are being fetched from Ghost.');
                } catch (e: any) {
                  setSyncError(e?.message || 'Failed to start sync');
                } finally {
                  setSyncing(false);
                }
              }}
              disabled={syncing || !formData.ghostUrl || !formData.ghostApiKey}
            >
              {syncing ? 'Syncing...' : 'Sync now'}
            </Button>
          </Box>
        </Box>
        {syncSuccess && (
          <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSyncSuccess('')}>
            {syncSuccess}
          </Alert>
        )}
        {syncError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setSyncError('')}>
            {syncError}
          </Alert>
        )}
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
              helperText="Required - Found in Ghost Admin → Integrations → Custom Integration"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Ghost Content API Key (Optional)"
              value={formData.ghostContentApiKey}
              onChange={handleChange('ghostContentApiKey')}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              helperText="Optional - For public content access (found in Ghost Admin → Integrations)"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Webhook Information - Show when Ghost is configured but Bluesky is skipped */}
      {formData.ghostUrl && formData.ghostApiKey && 
       (formData.blueskyHandle === 'SKIPPED' || formData.blueskyPassword === 'SKIPPED' || 
        (!formData.blueskyHandle && !formData.blueskyPassword)) && (
        <Paper sx={{ p: 3, mt: 3, backgroundColor: '#f8f9fa' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <WebhookIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
              Ghost Webhook Configuration
            </Typography>
            <Chip 
              icon={<CheckCircleIcon />} 
              label="Auto-sync Enabled" 
              color="success" 
              size="small" 
              sx={{ ml: 2 }} 
            />
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your Ghost posts are automatically synced to this platform. To enable webhook notifications, 
            add the following webhook URL to your Ghost admin panel:
          </Typography>

          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontFamily: 'monospace', 
                    backgroundColor: '#f5f5f5', 
                    p: 1, 
                    borderRadius: 1,
                    flex: 1,
                    mr: 1
                  }}
                >
                  http://204.236.176.29/api/ghost/webhook
                </Typography>
                <Tooltip title="Copy webhook URL">
                  <IconButton 
                    onClick={() => {
                      navigator.clipboard.writeText('http://204.236.176.29/api/ghost/webhook');
                      setSuccess('Webhook URL copied to clipboard!');
                    }}
                    size="small"
                  >
                    <ContentCopyIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </CardContent>
          </Card>

          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
              Setup Instructions:
            </Typography>
            <Typography variant="body2" component="div">
              1. Go to your Ghost Admin panel<br/>
              2. Navigate to <strong>Settings → Integrations</strong><br/>
              3. Click <strong>&quot;Add custom integration&quot;</strong><br/>
              4. Name it <strong>&quot;Auto-Sync Bridge&quot;</strong><br/>
              5. Click <strong>&quot;Add webhook&quot;</strong><br/>
              6. Configure the webhook:<br/>
              &nbsp;&nbsp;• <strong>Event:</strong> Post published<br/>
              &nbsp;&nbsp;• <strong>URL:</strong> http://204.236.176.29/api/ghost/webhook<br/>
              &nbsp;&nbsp;• <strong>Header:</strong> X-User-ID = {user?.id}<br/>
              7. Save the webhook
            </Typography>
          </Alert>

          <Alert severity="success">
            <Typography variant="body2">
              <strong>✅ Auto-sync is working!</strong> Your posts are being synced automatically. 
              The webhook will notify this platform immediately when you publish new posts in Ghost.
            </Typography>
          </Alert>
        </Paper>
      )}

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Bluesky Configuration
        </Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Bluesky Handle"
              value={formData.blueskyHandle}
              onChange={handleChange('blueskyHandle')}
              placeholder="yourhandle.bsky.social"
              helperText="Your Bluesky username"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Bluesky App Password"
              type="password"
              value={formData.blueskyPassword}
              onChange={handleChange('blueskyPassword')}
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
