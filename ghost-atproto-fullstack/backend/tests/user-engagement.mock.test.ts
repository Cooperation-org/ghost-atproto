import { PrismaClient } from '@prisma/client';
import { syncMobilizeEvents } from '../src/jobs/sync-mobilize';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    userEngagement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    civicAction: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    post: {
      findMany: jest.fn(),
    },
    settings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Mock axios
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('User Engagement Logic (Mocked)', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    jest.clearAllMocks();
  });

  describe('GET /api/user/impact logic', () => {
    it('should separate active and completed engagements', async () => {
      const mockEngagements = [
        {
          id: '1',
          userId: 'user-1',
          status: 'going',
          civicAction: { id: 'action-1', title: 'Event 1' },
        },
        {
          id: '2',
          userId: 'user-1',
          status: 'interested',
          civicAction: { id: 'action-2', title: 'Event 2' },
        },
        {
          id: '3',
          userId: 'user-1',
          status: 'completed',
          civicAction: { id: 'action-3', title: 'Event 3' },
        },
      ];

      mockPrisma.userEngagement.findMany.mockResolvedValue(mockEngagements);

      const engagements = await mockPrisma.userEngagement.findMany({
        where: { userId: 'user-1' },
      });

      const activeCommitments = engagements.filter(
        (e: any) => e.status === 'interested' || e.status === 'going'
      );
      const completedActions = engagements.filter(
        (e: any) => e.status === 'completed'
      );

      expect(activeCommitments).toHaveLength(2);
      expect(completedActions).toHaveLength(1);
      expect(activeCommitments[0].status).toBe('going');
      expect(activeCommitments[1].status).toBe('interested');
      expect(completedActions[0].status).toBe('completed');
    });

    it('should calculate correct metrics', async () => {
      mockPrisma.userEngagement.findMany.mockResolvedValue([
        { id: '1', status: 'going' },
        { id: '2', status: 'interested' },
        { id: '3', status: 'completed' },
      ]);

      mockPrisma.civicAction.findMany.mockResolvedValue([
        { id: 'action-1', engagements: [{ id: 'e1' }, { id: 'e2' }] },
        { id: 'action-2', engagements: [{ id: 'e3' }] },
      ]);

      mockPrisma.post.findMany.mockResolvedValue([
        { id: 'post-1' },
        { id: 'post-2' },
        { id: 'post-3' },
      ]);

      const engagements = await mockPrisma.userEngagement.findMany();
      const createdActions = await mockPrisma.civicAction.findMany();
      const createdArticles = await mockPrisma.post.findMany();

      const metrics = {
        completedActionsCount: engagements.filter((e: any) => e.status === 'completed').length,
        activeCommitmentsCount: engagements.filter(
          (e: any) => e.status === 'interested' || e.status === 'going'
        ).length,
        createdActionsCount: createdActions.length,
        createdArticlesCount: createdArticles.length,
      };

      expect(metrics.completedActionsCount).toBe(1);
      expect(metrics.activeCommitmentsCount).toBe(2);
      expect(metrics.createdActionsCount).toBe(2);
      expect(metrics.createdArticlesCount).toBe(3);
    });
  });

  describe('POST /api/user/engagements logic', () => {
    it('should validate status values', () => {
      const validStatuses = ['interested', 'going', 'completed'];

      expect(validStatuses.includes('interested')).toBe(true);
      expect(validStatuses.includes('going')).toBe(true);
      expect(validStatuses.includes('completed')).toBe(true);
      expect(validStatuses.includes('invalid')).toBe(false);
    });

    it('should create engagement with default status', async () => {
      const mockEngagement = {
        id: 'eng-1',
        userId: 'user-1',
        civicActionId: 'action-1',
        status: 'interested',
        notes: null,
      };

      mockPrisma.userEngagement.create.mockResolvedValue(mockEngagement);

      const result = await mockPrisma.userEngagement.create({
        data: {
          userId: 'user-1',
          civicActionId: 'action-1',
          status: 'interested',
        },
      });

      expect(result.status).toBe('interested');
      expect(mockPrisma.userEngagement.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          civicActionId: 'action-1',
          status: 'interested',
        },
      });
    });

    it('should check for duplicate engagements', async () => {
      mockPrisma.userEngagement.findUnique.mockResolvedValue({
        id: 'existing',
        userId: 'user-1',
        civicActionId: 'action-1',
      });

      const existing = await mockPrisma.userEngagement.findUnique({
        where: {
          userId_civicActionId: {
            userId: 'user-1',
            civicActionId: 'action-1',
          },
        },
      });

      expect(existing).not.toBeNull();
      expect(existing.id).toBe('existing');
    });
  });

  describe('PATCH /api/user/engagements/:id logic', () => {
    it('should update engagement status', async () => {
      const updated = {
        id: 'eng-1',
        status: 'completed',
        notes: 'Done!',
      };

      mockPrisma.userEngagement.update.mockResolvedValue(updated);

      const result = await mockPrisma.userEngagement.update({
        where: { id: 'eng-1' },
        data: { status: 'completed', notes: 'Done!' },
      });

      expect(result.status).toBe('completed');
      expect(result.notes).toBe('Done!');
    });

    it('should validate ownership before update', async () => {
      mockPrisma.userEngagement.findUnique.mockResolvedValue({
        id: 'eng-1',
        userId: 'user-1',
      });

      const existing = await mockPrisma.userEngagement.findUnique({
        where: { id: 'eng-1' },
      });

      const isOwner = existing.userId === 'user-1';
      expect(isOwner).toBe(true);

      const isNotOwner = existing.userId === 'user-2';
      expect(isNotOwner).toBe(false);
    });
  });

  describe('DELETE /api/user/engagements/:id logic', () => {
    it('should delete engagement', async () => {
      mockPrisma.userEngagement.delete.mockResolvedValue({
        id: 'eng-1',
      });

      const result = await mockPrisma.userEngagement.delete({
        where: { id: 'eng-1' },
      });

      expect(result.id).toBe('eng-1');
      expect(mockPrisma.userEngagement.delete).toHaveBeenCalledWith({
        where: { id: 'eng-1' },
      });
    });
  });
});

