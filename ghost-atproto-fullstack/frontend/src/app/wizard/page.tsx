'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Button,
  Typography,
  TextField,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudIcon from '@mui/icons-material/Cloud';
import TwitterIcon from '@mui/icons-material/Twitter';
import WebhookIcon from '@mui/icons-material/Webhook';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useRouter } from 'next/navigation';
import { wizardApi, GhostValidationResponse, BlueskyValidationResponse } from '@/lib/wizard-api';

const steps = ['Connect Ghost', 'Connect Bluesky', 'Complete Setup'];

export default function WizardPage() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [skipping, setSkipping] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    ghostUrl: '',
    ghostApiKey: '',
    ghostContentApiKey: '',
    blueskyHandle: '',
    blueskyPassword: '',
  });

  const [importOptions, setImportOptions] = useState({
    posts: true,
    authors: true,
    tags: true,
    newsletters: true,
  });

  const [autoSync, setAutoSync] = useState(true);

  // Validation results
  const [ghostValidation, setGhostValidation] = useState<GhostValidationResponse | null>(null);
  const [blueskyValidation, setBlueskyValidation] = useState<BlueskyValidationResponse | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookInstructions, setWebhookInstructions] = useState<string[]>([]);
  const [showWebhookInfo, setShowWebhookInfo] = useState(false);
  const [success, setSuccess] = useState('');

  const handleNext = async () => {
    setError('');

    // Validate current step before proceeding
    if (activeStep === 0) {
      // Validate Ghost
      if (!formData.ghostUrl || !formData.ghostApiKey) {
        setError('Please fill in all Ghost fields');
        return;
      }
      setLoading(true);
      try {
        const result = await wizardApi.validateGhost(formData.ghostUrl, formData.ghostApiKey);
        if (!result.valid) {
          setError(result.error || 'Ghost validation failed');
          setLoading(false);
          return;
        }
        setGhostValidation(result);
        
        // Complete wizard with Ghost configuration and show webhook info
        const wizardResult = await wizardApi.completeWizard({
          ...formData,
          blueskyHandle: 'SKIPPED',
          blueskyPassword: 'SKIPPED',
          autoSync
        });
        
        setWebhookUrl(wizardResult.webhookUrl);
        setWebhookInstructions(wizardResult.nextSteps.webhookInstructions);
        setShowWebhookInfo(true);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to validate Ghost');
        setLoading(false);
        return;
      }
      setLoading(false);
    } else if (activeStep === 1) {
      // Validate Bluesky
      if (!formData.blueskyHandle || !formData.blueskyPassword) {
        setError('Please fill in all Bluesky fields');
        return;
      }
      setLoading(true);
      try {
        const result = await wizardApi.validateBluesky(formData.blueskyHandle, formData.blueskyPassword);
        if (!result.valid) {
          setError(result.error || 'Bluesky validation failed');
          setLoading(false);
          return;
        }
        setBlueskyValidation(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to validate Bluesky');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    // For step 1 (Bluesky), complete wizard when moving to step 2
    if (activeStep === 1) {
      setLoading(true);
      try {
        const result = await wizardApi.completeWizard({
          ...formData,
          autoSync
        });
        setWebhookUrl(result.webhookUrl);
        setWebhookInstructions(result.nextSteps.webhookInstructions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete setup');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    // If webhook info should be shown, go to webhook step, otherwise continue normally
    if (activeStep === 0 && showWebhookInfo) {
      setActiveStep(1.5);
    } else {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    }
  };

  const handleChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleImportOptionChange = (option: keyof typeof importOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportOptions((prev) => ({ ...prev, [option]: e.target.checked }));
  };

  const handleFinish = () => {
    router.push('/dashboard');
  };

  const handleSkip = async () => {
    setSkipping(true);
    setError('');

    try {
      // If we have Ghost configuration, complete the wizard with Ghost only
      if (formData.ghostUrl && formData.ghostApiKey) {
        const result = await wizardApi.completeWizard({
          ghostUrl: formData.ghostUrl,
          ghostApiKey: formData.ghostApiKey,
          ghostContentApiKey: formData.ghostContentApiKey,
          blueskyHandle: 'SKIPPED',
          blueskyPassword: 'SKIPPED',
          name: formData.name,
          autoSync: autoSync,
        });
        
        if (result.success) {
          setWebhookUrl(result.webhookUrl);
          setWebhookInstructions(result.nextSteps.webhookInstructions);
          router.push('/dashboard');
        } else {
          setError('Failed to complete setup with Ghost configuration');
        }
      } else {
        // If no Ghost configuration, skip everything
        const result = await wizardApi.skipWizard();
        if (result.success) {
          router.push('/dashboard');
        } else {
          setError('Failed to skip wizard setup');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to skip wizard setup';
      setError(msg);
    } finally {
      setSkipping(false);
    }
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ maxWidth: 700, mx: 'auto' }}>
            <Paper 
              sx={{ 
                p: 4, 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                border: '1px solid',
                borderColor: 'grey.200',
                transition: 'all 0.3s ease',
                '&:hover': {
                  boxShadow: '0 6px 30px rgba(0,0,0,0.15)',
                }
              }}
            >
              {/* Ghost Logo and Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, gap: 3 }}>
                <Box sx={{ 
                  width: 80, 
                  height: 80, 
                  bgcolor: '#15171A', 
                  borderRadius: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 42,
                  fontWeight: 700,
                  color: 'white',
                  boxShadow: '0 4px 16px rgba(21, 23, 26, 0.3)',
                  transition: 'transform 0.3s ease',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}>
                  G
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: '#15171A', mb: 0.5 }}>
                    Ghost Integration
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '0.95rem' }}>
                    Step 1 of 3: Connect Your Ghost Account
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ mb: 4 }} />

              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Ghost URL"
                    value={formData.ghostUrl}
                    onChange={handleChange('ghostUrl')}
                    placeholder="https://yourblog.com"
                    disabled={loading}
                    variant="outlined"
                    size="medium"
                    helperText="The URL where your Ghost blog is hosted"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        '&:hover fieldset': {
                          borderColor: '#15171A',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#15171A',
                        },
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Ghost Admin API Key"
                    value={formData.ghostApiKey}
                    onChange={handleChange('ghostApiKey')}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    disabled={loading}
                    type="password"
                    variant="outlined"
                    size="medium"
                    helperText="Found in Ghost Admin → Settings → Integrations"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        '&:hover fieldset': {
                          borderColor: '#15171A',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#15171A',
                        },
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Ghost Content API Key (Optional)"
                    value={formData.ghostContentApiKey}
                    onChange={handleChange('ghostContentApiKey')}
                    placeholder="Enter your content API key"
                    disabled={loading}
                    type="password"
                    variant="outlined"
                    size="medium"
                    helperText="Optional: Used for reading public content"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        '&:hover fieldset': {
                          borderColor: '#15171A',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#15171A',
                        },
                      },
                    }}
                  />
                </Grid>
              </Grid>

              <Box 
                sx={{ 
                  mt: 4, 
                  p: 3, 
                  bgcolor: '#f8f9fa', 
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'grey.200'
                }}
              >
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700, mb: 2.5, color: '#15171A' }}>
                  📦 Import Options
                </Typography>
                <FormGroup>
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 6 }}>
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={importOptions.posts} 
                            onChange={handleImportOptionChange('posts')}
                            sx={{
                              color: '#15171A',
                              '&.Mui-checked': {
                                color: '#15171A',
                              },
                            }}
                          />
                        }
                        label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Posts</Typography>}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={importOptions.authors} 
                            onChange={handleImportOptionChange('authors')}
                            sx={{
                              color: '#15171A',
                              '&.Mui-checked': {
                                color: '#15171A',
                              },
                            }}
                          />
                        }
                        label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Authors</Typography>}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={importOptions.tags} 
                            onChange={handleImportOptionChange('tags')}
                            sx={{
                              color: '#15171A',
                              '&.Mui-checked': {
                                color: '#15171A',
                              },
                            }}
                          />
                        }
                        label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Tags</Typography>}
                      />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <FormControlLabel
                        control={
                          <Checkbox 
                            checked={importOptions.newsletters} 
                            onChange={handleImportOptionChange('newsletters')}
                            sx={{
                              color: '#15171A',
                              '&.Mui-checked': {
                                color: '#15171A',
                              },
                            }}
                          />
                        }
                        label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Newsletters</Typography>}
                      />
                    </Grid>
                  </Grid>
                </FormGroup>
              </Box>

              {/* Auto-Sync Settings */}
              <Box 
                sx={{ 
                  mt: 4, 
                  p: 3, 
                  bgcolor: '#e3f2fd', 
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: '#2196f3'
                }}
              >
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700, mb: 2.5, color: '#1976d2' }}>
                  🔄 Auto-Sync Settings
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={autoSync} 
                      onChange={(e) => setAutoSync(e.target.checked)}
                      sx={{
                        color: '#1976d2',
                        '&.Mui-checked': {
                          color: '#1976d2',
                        },
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        Automatically sync new posts to Bluesky
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        When enabled, new posts published in Ghost will automatically be shared to Bluesky
                      </Typography>
                    </Box>
                  }
                />
              </Box>

              <Button
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                onClick={handleNext}
                sx={{ 
                  mt: 4, 
                  py: 2, 
                  bgcolor: '#15171A',
                  '&:hover': { 
                    bgcolor: '#2c2e31',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.2)'
                  },
                  textTransform: 'none',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  borderRadius: 2,
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                {loading ? (
                  <>
                    <CircularProgress size={22} sx={{ mr: 1 }} color="inherit" />
                    Validating Connection...
                  </>
                ) : (
                  <>
                    Continue to Bluesky →
                  </>
                )}
              </Button>

              {/* Skip Button for Authors */}
              <Button
                variant="outlined"
                fullWidth
                size="large"
                disabled={loading || skipping}
                onClick={handleSkip}
                sx={{ 
                  mt: 2, 
                  py: 1.5, 
                  borderColor: 'grey.400',
                  color: 'text.secondary',
                  '&:hover': { 
                    borderColor: 'grey.600',
                    color: 'text.primary',
                    bgcolor: 'grey.50'
                  },
                  textTransform: 'none',
                  fontSize: '1rem',
                  fontWeight: 500,
                  borderRadius: 2,
                  transition: 'all 0.3s ease'
                }}
              >
                {skipping ? (
                  <>
                    <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                    Skipping Setup...
                  </>
                ) : (
                  'Skip Setup for Now'
                )}
              </Button>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: 'center', display: 'block' }}>
                You can configure Ghost and Bluesky later from your dashboard
              </Typography>

              {ghostValidation?.valid && (
                <Alert 
                  severity="success" 
                  sx={{ 
                    mt: 3,
                    borderRadius: 2,
                    '& .MuiAlert-icon': {
                      fontSize: 28
                    }
                  }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    ✓ Successfully Connected to {ghostValidation.site?.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formData.ghostUrl}
                  </Typography>
                </Alert>
              )}
            </Paper>
          </Box>
        );

      case 1:
        return (
          <Grid container spacing={4} sx={{ maxWidth: 1200, mx: 'auto' }}>
            {/* Left Side - Bluesky Form */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Connect Your Bluesky Account
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Authenticate with your Bluesky credentials
                </Typography>
              </Box>

              {blueskyValidation?.valid && (
                <Alert severity="success" sx={{ mb: 3 }}>
                  ✓ Connected as @{blueskyValidation.profile?.handle}
                </Alert>
              )}

              <Card sx={{ border: '1px solid', borderColor: 'grey.200', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                    <TwitterIcon sx={{ fontSize: 50, color: '#1DA1F2' }} />
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        Bluesky
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Social media integration
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ mb: 3 }} />

                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Bluesky Handle"
                        value={formData.blueskyHandle}
                        onChange={handleChange('blueskyHandle')}
                        placeholder="yourhandle.bsky.social"
                        disabled={loading}
                        variant="outlined"
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
                        disabled={loading}
                        variant="outlined"
                        helperText="Generate from Bluesky Settings → App Passwords"
                      />
                    </Grid>
                  </Grid>

                  <Box sx={{ mt: 4, p: 2, bgcolor: '#E3F2FD', borderRadius: 1, border: '1px solid #2196F3' }}>
                    <Typography variant="body2" color="primary.dark">
                      🔐 <strong>Security:</strong> App passwords are more secure than using your main password
                    </Typography>
                  </Box>

                  {/* Skip Button for Authors */}
                  <Button
                    variant="outlined"
                    fullWidth
                    size="large"
                    disabled={loading || skipping}
                    onClick={handleSkip}
                    sx={{ 
                      mt: 3, 
                      py: 1.5, 
                      borderColor: 'grey.400',
                      color: 'text.secondary',
                      '&:hover': { 
                        borderColor: 'grey.600',
                        color: 'text.primary',
                        bgcolor: 'grey.50'
                      },
                      textTransform: 'none',
                      fontSize: '1rem',
                      fontWeight: 500,
                      borderRadius: 2,
                      transition: 'all 0.3s ease'
                    }}
                  >
                    {skipping ? (
                      <>
                        <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                        Skipping Setup...
                      </>
                    ) : (
                      'Skip Bluesky Setup'
                    )}
                  </Button>

                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: 'center', display: 'block' }}>
                    You can configure Bluesky later from your dashboard
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Right Side - Summary */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Card sx={{ 
                height: '100%', 
                minHeight: 400,
                bgcolor: '#F5F5F5',
                border: '1px solid',
                borderColor: 'grey.300',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
              }}>
                <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 4 }}>
                    Summary
                  </Typography>

                  <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                      <CheckCircleIcon sx={{ 
                        fontSize: 80, 
                        color: (ghostValidation?.valid && blueskyValidation?.valid) ? 'success.main' : 'grey.400' 
                      }} />
                    </Box>

                    <Paper sx={{ 
                      p: 3, 
                      bgcolor: ghostValidation?.valid ? '#E8F5E9' : 'white',
                      border: '2px solid',
                      borderColor: ghostValidation?.valid ? 'success.main' : 'grey.300',
                      mb: 2
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ 
                            width: 24, 
                            height: 24, 
                            bgcolor: '#15171A', 
                            borderRadius: 0.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'white'
                          }}>
                            G
                          </Box>
                          <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            Ghost
                          </Typography>
                        </Box>
                        <Typography variant="body1" sx={{ 
                          fontWeight: 600,
                          color: ghostValidation?.valid ? 'success.main' : 'warning.main'
                        }}>
                          {ghostValidation?.valid ? 'Connected' : 'Pending'}
                        </Typography>
                      </Box>
                    </Paper>

                    <Paper sx={{ 
                      p: 3, 
                      bgcolor: blueskyValidation?.valid ? '#E3F2FD' : 'white',
                      border: '2px solid',
                      borderColor: blueskyValidation?.valid ? 'info.main' : 'grey.300'
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TwitterIcon sx={{ color: '#1DA1F2' }} />
                          <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            Bluesky
                          </Typography>
                        </Box>
                        <Typography variant="body1" sx={{ 
                          fontWeight: 600,
                          color: blueskyValidation?.valid ? 'info.main' : 'warning.main'
                        }}>
                          {blueskyValidation?.valid ? 'Connected' : 'Pending'}
                        </Typography>
                      </Box>
                    </Paper>
                  </Box>

                  {ghostValidation?.valid && blueskyValidation?.valid && (
                    <Alert severity="success" sx={{ mt: 3 }}>
                      🎉 Both services connected successfully!
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        );

      case 1.5: // Webhook Information Step
        return (
          <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            <Paper 
              sx={{ 
                p: 4, 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                border: '1px solid',
                borderColor: 'grey.200',
                backgroundColor: '#f8f9fa'
              }}
            >
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, gap: 3 }}>
                <Box sx={{ 
                  width: 80, 
                  height: 80, 
                  bgcolor: '#1976d2', 
                  borderRadius: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 42,
                  fontWeight: 700,
                  color: 'white',
                  boxShadow: '0 4px 16px rgba(25, 118, 210, 0.3)'
                }}>
                  <WebhookIcon sx={{ fontSize: 40 }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: '#1976d2', mb: 0.5 }}>
                    Webhook Configuration
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '0.95rem' }}>
                    Complete the setup by configuring your Ghost webhook
                  </Typography>
                </Box>
                <Chip 
                  icon={<CheckCircleIcon />} 
                  label="Auto-sync Enabled" 
                  color="success" 
                  size="medium"
                />
              </Box>

              <Divider sx={{ mb: 4 }} />

              {/* Success Message */}
              <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  ✅ Ghost connection successful! Your posts are now syncing automatically.
                </Typography>
              </Alert>

              {/* Webhook URL */}
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                Webhook URL
              </Typography>
              
              <Card sx={{ mb: 3, border: '2px solid #e3f2fd' }}>
                <CardContent sx={{ py: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        fontFamily: 'monospace', 
                        backgroundColor: '#f5f5f5', 
                        p: 1.5, 
                        borderRadius: 1,
                        flex: 1,
                        mr: 2,
                        fontSize: '0.9rem'
                      }}
                    >
                      {webhookUrl}
                    </Typography>
                    <Tooltip title="Copy webhook URL">
                      <IconButton 
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          setSuccess('Webhook URL copied to clipboard!');
                        }}
                        size="small"
                        sx={{ bgcolor: '#e3f2fd', '&:hover': { bgcolor: '#bbdefb' } }}
                      >
                        <ContentCopyIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>

              {/* Setup Instructions */}
              <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  📋 Setup Instructions:
                </Typography>
                <Typography variant="body2" component="div">
                  1. Go to your Ghost Admin panel<br/>
                  2. Navigate to <strong>Settings → Integrations</strong><br/>
                  3. Click <strong>"Add custom integration"</strong><br/>
                  4. Name it <strong>"Auto-Sync Bridge"</strong><br/>
                  5. Click <strong>"Add webhook"</strong><br/>
                  6. Configure the webhook:<br/>
                  &nbsp;&nbsp;• <strong>Event:</strong> Post published<br/>
                  &nbsp;&nbsp;• <strong>URL:</strong> {webhookUrl}<br/>
                  &nbsp;&nbsp;• <strong>Header:</strong> X-User-ID = [Your User ID]<br/>
                  7. Save the webhook
                </Typography>
              </Alert>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 4 }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => router.push('/dashboard')}
                  sx={{ 
                    px: 4, 
                    py: 1.5, 
                    bgcolor: '#1976d2',
                    '&:hover': { 
                      bgcolor: '#1565c0',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.2)'
                    },
                    textTransform: 'none',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    borderRadius: 2,
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                >
                  Go to Dashboard
                </Button>
                
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => setActiveStep(1)}
                  sx={{ 
                    px: 4, 
                    py: 1.5, 
                    borderColor: '#1976d2',
                    color: '#1976d2',
                    '&:hover': { 
                      borderColor: '#1565c0',
                      color: '#1565c0',
                      bgcolor: '#e3f2fd'
                    },
                    textTransform: 'none',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    borderRadius: 2,
                    transition: 'all 0.3s ease'
                  }}
                >
                  Add Bluesky Later
                </Button>
              </Box>
            </Paper>
          </Box>
        );

      case 2:
        return (
          <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
            {/* Success Header */}
            <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'success.light', borderRadius: 3, mb: 4 }}>
              <CheckCircleIcon sx={{ fontSize: 120, color: 'success.main', mb: 2 }} />
              <Typography variant="h2" gutterBottom sx={{ fontWeight: 700, color: 'success.dark' }}>
                Setup Complete!
              </Typography>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                🎉 Your Ghost site is now connected to Bluesky
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Your posts will automatically sync to Bluesky when published
              </Typography>
            </Paper>

            {/* Connection Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ 
                  p: 4, 
                  bgcolor: '#E8F5E9', 
                  border: '2px solid #4caf50',
                  borderRadius: 2,
                  height: '100%'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{ 
                      width: 48, 
                      height: 48, 
                      bgcolor: '#15171A', 
                      borderRadius: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 700,
                      color: 'white'
                    }}>
                      G
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        Ghost Site
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark' }}>
                        ✓ Connected
                      </Typography>
                    </Box>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {ghostValidation?.site?.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formData.ghostUrl}
                  </Typography>
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ 
                  p: 4, 
                  bgcolor: '#E3F2FD', 
                  border: '2px solid #2196f3',
                  borderRadius: 2,
                  height: '100%'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <TwitterIcon sx={{ fontSize: 48, color: '#1DA1F2' }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        Bluesky Account
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.dark' }}>
                        ✓ Connected
                      </Typography>
                    </Box>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    @{blueskyValidation?.profile?.handle}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {blueskyValidation?.profile?.displayName}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Webhook Instructions */}
            <Paper sx={{ p: 4, borderRadius: 2, bgcolor: '#fff3e0', border: '2px solid #ff9800' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Box sx={{ 
                  width: 48, 
                  height: 48, 
                  bgcolor: '#ff9800',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24
                }}>
                  ⚙️
                </Box>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Final Step: Configure Ghost Webhook
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Enable automatic syncing when you publish posts
                  </Typography>
                </Box>
              </Box>
              
              <Paper sx={{ p: 3, bgcolor: 'white', mb: 3, border: '1px dashed #ff9800' }}>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block" sx={{ fontWeight: 600 }}>
                  📍 WEBHOOK URL:
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', fontWeight: 600, color: 'primary.main' }}>
                  {webhookUrl}
                </Typography>
              </Paper>

              <Box sx={{ bgcolor: 'white', p: 3, borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
                  📋 Setup Instructions:
                </Typography>
                <Box component="ol" sx={{ pl: 3, '& li': { mb: 1.5 } }}>
                  {webhookInstructions.map((instruction, index) => (
                    <Typography component="li" key={index} variant="body2">
                      {instruction.replace(/^\d+\.\s*/, '')}
                    </Typography>
                  ))}
                </Box>
              </Box>
            </Paper>

            {/* Action Buttons */}
            <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                size="large"
                onClick={() => window.open('/dashboard/settings', '_blank')}
                sx={{ px: 4, py: 1.5, textTransform: 'none', fontWeight: 600 }}
              >
                View Settings
              </Button>
              <Button
                variant="contained"
                size="large"
                onClick={handleFinish}
                sx={{ px: 4, py: 1.5, textTransform: 'none', fontWeight: 600, bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } }}
              >
                Go to Dashboard →
              </Button>
            </Box>

            <Alert severity="info" icon="💡" sx={{ mt: 4, fontSize: '0.95rem' }}>
              <strong>Pro Tip:</strong> You can also manually sync posts anytime from your dashboard using the &quot;Sync Now&quot; button!
            </Alert>
          </Box>
        );

      default:
        return 'Unknown step';
    }
  };

  return (
    <Box sx={{ bgcolor: '#fafafa', minHeight: '100vh' }}>
      {/* Top Navigation Bar */}
      <Box sx={{ bgcolor: 'white', borderBottom: '1px solid #e0e0e0', py: 2, px: 4 }}>
        <Container maxWidth="xl">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CloudIcon sx={{ color: 'primary.main', fontSize: 32 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                civicsky
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Button sx={{ textTransform: 'none', color: 'text.primary' }}>Dashboard</Button>
              <Button sx={{ textTransform: 'none', color: 'text.primary' }}>Civic Actions</Button>
              <Button sx={{ textTransform: 'none', color: 'primary.main', fontWeight: 600 }}>API Connection</Button>
              <Button sx={{ textTransform: 'none', color: 'text.primary' }}>Settings</Button>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ minHeight: 500 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Box>
            {getStepContent(activeStep)}

            {activeStep > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
                {activeStep === steps.length - 1 ? (
                  <Button
                    variant="contained"
                    onClick={handleFinish}
                    size="large"
                    sx={{ 
                      px: 5, 
                      py: 1.5, 
                      fontSize: '1rem',
                      fontWeight: 600,
                      borderRadius: 2
                    }}
                  >
                    Go to Dashboard
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    disabled={loading}
                    size="large"
                    sx={{ 
                      px: 5, 
                      py: 1.5, 
                      fontSize: '1rem',
                      fontWeight: 600,
                      borderRadius: 2
                    }}
                  >
                    {loading ? (
                      <>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        Validating...
                      </>
                    ) : (
                      'Complete Setup'
                    )}
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

