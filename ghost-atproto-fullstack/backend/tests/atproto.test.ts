// ATProto API Endpoint Test Examples
// This file demonstrates how to test the ATProto endpoints
// Install test dependencies: npm install --save-dev jest @types/jest supertest @types/supertest ts-jest

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Example of how to manually test the endpoint
export const manualTestExamples = {
  // First, create a test post in your database
  createTestPost: async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        password: 'testpassword123'
      }
    });

    const post = await prisma.post.create({
      data: {
        title: 'Test Post for ATProto',
        content: '<p>This is a test post that will be published to Bluesky.</p>',
        slug: 'test-post-atproto',
        status: 'published',
        publishedAt: new Date(),
        userId: user.id
      }
    });

    return post;
  },

  // Test the publish endpoint
  testPublish: async (postId: string) => {
    const response = await fetch('http://localhost:5000/api/atproto/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ postId })
    });

    return await response.json();
  },

  // Test error cases
  testMissingPostId: async () => {
    const response = await fetch('http://localhost:5000/api/atproto/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });

    return await response.json();
  },

  testNonExistentPost: async () => {
    const response = await fetch('http://localhost:5000/api/atproto/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ postId: 'non-existent-id' })
    });

    return await response.json();
  },

  // Test sync logs endpoints
  testGetSyncLogs: async () => {
    const response = await fetch('http://localhost:5000/api/atproto/sync-logs');
    return await response.json();
  },

  testGetPostSyncLogs: async (postId: string) => {
    const response = await fetch(`http://localhost:5000/api/atproto/sync-logs/${postId}`);
    return await response.json();
  }
};

// Usage example:
// const post = await manualTestExamples.createTestPost();
// const result = await manualTestExamples.testPublish(post.id);
// console.log(result);

/*
// Jest test structure (requires dependencies):

import request from 'supertest';
import express from 'express';
import atprotoRoutes from '../src/routes/atproto';

const app = express();
app.use(express.json());
app.use('/api/atproto', atprotoRoutes);

describe('ATProto API Endpoints', () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/atproto/publish', () => {
    it('should return 400 when postId is missing', async () => {
      const response = await request(app)
        .post('/api/atproto/publish')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Post ID is required');
    });

    it('should return 404 when post is not found', async () => {
      const response = await request(app)
        .post('/api/atproto/publish')
        .send({ postId: 'non-existent-id' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Post not found');
    });
  });
});

*/