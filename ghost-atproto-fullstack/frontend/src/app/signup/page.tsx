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
  ToggleButtonGroup,
  ToggleButton,
  Divider,
} from '@mui/material';
import NextLink from 'next/link';
import PersonIcon from '@mui/icons-material/Person';
import EditIcon from '@mui/icons-material/Edit';
import { api } from '@/lib/api';

type Role = 'USER' | 'AUTHOR';

const roleDescriptions = {
  USER: 'Browse and read content from the community',
  AUTHOR: 'Publish Ghost posts to Bluesky automatically',
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const res = await api.signup(email, password, role, name || undefined);
      const selectedRole = res.user.role || role;

      if (selectedRole === 'AUTHOR') {
        router.push('/wizard');
      } else if (selectedRole === 'ADMIN') {
        router.push('/dashboard/civic-actions');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
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
            Create Account
          </Typography>
          <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
            Join the Ghost to Bluesky community
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
              helperText="At least 6 characters"
            />

            <TextField
              fullWidth
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              margin="normal"
              required
              disabled={loading}
            />

            <TextField
              fullWidth
              label="Name (optional)"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
              disabled={loading}
              sx={{ mb: 3 }}
            />

            <Typography variant="subtitle1" fontWeight="medium" sx={{ mb: 2 }}>
              Select Your Role
            </Typography>
            
            <ToggleButtonGroup
              color="primary"
              value={role}
              exclusive
              onChange={(_, value: Role) => value && setRole(value)}
              fullWidth
              sx={{ mb: 2 }}
            >
              <ToggleButton value="USER" sx={{ py: 1.5, flexDirection: 'column', gap: 0.5 }}>
                <PersonIcon />
                <Typography variant="caption" fontWeight="medium">User</Typography>
              </ToggleButton>
              <ToggleButton value="AUTHOR" sx={{ py: 1.5, flexDirection: 'column', gap: 0.5 }}>
                <EditIcon />
                <Typography variant="caption" fontWeight="medium">Author</Typography>
              </ToggleButton>
            </ToggleButtonGroup>

            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                {roleDescriptions[role]}
              </Typography>
            </Alert>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ py: 1.5, fontSize: '1.1rem' }}
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </Button>
          </form>

          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              OR
            </Typography>
          </Divider>

          <Button
            component={NextLink}
            href="/login"
            fullWidth
            variant="outlined"
            size="large"
            sx={{ py: 1.5, fontSize: '1.1rem' }}
          >
            Sign In to Existing Account
          </Button>
        </Paper>
      </Box>
    </Container>
  );
}



