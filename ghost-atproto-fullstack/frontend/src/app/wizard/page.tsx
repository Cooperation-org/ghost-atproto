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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CloudIcon from '@mui/icons-material/Cloud';
import LinkIcon from '@mui/icons-material/Link';
import TwitterIcon from '@mui/icons-material/Twitter';
import ArticleIcon from '@mui/icons-material/Article';
import PeopleIcon from '@mui/icons-material/People';
import LabelIcon from '@mui/icons-material/Label';
import EmailIcon from '@mui/icons-material/Email';
import { useRouter } from 'next/navigation';
import { wizardApi, GhostValidationResponse, BlueskyValidationResponse } from '@/lib/wizard-api';

const steps = ['Connect Ghost', 'Connect Bluesky', 'Complete Setup'];

export default function WizardPage() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    ghostUrl: '',
    ghostApiKey: '',
    ghostContentApiKey: '',
    atprotoHandle: '',
    atprotoAppPassword: '',
  });

  const [importOptions, setImportOptions] = useState({
    posts: true,
    authors: true,
    tags: true,
    newsletters: true,
  });

  // Validation results
  const [ghostValidation, setGhostValidation] = useState<GhostValidationResponse | null>(null);
  const [blueskyValidation, setBlueskyValidation] = useState<BlueskyValidationResponse | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookInstructions, setWebhookInstructions] = useState<string[]>([]);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to validate Ghost');
        setLoading(false);
        return;
      }
      setLoading(false);
    } else if (activeStep === 1) {
      // Validate Bluesky
      if (!formData.atprotoHandle || !formData.atprotoAppPassword) {
        setError('Please fill in all Bluesky fields');
        return;
      }
      setLoading(true);
      try {
        const result = await wizardApi.validateBluesky(formData.atprotoHandle, formData.atprotoAppPassword);
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
        const result = await wizardApi.completeWizard(formData);
        setWebhookUrl(result.webhookUrl);
        setWebhookInstructions(result.nextSteps.webhookInstructions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete setup');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setError('');
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
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

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            {/* Main Content - Two Column Layout */}
            <Grid container spacing={4}>
              {/* LEFT SIDE - Ghost Integration */}
              <Grid size={{ xs: 12, lg: 7 }}>
                <Paper sx={{ p: 4, borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: '#15171A' }}>
                      Ghost Integration
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Step 1 of 3: Connect Your Ghost Account
                    </Typography>
                  </Box>

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
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Ghost Admin API Key"
                        value={formData.ghostApiKey}
                        onChange={handleChange('ghostApiKey')}
                        placeholder="Enter your admin API key"
                        disabled={loading}
                        type="password"
                        variant="outlined"
                        size="medium"
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Ghost Content API Key"
                        value={formData.ghostContentApiKey}
                        onChange={handleChange('ghostContentApiKey')}
                        placeholder="Enter your content API key"
                        disabled={loading}
                        type="password"
                        variant="outlined"
                        size="medium"
                      />
                    </Grid>
                  </Grid>

                  <Box sx={{ mt: 4 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                      Import Options
                    </Typography>
                    <FormGroup>
                      <Grid container spacing={1}>
                        <Grid size={{ xs: 6 }}>
                          <FormControlLabel
                            control={<Checkbox checked={importOptions.posts} onChange={handleImportOptionChange('posts')} />}
                            label={<Typography variant="body2">Posts</Typography>}
                          />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                          <FormControlLabel
                            control={<Checkbox checked={importOptions.authors} onChange={handleImportOptionChange('authors')} />}
                            label={<Typography variant="body2">Authors</Typography>}
                          />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                          <FormControlLabel
                            control={<Checkbox checked={importOptions.tags} onChange={handleImportOptionChange('tags')} />}
                            label={<Typography variant="body2">Tags</Typography>}
                          />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                          <FormControlLabel
                            control={<Checkbox checked={importOptions.newsletters} onChange={handleImportOptionChange('newsletters')} />}
                            label={<Typography variant="body2">Newsletters</Typography>}
                          />
                        </Grid>
                      </Grid>
                    </FormGroup>
                  </Box>

                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    disabled={loading}
                    onClick={handleNext}
                    sx={{ 
                      mt: 3, 
                      py: 1.5, 
                      bgcolor: '#1976d2',
                      '&:hover': { bgcolor: '#1565c0' },
                      textTransform: 'none',
                      fontSize: '1rem',
                      fontWeight: 600
                    }}
                  >
                    {loading ? (
                      <>
                        <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                        Validating...
                      </>
                    ) : (
                      'Sync Now'
                    )}
                  </Button>

                  {ghostValidation?.valid && (
                    <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
                      Last synced: Just now. Status: <strong>Healthy</strong>
                    </Typography>
                  )}
                </Paper>
              </Grid>

              {/* RIGHT SIDE - Connection Status */}
              <Grid size={{ xs: 12, lg: 5 }}>
                <Paper sx={{ 
                  p: 5, 
                  borderRadius: 2, 
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)', 
                  textAlign: 'center',
                  bgcolor: ghostValidation?.valid ? '#E8F5E9' : '#FFF3E0',
                  border: '2px solid',
                  borderColor: ghostValidation?.valid ? '#4caf50' : '#ff9800'
                }}>
                  <Box sx={{ 
                    width: 100, 
                    height: 100, 
                    bgcolor: '#15171A', 
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 56,
                    fontWeight: 700,
                    color: 'white',
                    mx: 'auto',
                    mb: 3,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}>
                    G
                  </Box>

                  {ghostValidation?.valid ? (
                    <>
                      <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
                      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700, color: 'success.dark' }}>
                        Ghost Connected!
                      </Typography>
                      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                        Your Ghost site is successfully connected
                      </Typography>
                      <Paper sx={{ p: 2, bgcolor: 'white', mb: 3 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          SITE
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {ghostValidation.site?.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formData.ghostUrl}
                        </Typography>
                      </Paper>
                      <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        onClick={handleNext}
                        disabled={loading}
                        sx={{ 
                          py: 1.5,
                          bgcolor: 'success.main',
                          '&:hover': { bgcolor: 'success.dark' },
                          textTransform: 'none',
                          fontSize: '1rem',
                          fontWeight: 600
                        }}
                      >
                        {loading ? (
                          <>
                            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
                            Processing...
                          </>
                        ) : (
                          'Continue to Bluesky Setup →'
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700, color: '#f57c00' }}>
                        Ghost Not Connected
                      </Typography>
                      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                        Please fill in your Ghost credentials and click "Sync Now" to connect your site
                      </Typography>
                      <Box sx={{ 
                        p: 3, 
                        bgcolor: 'white', 
                        borderRadius: 2,
                        border: '2px dashed #ff9800',
                        mb: 3
                      }}>
                        <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
                          ⚠️ Connection Required
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Enter your Ghost URL and API keys in the form on the left, then click the "Sync Now" button to establish connection.
                        </Typography>
                      </Box>
                      <Alert severity="info" sx={{ textAlign: 'left' }}>
                        <Typography variant="caption">
                          <strong>Need help?</strong> Find your API keys in Ghost Admin → Settings → Integrations → Custom Integrations
                        </Typography>
                      </Alert>
                    </>
                  )}
                </Paper>
              </Grid>
            </Grid>
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
                        value={formData.atprotoHandle}
                        onChange={handleChange('atprotoHandle')}
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
                        value={formData.atprotoAppPassword}
                        onChange={handleChange('atprotoAppPassword')}
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
              <strong>Pro Tip:</strong> You can also manually sync posts anytime from your dashboard using the "Sync Now" button!
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

      <Container maxWidth="xl" sx={{ py: 4, pb: 12 }}>
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

      {/* Footer with Social Media Links */}
      <Box sx={{ 
        bgcolor: 'white', 
        borderTop: '1px solid #e0e0e0', 
        py: 3, 
        mt: 6,
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0
      }}>
        <Container maxWidth="xl">
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
            <TwitterIcon sx={{ color: '#1DA1F2', cursor: 'pointer', '&:hover': { opacity: 0.7 } }} />
            <Box component="span" sx={{ 
              width: 24, 
              height: 24, 
              bgcolor: '#1877f2', 
              borderRadius: '50%', 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              '&:hover': { opacity: 0.7 }
            }}>
              f
            </Box>
            <Box component="span" sx={{ 
              width: 24, 
              height: 24, 
              background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)', 
              borderRadius: '50%', 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              '&:hover': { opacity: 0.7 }
            }}>
              i
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

