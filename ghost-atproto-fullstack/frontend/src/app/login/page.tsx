'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@mui/material';
import NextLink from 'next/link';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    </Container>
  );
}
