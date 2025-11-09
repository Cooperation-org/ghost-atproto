# Testing Guide

This document explains how to run and write tests for the backend API.

## Prerequisites

1. **Test Database Setup**
   - Create a separate MySQL database for testing (e.g., `civicsky_test`)
   - Never use your production or development database for tests!

2. **Environment Configuration**
   ```bash
   # Copy the example test environment file
   cp .env.test.example .env.test

   # Edit .env.test and update with your test database credentials
   nano .env.test
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Initialize Test Database**
   ```bash
   # Load .env.test variables and push schema to test database
   export $(cat .env.test | xargs) && npx prisma db push
   ```

## Running Tests

### Run All Tests
```bash
# Load test environment and run all tests
export $(cat .env.test | xargs) && npm test
```

### Run Tests in Watch Mode
```bash
export $(cat .env.test | xargs) && npm run test:watch
```

### Run Tests with Coverage
```bash
export $(cat .env.test | xargs) && npm run test:coverage
```

### Run Specific Test File
```bash
export $(cat .env.test | xargs) && npx jest tests/user-engagement.test.ts
```

## Manual API Testing

### Mobilize Sync (Admin Only)

To manually trigger the Mobilize event sync:

```bash
# 1. Login as admin and get JWT token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'

# 2. Use the token from login response
export JWT_TOKEN="your-jwt-token-here"

# 3. Trigger Mobilize sync
curl -X POST http://localhost:5000/api/admin/sync-mobilize \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationIds": [93],
    "updatedSince": null
  }'
```

**Parameters:**
- `organizationIds`: Array of Mobilize organization IDs (default: [93])
- `updatedSince`: Unix timestamp to fetch events updated since that time (optional)

**Response:**
```json
{
  "message": "Mobilize sync completed",
  "result": {
    "synced": 10,
    "skipped": 5,
    "errors": 0
  }
}
```

## Test Structure

### User Engagement Tests
- `tests/user-engagement.test.ts` - Tests for engagement CRUD operations
- Covers: create, read, update, delete engagements
- Covers: impact dashboard data fetching
- Covers: authorization and validation

### Mobilize Sync Tests
- `tests/mobilize-sync.test.ts` - Tests for Mobilize API integration
- Covers: event creation, updates, pagination
- Covers: filtering upcoming vs past events
- Covers: error handling

### Test Helpers
- `tests/test-helper.ts` - Shared test utilities
- `tests/setup.ts` - Global test configuration

## Writing New Tests

### Example Test Structure

```typescript
import request from 'supertest';
import { createTestApp, createAuthToken, prisma } from './test-helper';

const app = createTestApp();

describe('Feature Name', () => {
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    // Setup test data
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: 'hashed',
        role: 'USER'
      }
    });
    authToken = createAuthToken(testUser.id);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.$disconnect();
  });

  it('should do something', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});
```

## Troubleshooting

### Error: Environment variable not found: DATABASE_URL

Make sure you've loaded the .env.test file:
```bash
export $(cat .env.test | xargs) && npm test
```

### Error: Connection refused

Ensure your MySQL server is running and the credentials in .env.test are correct.

### Tests Failing Due to Dirty Data

The test database might have leftover data. You can reset it:
```bash
export $(cat .env.test | xargs) && npx prisma db push --force-reset
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always cleanup test data in `afterEach` or `afterAll` hooks
3. **Naming**: Use descriptive test names that explain what is being tested
4. **Mocking**: Mock external APIs (like Mobilize) to avoid hitting real endpoints
5. **Speed**: Keep tests fast by minimizing database operations

## CI/CD Integration

For continuous integration, you can run tests with:

```bash
#!/bin/bash
set -e

# Load test environment
export $(cat .env.test | xargs)

# Setup test database
npx prisma db push --skip-generate

# Run tests
npm test

# Cleanup (optional)
npx prisma db push --force-reset
```
