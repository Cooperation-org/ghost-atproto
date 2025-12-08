'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Divider,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import NextLink from 'next/link';
import { api, ApiError } from '@/lib/api';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [oauthConfig, setOauthConfig] = useState<{
    google: { enabled: boolean; buttonText: string };
    bluesky: { enabled: boolean; buttonText: string; requiresHandle: boolean; requiresPassword?: boolean; handlePlaceholder: string; passwordPlaceholder?: string };
  } | null>(null);
  
  // Bluesky OAuth dialog
  const [blueskyDialogOpen, setBlueskyDialogOpen] = useState(false);
  const [blueskyHandle, setBlueskyHandle] = useState('');

  // Check for OAuth errors
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(getOAuthErrorMessage(oauthError));
    }
  }, [searchParams]);

  // Load OAuth config
  useEffect(() => {
    console.log('[Login] Fetching OAuth config...');
    api.getOAuthConfig()
      .then((config) => {
        console.log('[Login] OAuth config received:', config);
        console.log('[Login] Google enabled:', config.google.enabled);
        setOauthConfig(config);
      })
      .catch((err) => {
        console.error('[Login] Failed to load OAuth config:', err);
        console.error('[Login] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        });
        // Set default config if backend is not available
        setOauthConfig({
          google: { enabled: false, buttonText: 'Continue with Google' },
          bluesky: { enabled: true, buttonText: 'Continue with Bluesky', requiresHandle: true, handlePlaceholder: 'your-handle.bsky.social' }
        });
      });
  }, []);

  const getOAuthErrorMessage = (error: string): string => {
    const messages: Record<string, string> = {
      'google_auth_failed': 'Google authentication failed. Please try again.',
      'bluesky_auth_failed': 'Bluesky authentication failed. Please try again.',
      'no_user': 'Authentication failed. No user found.',
      'callback_failed': 'Authentication callback failed. Please try again.',
    };
    return messages[error] || 'Authentication failed. Please try again.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.login(email, password);

      const role = res.user.role || 'USER';
      if (role === 'AUTHOR') {
        router.push('/wizard');
        return;
      }
      if (role === 'ADMIN') {
        router.push('/dashboard/civic-actions');
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = api.getGoogleOAuthUrl();
  };

  const handleBlueskyLogin = () => {
    if (!blueskyHandle.trim()) {
      setError('Please enter your Bluesky handle');
      return;
    }

    // Redirect to OAuth (just like Google)
    window.location.href = api.getBlueskyOAuthUrl(blueskyHandle);
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Paper elevation={3} sx={{ p: 5, width: '100%', borderRadius: 2 }}>
          <Typography variant="h3" component="h1" gutterBottom align="center" fontWeight="bold">
            Welcome Back
          </Typography>
          <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
            Sign in to manage your Ghost and Bluesky integration
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoFocus
              disabled={loading}
            />

            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              disabled={loading}
              sx={{ mb: 2 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 2, py: 1.5, fontSize: '1.1rem' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {oauthConfig && (oauthConfig.google.enabled || oauthConfig.bluesky.enabled) && (
            <>
              <Divider sx={{ my: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  OR CONTINUE WITH
                </Typography>
              </Divider>

              <Stack spacing={2}>
                {oauthConfig.google.enabled && (
                  <Button
                    fullWidth
                    variant="outlined"
                    size="large"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    sx={{ 
                      py: 1.5, 
                      fontSize: '1rem',
                      borderColor: '#4285F4',
                      color: '#4285F4',
                      '&:hover': {
                        borderColor: '#357AE8',
                        backgroundColor: 'rgba(66, 133, 244, 0.04)',
                      }
                    }}
                  >
                    <Box component="span" sx={{ mr: 1 }}>🔵</Box>
                    {oauthConfig.google.buttonText}
                  </Button>
                )}

                {oauthConfig.bluesky.enabled && (
                  <Button
                    fullWidth
                    variant="outlined"
                    size="large"
                    onClick={() => setBlueskyDialogOpen(true)}
                    disabled={loading}
                    sx={{ 
                      py: 1.5, 
                      fontSize: '1rem',
                      borderColor: '#1185FE',
                      color: '#1185FE',
                      '&:hover': {
                        borderColor: '#0E6FD9',
                        backgroundColor: 'rgba(17, 133, 254, 0.04)',
                      }
                    }}
                  >
                    <Box component="span" sx={{ mr: 1 }}>🦋</Box>
                    {oauthConfig.bluesky.buttonText}
                  </Button>
                )}
              </Stack>
            </>
          )}

          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              OR
            </Typography>
          </Divider>

          <Button
            component={NextLink}
            href="/signup"
            fullWidth
            variant="outlined"
            size="large"
            sx={{ py: 1.5, fontSize: '1.1rem' }}
          >
            Create New Account
          </Button>

          <Stack spacing={1} sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Choose your role during signup: Author or Regular User
            </Typography>
          </Stack>
        </Paper>
      </Box>

      {/* Bluesky Handle Dialog */}
      <Dialog
        open={blueskyDialogOpen}
        onClose={() => setBlueskyDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span>🦋</span>
            <span>Sign in with Bluesky</span>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter your Bluesky handle. You&apos;ll be redirected to your server to authorize securely.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Bluesky Handle"
            placeholder={oauthConfig?.bluesky.handlePlaceholder || 'your-handle.bsky.social'}
            value={blueskyHandle}
            onChange={(e) => setBlueskyHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && blueskyHandle.trim()) {
                handleBlueskyLogin();
              }
            }}
            helperText="Example: alice.bsky.social"
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="caption">
              <strong>Secure OAuth!</strong> You&apos;ll authorize on your own Bluesky server. Your password never leaves your server.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setBlueskyDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleBlueskyLogin}
            variant="contained"
            disabled={!blueskyHandle.trim()}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</Box>}>
      <LoginPageContent />
    </Suspense>
  );
}
