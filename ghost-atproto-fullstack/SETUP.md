# Development Setup - Team Internal

## Database Connection (Development)
```bash
# PostgreSQL tunnel setup
ssh -i "ghostsky.pem" -L 5432:localhost:5432 ubuntu@ec2-204-236-176-29.us-west-1.compute.amazonaws.com

# Environment configuration
DATABASE_URL="postgresql://ghostsky:ghostsky@localhost:5432/ghostsky_db"