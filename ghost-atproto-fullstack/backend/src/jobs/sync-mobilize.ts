import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

interface MobilizeLocation {
  venue?: string;
  address_lines: string[];
  locality?: string;
  region?: string;
  country?: string;
  postal_code?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  congressional_district?: string;
  state_leg_district?: string | null;
  state_senate_district?: string | null;
}

interface MobilizeTimeslot {
  start_date: number;
  end_date: number;
  instructions: string | null;
  id: number;
  is_full: boolean;
}

interface MobilizeSponsor {
  race_type: string | null;
  event_feed_url: string;
  created_date: number;
  modified_date: number;
  org_type: string;
  id: number;
  name: string;
  slug: string;
  is_coordinated: boolean;
  is_independent: boolean;
  is_nonelectoral: boolean;
  is_primary_campaign: boolean;
  state: string;
  district: string;
  candidate_name: string;
  logo_url?: string;
}

interface MobilizeTag {
  id: number;
  name: string;
}

interface MobilizeEvent {
  id: number;
  title: string;
  summary?: string;
  description: string;
  browser_url: string;
  event_type?: string;
  featured_image_url?: string;
  location: MobilizeLocation;
  timezone: string;
  timeslots: MobilizeTimeslot[];
  sponsor: MobilizeSponsor;
  tags: MobilizeTag[];
  is_virtual: boolean;
  created_date: number;
  modified_date: number;
}

interface MobilizeResponse {
  count: number;
  next: string | null;
  previous: string | null;
  data: MobilizeEvent[];
}

function buildLocationString(location: MobilizeLocation): string {
  const parts = [
    location.venue,
    location.address_lines[0],
    location.locality,
    location.region
  ].filter(p => p && p.trim());
  return parts.join(', ');
}

function getEarliestUpcomingTimeslot(timeslots: MobilizeTimeslot[]): Date | null {
  const now = Date.now() / 1000;
  const upcoming = timeslots
    .filter(t => t.start_date > now)
    .sort((a, b) => a.start_date - b.start_date);

  if (upcoming.length === 0) return null;

  // Convert Unix timestamp to JavaScript Date
  return new Date(upcoming[0].start_date * 1000);
}

export async function syncMobilizeEvents(
  organizationIds: number[] = [93],
  updatedSince?: number
): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  console.log('🔄 Starting Mobilize events sync...');

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Get or create system user for Mobilize events
  let systemUser = await prisma.user.findFirst({
    where: { email: 'system@mobilize.sync' }
  });

  if (!systemUser) {
    console.log('Creating system user for Mobilize sync...');
    systemUser = await prisma.user.create({
      data: {
        email: 'system@mobilize.sync',
        name: 'Mobilize Sync',
        password: 'SYSTEM_USER_NO_LOGIN',
        role: 'ADMIN'
      }
    });
  }

  // Get last sync timestamp from settings if not provided
  if (!updatedSince) {
    const lastSync = await prisma.settings.findUnique({
      where: { key: 'mobilize_last_sync' }
    });

    if (lastSync) {
      updatedSince = parseInt(lastSync.value);
    } else {
      // Default to 24 hours ago
      updatedSince = Math.floor(Date.now() / 1000) - 86400;
    }
  }

  console.log(`📅 Fetching events updated since: ${new Date(updatedSince * 1000).toISOString()}`);

  for (const orgId of organizationIds) {
    console.log(`\n🏢 Syncing organization ${orgId}...`);

    let nextUrl: string | null = `https://api.mobilize.us/v1/organizations/${orgId}/events?updated_since=${updatedSince}`;
    let pageCount = 0;

    while (nextUrl) {
      pageCount++;
      console.log(`  📄 Fetching page ${pageCount}...`);

      try {
        const response: { data: MobilizeResponse } = await axios.get<MobilizeResponse>(nextUrl);
        const mobilizeData: MobilizeResponse = response.data;
        const { data, next, count }: { data: MobilizeEvent[]; next: string | null; count: number } = mobilizeData;

        console.log(`  📊 Page ${pageCount}: ${data.length} events (total: ${count})`);

        for (const event of data) {
          try {
            // Build location string
            const locationString = buildLocationString(event.location);

            // Get earliest upcoming timeslot
            const eventDate = getEarliestUpcomingTimeslot(event.timeslots);

            // Skip events with no upcoming timeslots
            if (!eventDate) {
              console.log(`  ⏭️  Skipping event ${event.id} - no upcoming timeslots`);
              totalSkipped++;
              continue;
            }

            // Prepare sourceMeta as plain JSON object
            const sourceMeta = JSON.parse(JSON.stringify({
              sponsor: event.sponsor,
              tags: event.tags,
              timezone: event.timezone,
              is_virtual: event.is_virtual,
              all_timeslots: event.timeslots,
              coordinates: event.location.location,
              summary: event.summary
            }));

            // Upsert civic action
            await prisma.civicAction.upsert({
              where: {
                source_externalId: {
                  source: 'mobilize',
                  externalId: String(event.id)
                }
              },
              update: {
                title: event.title,
                description: event.description,
                eventType: event.event_type || null,
                location: locationString || null,
                eventDate: eventDate,
                imageUrl: event.featured_image_url || null,
                externalUrl: event.browser_url,
                state: event.location.region || null,
                zipcode: event.location.postal_code || null,
                sourceMeta: sourceMeta,
                status: 'approved',
                updatedAt: new Date()
              },
              create: {
                title: event.title,
                description: event.description,
                eventType: event.event_type || null,
                location: locationString || null,
                eventDate: eventDate,
                imageUrl: event.featured_image_url || null,
                externalUrl: event.browser_url,
                externalId: String(event.id),
                source: 'mobilize',
                state: event.location.region || null,
                zipcode: event.location.postal_code || null,
                sourceMeta: sourceMeta,
                status: 'approved',
                userId: systemUser.id
              }
            });

            totalSynced++;
            console.log(`  ✅ Synced: ${event.title} (${event.id})`);

          } catch (error) {
            totalErrors++;
            console.error(`  ❌ Error syncing event ${event.id}:`, error);
          }
        }

        // Move to next page
        nextUrl = next;

        // Rate limiting - wait 1 second between pages
        if (nextUrl) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`  ❌ Error fetching page for org ${orgId}:`, error);
        break;
      }
    }
  }

  // Update last sync timestamp
  const currentTimestamp = Math.floor(Date.now() / 1000);
  await prisma.settings.upsert({
    where: { key: 'mobilize_last_sync' },
    update: { value: String(currentTimestamp) },
    create: { key: 'mobilize_last_sync', value: String(currentTimestamp) }
  });

  console.log(`\n✨ Sync complete!`);
  console.log(`   ✅ Synced: ${totalSynced}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log(`   ❌ Errors: ${totalErrors}`);

  return {
    synced: totalSynced,
    skipped: totalSkipped,
    errors: totalErrors
  };
}
