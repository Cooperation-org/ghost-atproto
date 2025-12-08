/**
 * PageState - Reusable loading/error/empty states
 *
 * Usage:
 *   <PageState loading={isLoading} error={error} empty={data.length === 0}>
 *     <YourContent />
 *   </PageState>
 */

'use client';

import React, { ReactNode } from 'react';
import { Box, CircularProgress, Typography, Button, Paper, Alert } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import InboxIcon from '@mui/icons-material/Inbox';
import { ApiError } from '@/lib/api';

interface PageStateProps {
  children: ReactNode;
  loading?: boolean;
  error?: Error | ApiError | string | null;
  empty?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRetry?: () => void;
  loadingText?: string;
}

export function PageState({
  children,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'No data available',
  emptyIcon,
  onRetry,
  loadingText = 'Loading...',
}: PageStateProps) {
  // Loading state
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '40vh',
          gap: 2,
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body2" color="text.secondary">
          {loadingText}
        </Typography>
      </Box>
    );
  }

  // Error state
  if (error) {
    const errorMessage =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
        ? error.message
        : String(error);

    const isUnauthorized = error instanceof ApiError && error.isUnauthorized();
    const isNetworkError = error instanceof ApiError && error.isNetworkError();

    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '40vh',
          p: 3,
        }}
      >
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            maxWidth: 450,
            borderRadius: 2,
          }}
        >
          <ErrorOutlineIcon
            sx={{
              fontSize: 56,
              color: isNetworkError ? 'warning.main' : 'error.main',
              mb: 2,
            }}
          />
          <Typography variant="h6" gutterBottom fontWeight={600}>
            {isNetworkError
              ? 'Connection Problem'
              : isUnauthorized
              ? 'Session Expired'
              : 'Error Loading Data'}
          </Typography>
          <Alert
            severity={isNetworkError ? 'warning' : 'error'}
            sx={{ mb: 3, textAlign: 'left' }}
          >
            {errorMessage}
          </Alert>
          {isUnauthorized ? (
            <Button
              variant="contained"
              onClick={() => (window.location.href = '/login')}
            >
              Sign In Again
            </Button>
          ) : onRetry ? (
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={onRetry}
            >
              Try Again
            </Button>
          ) : null}
        </Paper>
      </Box>
    );
  }

  // Empty state
  if (empty) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '40vh',
          p: 3,
        }}
      >
        <Paper
          sx={{
            p: 6,
            textAlign: 'center',
            maxWidth: 400,
            borderRadius: 3,
            border: '2px dashed',
            borderColor: 'grey.300',
            bgcolor: 'grey.50',
          }}
        >
          {emptyIcon || (
            <InboxIcon
              sx={{ fontSize: 64, color: 'grey.400', mb: 2 }}
            />
          )}
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {emptyMessage}
          </Typography>
        </Paper>
      </Box>
    );
  }

  // Content
  return <>{children}</>;
}

/**
 * Inline error alert - for showing errors within a page
 */
interface InlineErrorProps {
  error: Error | ApiError | string | null;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export function InlineError({ error, onDismiss, onRetry }: InlineErrorProps) {
  if (!error) return null;

  const message =
    error instanceof Error ? error.message : String(error);

  return (
    <Alert
      severity="error"
      sx={{ mb: 2 }}
      onClose={onDismiss}
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
