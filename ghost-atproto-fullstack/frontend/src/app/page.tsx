"use client"

import { Container, Typography, Grid, Paper, List, ListItem, ListItemText, Stack } from '@mui/material'
import CircleIcon from '@mui/icons-material/Circle'

export default function Home() {
  return (
    <Container maxWidth="lg" sx={{ py: 8 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Ghost ATProto Integration
      </Typography>
      <Typography variant="body1" sx={{ mb: 4 }}>
        Welcome to your Ghost-ATProto NextJS application!
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h5" component="h2" gutterBottom>
              Features
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText primary="Ghost CMS Integration" />
              </ListItem>
              <ListItem>
                <ListItemText primary="ATProto/Bluesky Publishing" />
              </ListItem>
              <ListItem>
                <ListItemText primary="Automatic Content Sync" />
              </ListItem>
              <ListItem>
                <ListItemText primary="User Management" />
              </ListItem>
              <ListItem>
                <ListItemText primary="Real-time Dashboard" />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h5" component="h2" gutterBottom>
              Status
            </Typography>
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                <Typography variant="body2">Database Connected</Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircleIcon fontSize="small" sx={{ color: 'warning.main' }} />
                <Typography variant="body2">Setup In Progress</Typography>
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}
