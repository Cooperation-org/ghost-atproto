import request from 'supertest';
import { createTestApp, createAuthToken, prisma, cleanupTestData } from './test-helper';

const app = createTestApp();

describe('User Engagement API', () => {
  let testUser: any;
  let testCivicAction: any;
  let authToken: string;

  beforeAll(async () => {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'test-engagement-user@example.com',
        name: 'Test Engagement User',
        password: 'hashedpassword123',
        role: 'USER'
      }
    });

    authToken = createAuthToken(testUser.id);

    // Create test civic action
    testCivicAction = await prisma.civicAction.create({
      data: {
        title: 'Test Event',
        description: 'Test event description',
        eventType: 'CANVASS',
        location: 'Test Location',
        eventDate: new Date(Date.now() + 86400000), // Tomorrow
        status: 'approved',
        userId: testUser.id,
        source: 'mobilize',
        externalId: 'test-123',
        externalUrl: 'https://mobilize.us/test'
      }
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('POST /api/user/engagements', () => {
    afterEach(async () => {
      await prisma.userEngagement.deleteMany({
        where: { userId: testUser.id }
      });
    });

    it('should create a new engagement with default status', async () => {
      const response = await request(app)
        .post('/api/user/engagements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ civicActionId: testCivicAction.id });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('interested');
      expect(response.body.civicActionId).toBe(testCivicAction.id);
      expect(response.body.userId).toBe(testUser.id);
    });

    it('should create engagement with custom status', async () => {
      const response = await request(app)
        .post('/api/user/engagements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          civicActionId: testCivicAction.id,
          status: 'going',
          notes: 'Excited to attend!'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('going');
      expect(response.body.notes).toBe('Excited to attend!');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/user/engagements')
        .send({ civicActionId: testCivicAction.id });

      expect(response.status).toBe(401);
    });

    it('should fail without civicActionId', async () => {
      const response = await request(app)
        .post('/api/user/engagements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('civicActionId');
    });

    it('should fail with invalid status', async () => {
      const response = await request(app)
        .post('/api/user/engagements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          civicActionId: testCivicAction.id,
          status: 'invalid-status'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid status');
    });

    it('should prevent duplicate engagements', async () => {
      // Create first engagement
      await request(app)
        .post('/api/user/engagements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ civicActionId: testCivicAction.id });

      // Attempt to create duplicate
      const response = await request(app)
        .post('/api/user/engagements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ civicActionId: testCivicAction.id });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('PATCH /api/user/engagements/:id', () => {
    let engagement: any;

    beforeEach(async () => {
      engagement = await prisma.userEngagement.create({
        data: {
          userId: testUser.id,
          civicActionId: testCivicAction.id,
          status: 'interested'
        }
      });
    });

    afterEach(async () => {
      await prisma.userEngagement.deleteMany({
        where: { userId: testUser.id }
      });
    });

    it('should update engagement status', async () => {
      const response = await request(app)
        .patch(`/api/user/engagements/${engagement.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'going' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('going');
    });

    it('should update engagement notes', async () => {
      const response = await request(app)
        .patch(`/api/user/engagements/${engagement.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notes: 'Updated notes' });

      expect(response.status).toBe(200);
      expect(response.body.notes).toBe('Updated notes');
    });

    it('should fail to update another user\'s engagement', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'test-engagement-other@example.com',
          name: 'Other User',
          password: 'hashedpassword123',
          role: 'USER'
        }
      });

      const otherToken = createAuthToken(otherUser.id);

      const response = await request(app)
        .patch(`/api/user/engagements/${engagement.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'completed' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('should fail with invalid status', async () => {
      const response = await request(app)
        .patch(`/api/user/engagements/${engagement.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid status');
    });

    it('should fail for non-existent engagement', async () => {
      const response = await request(app)
        .patch('/api/user/engagements/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'going' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/user/engagements/:id', () => {
    let engagement: any;

    beforeEach(async () => {
      engagement = await prisma.userEngagement.create({
        data: {
          userId: testUser.id,
          civicActionId: testCivicAction.id,
          status: 'interested'
        }
      });
    });

    it('should delete engagement', async () => {
      const response = await request(app)
        .delete(`/api/user/engagements/${engagement.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted');

      // Verify deletion
      const deleted = await prisma.userEngagement.findUnique({
        where: { id: engagement.id }
      });
      expect(deleted).toBeNull();
    });

    it('should fail to delete another user\'s engagement', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: 'test-engagement-delete@example.com',
          name: 'Delete User',
          password: 'hashedpassword123',
          role: 'USER'
        }
      });

      const otherToken = createAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/user/engagements/${engagement.id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('should fail for non-existent engagement', async () => {
      const response = await request(app)
        .delete('/api/user/engagements/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/user/impact', () => {
    beforeEach(async () => {
      // Create some test data
      await prisma.userEngagement.create({
        data: {
          userId: testUser.id,
          civicActionId: testCivicAction.id,
          status: 'going'
        }
      });

      await prisma.post.create({
        data: {
          title: 'Test Article',
          content: 'Test content',
          slug: 'test-article',
          status: 'published',
          userId: testUser.id
        }
      });
    });

    afterEach(async () => {
      await prisma.userEngagement.deleteMany({
        where: { userId: testUser.id }
      });
      await prisma.post.deleteMany({
        where: { userId: testUser.id, title: 'Test Article' }
      });
    });

    it('should return user impact data', async () => {
      const response = await request(app)
        .get('/api/user/impact')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('activeCommitments');
      expect(response.body).toHaveProperty('completedActions');
      expect(response.body).toHaveProperty('createdActions');
      expect(response.body).toHaveProperty('createdArticles');
    });

    it('should return correct metrics', async () => {
      const response = await request(app)
        .get('/api/user/impact')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.metrics.activeCommitmentsCount).toBe(1);
      expect(response.body.metrics.createdArticlesCount).toBeGreaterThanOrEqual(1);
      expect(response.body.activeCommitments).toHaveLength(1);
      expect(response.body.activeCommitments[0].status).toBe('going');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/user/impact');

      expect(response.status).toBe(401);
    });

    it('should separate active and completed engagements', async () => {
      // Add completed engagement
      await prisma.userEngagement.create({
        data: {
          userId: testUser.id,
          civicActionId: testCivicAction.id,
          status: 'completed'
        }
      });

      const response = await request(app)
        .get('/api/user/impact')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.metrics.completedActionsCount).toBeGreaterThanOrEqual(1);
      expect(response.body.completedActions.length).toBeGreaterThanOrEqual(1);

      // Cleanup the completed engagement
      await prisma.userEngagement.deleteMany({
        where: {
          userId: testUser.id,
          status: 'completed'
        }
      });
    });
  });
});
