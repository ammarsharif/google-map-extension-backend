import { Session } from '../models/Session.model';

// Simple djb2 hash of name+address (no crypto dependency)
export function makeHash(name: string, address: string): string {
  const str = (name + address)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');

  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

export interface RawBusiness {
  placeId?: string;
  name: string;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  mapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DeduplicationResult {
  unique: RawBusiness[];
  excluded: number;
  session: any;
}

// Get or create a session document
export async function getOrCreateSession(sessionId: string) {
  let session = await Session.findOne({ sessionId });
  if (!session) {
    session = await Session.create({ sessionId });
  }
  return session;
}

/**
 * Deduplicates businesses within the same batch ONLY.
 * We no longer exclude results that were seen in previous searches —
 * that caused the "10 excluded / 0 results" problem when re-scraping the same area.
 *
 * Cross-session/cross-search dedup is still done at the DB level via
 * findOneAndUpdate({ upsert: true }) which will just update the existing record.
 */
export async function deduplicateBusinesses(
  sessionId: string,
  businesses: RawBusiness[]
): Promise<DeduplicationResult> {
  const session = await getOrCreateSession(sessionId);

  // Only dedupe within THIS batch (prevent duplicates in one request)
  const batchIds = new Set<string>();
  const batchHashes = new Set<string>();

  const unique: RawBusiness[] = [];
  let excluded = 0;

  for (const biz of businesses) {
    const hash = makeHash(biz.name || '', biz.address || '');
    const effectivePlaceId = biz.placeId || `hash_${hash}`;

    // Only skip if we've already seen this in the CURRENT batch
    if (batchIds.has(effectivePlaceId) || batchHashes.has(hash)) {
      excluded++;
      continue;
    }

    batchIds.add(effectivePlaceId);
    batchHashes.add(hash);
    unique.push({ ...biz, placeId: effectivePlaceId });
  }

  return { unique, excluded, session };
}

// Persist seen IDs & hashes to the session after successful DB storage
export async function markAsSeen(
  sessionId: string,
  businesses: RawBusiness[]
): Promise<void> {
  const placeIds = businesses
    .map((b) => b.placeId)
    .filter(Boolean) as string[];
  const hashes = businesses.map((b) =>
    makeHash(b.name || '', b.address || '')
  );

  await Session.findOneAndUpdate(
    { sessionId },
    {
      $addToSet: {
        seenPlaceIds: { $each: placeIds },
        seenNameAddressHashes: { $each: hashes },
      },
      $inc: {
        totalSearches: 1,
        totalResultsCollected: businesses.length,
      },
    },
    { upsert: true }
  );
}

// Reset a session's seen history (so fresh scrapes return all results)
export async function resetSessionHistory(sessionId: string): Promise<void> {
  await Session.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        seenPlaceIds: [],
        seenNameAddressHashes: [],
      },
    },
    { upsert: true }
  );
}