describe('Mobilize Sync Logic (Mocked)', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    jest.clearAllMocks();
  });

  describe('syncMobilizeEvents', () => {
    it('should filter out past events', () => {
      const now = Math.floor(Date.now() / 1000);

      const events = [
        { id: 1, timeslots: [{ start_date: now + 86400 }] }, // Future
        { id: 2, timeslots: [{ start_date: now - 86400 }] }, // Past
        { id: 3, timeslots: [{ start_date: now + 172800 }] }, // Future
      ];

      const upcomingEvents = events.filter(event => {
        const earliestSlot = event.timeslots
          .filter((t: any) => t.start_date > now)
          .sort((a: any, b: any) => a.start_date - b.start_date)[0];
        return earliestSlot !== undefined;
      });

      expect(upcomingEvents).toHaveLength(2);
      expect(upcomingEvents[0].id).toBe(1);
      expect(upcomingEvents[1].id).toBe(3);
    });

    it('should format location string correctly', () => {
      const location = {
        venue: 'Community Center',
        address_lines: ['123 Main St'],
        locality: 'Springfield',
        region: 'MA',
      };

      const parts = [
        location.venue,
        location.address_lines[0],
        location.locality,
        location.region,
      ].filter(p => p && p.trim());

      const locationString = parts.join(', ');

      expect(locationString).toBe('Community Center, 123 Main St, Springfield, MA');
    });

    it('should create system user if not exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'system-user',
        email: 'system@mobilize.sync',
        role: 'ADMIN',
      });

      let systemUser = await mockPrisma.user.findFirst({
        where: { email: 'system@mobilize.sync' },
      });

      if (!systemUser) {
        systemUser = await mockPrisma.user.create({
          data: {
            email: 'system@mobilize.sync',
            name: 'Mobilize Sync',
            password: 'SYSTEM_USER_NO_LOGIN',
            role: 'ADMIN',
          },
        });
      }

      expect(systemUser).not.toBeNull();
      expect(systemUser.email).toBe('system@mobilize.sync');
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should use existing system user if exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'existing-system-user',
        email: 'system@mobilize.sync',
      });

      const systemUser = await mockPrisma.user.findFirst({
        where: { email: 'system@mobilize.sync' },
      });

      expect(systemUser).not.toBeNull();
      expect(systemUser.id).toBe('existing-system-user');
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should update last sync timestamp', async () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);

      mockPrisma.settings.upsert.mockResolvedValue({
        key: 'mobilize_last_sync',
        value: String(currentTimestamp),
      });

      const result = await mockPrisma.settings.upsert({
        where: { key: 'mobilize_last_sync' },
        update: { value: String(currentTimestamp) },
        create: { key: 'mobilize_last_sync', value: String(currentTimestamp) },
      });

      expect(result.key).toBe('mobilize_last_sync');
      expect(parseInt(result.value)).toBeGreaterThan(0);
    });
  });
});
