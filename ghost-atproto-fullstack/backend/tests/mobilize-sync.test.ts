import { PrismaClient } from '@prisma/client';
import { syncMobilizeEvents } from '../src/jobs/sync-mobilize';

const prisma = new PrismaClient();

// Mock axios for testing without hitting real API
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Mobilize Events Sync', () => {
  let systemUser: any;

  beforeAll(async () => {
    // Ensure system user exists
    systemUser = await prisma.user.findFirst({
      where: { email: 'system@mobilize.sync' }
    });

    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: {
          email: 'system@mobilize.sync',
          name: 'Mobilize Sync',
          password: 'SYSTEM_USER_NO_LOGIN',
          role: 'ADMIN'
        }
      });
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.civicAction.deleteMany({
      where: {
        source: 'mobilize',
        externalId: { startsWith: 'test-' }
      }
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncMobilizeEvents', () => {
    it('should create civic actions from Mobilize events', async () => {
      const mockMobilizeResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          data: [
            {
              id: 123456,
              title: 'Test Canvass Event',
              summary: 'Join us for canvassing',
              description: 'Detailed description of the event',
              event_type: 'CANVASS',
              featured_image_url: 'https://example.com/image.jpg',
              browser_url: 'https://mobilize.us/test/event/123456',
              is_virtual: false,
              timezone: 'America/New_York',
              location: {
                venue: 'Community Center',
                address_lines: ['123 Main St'],
                locality: 'Springfield',
                region: 'MA',
                postal_code: '01234',
                location: {
                  latitude: 42.1015,
                  longitude: -72.5898
                }
              },
              timeslots: [
                {
                  id: 1,
                  start_date: Math.floor(Date.now() / 1000) + 86400, // Tomorrow
                  end_date: Math.floor(Date.now() / 1000) + 90000,
                  is_full: false,
                  instructions: 'Meet at the entrance'
                }
              ],
              sponsor: {
                id: 93,
                name: 'Test Organization',
                slug: 'test-org',
                org_type: 'CAMPAIGN',
                state: 'MA',
                district: '1',
                candidate_name: 'Test Candidate',
                is_coordinated: true,
                is_independent: false,
                is_nonelectoral: false,
                is_primary_campaign: false,
                race_type: 'STATE_HOUSE',
                event_feed_url: 'https://api.mobilize.us/v1/organizations/93/events',
                created_date: 1234567890,
                modified_date: 1234567890
              },
              tags: [
                { id: 1, name: 'Canvassing' }
              ],
              created_date: 1234567890,
              modified_date: 1234567890
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockMobilizeResponse);

      const result = await syncMobilizeEvents([93]);

      expect(result.synced).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);

      // Verify the civic action was created
      const civicAction = await prisma.civicAction.findFirst({
        where: {
          source: 'mobilize',
          externalId: '123456'
        }
      });

      expect(civicAction).not.toBeNull();
      expect(civicAction?.title).toBe('Test Canvass Event');
      expect(civicAction?.eventType).toBe('CANVASS');
      expect(civicAction?.status).toBe('approved');
      expect(civicAction?.userId).toBe(systemUser.id);
      expect(civicAction?.externalUrl).toBe('https://mobilize.us/test/event/123456');
      expect(civicAction?.location).toContain('Community Center');
      expect(civicAction?.location).toContain('Springfield');
    });

    it('should skip events with no upcoming timeslots', async () => {
      const mockMobilizeResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          data: [
            {
              id: 789012,
              title: 'Past Event',
              summary: 'This event has passed',
              description: 'Event description',
              event_type: 'MEETING',
              browser_url: 'https://mobilize.us/test/event/789012',
              is_virtual: false,
              timezone: 'America/New_York',
              location: {
                address_lines: ['456 Elm St'],
                locality: 'Boston',
                region: 'MA'
              },
              timeslots: [
                {
                  id: 2,
                  start_date: Math.floor(Date.now() / 1000) - 86400, // Yesterday
                  end_date: Math.floor(Date.now() / 1000) - 82800,
                  is_full: false,
                  instructions: null
                }
              ],
              sponsor: {
                id: 93,
                name: 'Test Organization',
                org_type: 'CAMPAIGN',
                event_feed_url: 'https://api.mobilize.us/v1/organizations/93/events',
                created_date: 1234567890,
                modified_date: 1234567890,
                slug: 'test-org',
                is_coordinated: true,
                is_independent: false,
                is_nonelectoral: false,
                is_primary_campaign: false,
                race_type: null,
                state: 'MA',
                district: '',
                candidate_name: ''
              },
              tags: [],
              created_date: 1234567890,
              modified_date: 1234567890
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockMobilizeResponse);

      const result = await syncMobilizeEvents([93]);

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('should update existing civic actions', async () => {
      // First create a civic action
      const existingAction = await prisma.civicAction.create({
        data: {
          title: 'Original Title',
          description: 'Original description',
          eventType: 'CANVASS',
          location: 'Original Location',
          eventDate: new Date(),
          status: 'approved',
          userId: systemUser.id,
          source: 'mobilize',
          externalId: 'test-update-123',
          externalUrl: 'https://mobilize.us/test/event/test-update-123'
        }
      });

      const mockMobilizeResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          data: [
            {
              id: parseInt(existingAction.externalId as string),
              title: 'Updated Title',
              summary: 'Updated summary',
              description: 'Updated description',
              event_type: 'PHONE_BANK',
              browser_url: 'https://mobilize.us/test/event/test-update-123',
              is_virtual: true,
              timezone: 'America/New_York',
              location: {
                address_lines: ['Updated Address'],
                locality: 'Updated City',
                region: 'CA'
              },
              timeslots: [
                {
                  id: 3,
                  start_date: Math.floor(Date.now() / 1000) + 86400,
                  end_date: Math.floor(Date.now() / 1000) + 90000,
                  is_full: false,
                  instructions: null
                }
              ],
              sponsor: {
                id: 93,
                name: 'Test Organization',
                org_type: 'CAMPAIGN',
                event_feed_url: 'https://api.mobilize.us/v1/organizations/93/events',
                created_date: 1234567890,
                modified_date: 1234567890,
                slug: 'test-org',
                is_coordinated: true,
                is_independent: false,
                is_nonelectoral: false,
                is_primary_campaign: false,
                race_type: null,
                state: '',
                district: '',
                candidate_name: ''
              },
              tags: [],
              created_date: 1234567890,
              modified_date: 1234567890
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockMobilizeResponse);

      const result = await syncMobilizeEvents([93]);

      expect(result.synced).toBe(1);

      // Verify the civic action was updated
      const updatedAction = await prisma.civicAction.findUnique({
        where: { id: existingAction.id }
      });

      expect(updatedAction?.title).toBe('Updated Title');
      expect(updatedAction?.description).toBe('Updated description');
      expect(updatedAction?.eventType).toBe('PHONE_BANK');
      expect(updatedAction?.location).toContain('Updated City');
    });

    it('should handle pagination', async () => {
      const mockFirstPage = {
        data: {
          count: 2,
          next: 'https://api.mobilize.us/v1/organizations/93/events?cursor=abc123',
          previous: null,
          data: [
            {
              id: 111111,
              title: 'Event 1',
              description: 'Description 1',
              browser_url: 'https://mobilize.us/test/event/111111',
              is_virtual: false,
              timezone: 'America/New_York',
              location: {
                address_lines: ['Address 1'],
                locality: 'City 1',
                region: 'MA'
              },
              timeslots: [
                {
                  id: 1,
                  start_date: Math.floor(Date.now() / 1000) + 86400,
                  end_date: Math.floor(Date.now() / 1000) + 90000,
                  is_full: false,
                  instructions: null
                }
              ],
              sponsor: {
                id: 93,
                name: 'Test Org',
                org_type: 'CAMPAIGN',
                event_feed_url: 'https://api.mobilize.us/v1/organizations/93/events',
                created_date: 1234567890,
                modified_date: 1234567890,
                slug: 'test-org',
                is_coordinated: true,
                is_independent: false,
                is_nonelectoral: false,
                is_primary_campaign: false,
                race_type: null,
                state: '',
                district: '',
                candidate_name: ''
              },
              tags: [],
              created_date: 1234567890,
              modified_date: 1234567890
            }
          ]
        }
      };

      const mockSecondPage = {
        data: {
          count: 2,
          next: null,
          previous: 'https://api.mobilize.us/v1/organizations/93/events',
          data: [
            {
              id: 222222,
              title: 'Event 2',
              description: 'Description 2',
              browser_url: 'https://mobilize.us/test/event/222222',
              is_virtual: false,
              timezone: 'America/New_York',
              location: {
                address_lines: ['Address 2'],
                locality: 'City 2',
                region: 'MA'
              },
              timeslots: [
                {
                  id: 2,
                  start_date: Math.floor(Date.now() / 1000) + 86400,
                  end_date: Math.floor(Date.now() / 1000) + 90000,
                  is_full: false,
                  instructions: null
                }
              ],
              sponsor: {
                id: 93,
                name: 'Test Org',
                org_type: 'CAMPAIGN',
                event_feed_url: 'https://api.mobilize.us/v1/organizations/93/events',
                created_date: 1234567890,
                modified_date: 1234567890,
                slug: 'test-org',
                is_coordinated: true,
                is_independent: false,
                is_nonelectoral: false,
                is_primary_campaign: false,
                race_type: null,
                state: '',
                district: '',
                candidate_name: ''
              },
              tags: [],
              created_date: 1234567890,
              modified_date: 1234567890
            }
          ]
        }
      };

      mockedAxios.get
        .mockResolvedValueOnce(mockFirstPage)
        .mockResolvedValueOnce(mockSecondPage);

      const result = await syncMobilizeEvents([93]);

      expect(result.synced).toBe(2);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API Error'));

      const result = await syncMobilizeEvents([93]);

      expect(result.synced).toBe(0);
      expect(result.errors).toBe(0); // Errors at page level don't increment error count
    });

    it('should update last sync timestamp', async () => {
      const mockMobilizeResponse = {
        data: {
          count: 0,
          next: null,
          previous: null,
          data: []
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockMobilizeResponse);

      const beforeSync = Math.floor(Date.now() / 1000);
      await syncMobilizeEvents([93]);
      const afterSync = Math.floor(Date.now() / 1000);

      const lastSync = await prisma.settings.findUnique({
        where: { key: 'mobilize_last_sync' }
      });

      expect(lastSync).not.toBeNull();
      const syncTimestamp = parseInt(lastSync?.value || '0');
      expect(syncTimestamp).toBeGreaterThanOrEqual(beforeSync);
      expect(syncTimestamp).toBeLessThanOrEqual(afterSync);
    });
  });
});
