import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Business } from '../models/Business.model';
import { SearchRecord } from '../models/SearchRecord.model';
import { Session } from '../models/Session.model';
import {
  deduplicateBusinesses,
  markAsSeen,
  makeHash,
  resetSessionHistory,
  RawBusiness,
} from '../services/dedup.service';
import { generateCSV } from '../services/export.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function sanitizeString(val: any): string | null {
  if (!val || typeof val !== 'string') return null;
  return val.trim().substring(0, 500) || null;
}

function sanitizeUrl(val: any): string | null {
  if (!val || typeof val !== 'string') return null;
  try {
    const url = new URL(val.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString().substring(0, 1000);
  } catch {
    return null;
  }
}

function formatDateForFile(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── POST /api/search ───────────────────────────────────────────────────────
// Receives scraped business data from the Chrome extension.
// Deduplicates within batch, upserts to DB, returns all results including
// previously-seen ones (so re-scraping the same area always shows data).
export async function submitSearch(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      businesses,
      placeName,
      location,
      sessionId,
      searchIdentifier,
      scrapeMode = 'full',
    } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!sessionId || typeof sessionId !== 'string') {
      return res
        .status(400)
        .json({ success: false, error: 'sessionId is required' });
    }
    if (!placeName || !location) {
      return res.status(400).json({
        success: false,
        error: 'placeName and location are required',
      });
    }
    if (!Array.isArray(businesses) || businesses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'businesses array is required and must not be empty',
      });
    }
    if (businesses.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 businesses per request',
      });
    }

    // ── Sanitize incoming data ──────────────────────────────────────────────
    const rawBusinesses: RawBusiness[] = businesses
      .map((b: any) => ({
        placeId: sanitizeString(b.placeId) ?? undefined,
        name: sanitizeString(b.name) || 'Unknown',
        rating: parseFloat(b.rating) || null,
        reviewCount: parseInt(b.reviewCount) || null,
        category: sanitizeString(b.category),
        address: sanitizeString(b.address),
        phone: sanitizeString(b.phone),
        website: sanitizeUrl(b.website),
        mapsUrl: sanitizeUrl(b.mapsUrl),
        latitude: parseFloat(b.latitude) || null,
        longitude: parseFloat(b.longitude) || null,
      }))
      .filter((b: RawBusiness) => b.name && b.name !== 'Unknown');

    // ── Deduplicate within batch only ───────────────────────────────────────
    // This only removes duplicates in the current request (same business
    // appearing twice in one scrape). It does NOT exclude businesses that
    // were seen in previous searches — they will be upserted and returned.
    const { unique, excluded } = await deduplicateBusinesses(
      sessionId,
      rawBusinesses
    );

    // ── Upsert businesses to DB ─────────────────────────────────────────────
    // Using upsert so re-scraping enriches existing records with phone/website.
    const savedBusinesses = [];
    for (const biz of unique) {
      const hash = makeHash(biz.name || '', biz.address || '');

      // Build update — only overwrite phone/website/address if the new value is non-null
      // (so a fast-mode scrape without phone doesn't wipe a full-mode phone)
      const setFields: Record<string, any> = {
        nameAddressHash: hash,
        name: biz.name,
        rating: biz.rating ?? null,
        reviewCount: biz.reviewCount ?? null,
        category: biz.category ?? null,
        searchIdentifier: searchIdentifier || null,
        scrapedAt: new Date(),
      };

      if (biz.address) setFields.address = biz.address;
      if (biz.phone) setFields.phone = biz.phone;
      if (biz.website) setFields.website = biz.website;
      if (biz.mapsUrl) setFields.mapsUrl = biz.mapsUrl;
      if (biz.latitude) setFields.latitude = biz.latitude;
      if (biz.longitude) setFields.longitude = biz.longitude;

      try {
        const saved = await Business.findOneAndUpdate(
          { placeId: biz.placeId },
          {
            $set: setFields,
            $inc: { seenCount: 1 }
          },
          { upsert: true, new: true }
        );
        if (saved) savedBusinesses.push(saved);
      } catch (err) {
        console.warn(`Skipping business "${biz.name}": ${err}`);
      }
    }

    // ── Create search record ────────────────────────────────────────────────
    const searchId = uuidv4();
    await SearchRecord.create({
      searchId,
      sessionId,
      placeName,
      location,
      searchIdentifier: searchIdentifier || null,
      requestedCount: businesses.length,
      returnedCount: savedBusinesses.length,
      excludedCount: excluded,
      scrapeMode,
      businessIds: savedBusinesses.map((b) => b._id),
    });

    // ── Persist seen IDs (for stats tracking only, not blocking) ────────────
    await markAsSeen(sessionId, unique);

    // ── Response ────────────────────────────────────────────────────────────
    const responseData = savedBusinesses.map((b) => ({
      id: b._id.toString(),
      placeId: b.placeId,
      name: b.name,
      rating: b.rating,
      reviewCount: b.reviewCount,
      category: b.category,
      address: b.address,
      phone: b.phone,
      website: b.website,
      mapsUrl: b.mapsUrl,
      latitude: b.latitude,
      longitude: b.longitude,
      searchIdentifier: b.searchIdentifier,
    }));

    return res.json({
      success: true,
      searchId,
      results: responseData,
      totalFound: savedBusinesses.length,
      excluded,
      message: `Found ${savedBusinesses.length} result${savedBusinesses.length !== 1 ? 's' : ''}${
        excluded > 0 ? ` (${excluded} duplicates skipped in this batch)` : ''
      }`,
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/session/:sessionId/reset ─────────────────────────────────────
// Clears the session's seen-history so all businesses appear fresh next search.
export async function resetSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { sessionId } = req.params;
    await resetSessionHistory(sessionId);
    return res.json({ success: true, message: 'Session history cleared' });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/search/:searchId/export ──────────────────────────────────────
export async function exportSearch(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { searchId } = req.params;
    const { ids } = req.query;

    const record = await SearchRecord.findOne({ searchId }).populate(
      'businessIds'
    );
    if (!record) {
      return res
        .status(404)
        .json({ success: false, error: 'Search record not found' });
    }

    let businesses = record.businessIds as any[];

    if (ids && typeof ids === 'string') {
      const selectedIds = ids.split(',').map((s) => s.trim());
      businesses = businesses.filter((b) =>
        selectedIds.includes(b._id.toString())
      );
    }

    const csv = generateCSV(businesses);
    const filename = `${record.placeName}-${record.location}-${formatDateForFile()}.csv`.replace(
      /[^a-z0-9\-_.]/gi,
      '_'
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    return res.send(csv);
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/session/:sessionId/stats ─────────────────────────────────────
export async function getSessionStats(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId });

    if (!session) {
      return res.json({
        success: true,
        stats: {
          sessionId,
          totalSearches: 0,
          totalSeen: 0,
          exists: false,
        },
      });
    }

    const recentSearches = await SearchRecord.find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('placeName location returnedCount createdAt');

    return res.json({
      success: true,
      stats: {
        sessionId,
        totalSearches: session.totalSearches,
        totalSeen: session.seenPlaceIds.length,
        totalResultsCollected: session.totalResultsCollected,
        createdAt: session.createdAt,
        recentSearches,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/businesses/existing ───────────────────────────────────────────
// Returns placeIds already in the DB for a given searchIdentifier.
// Called by the extension BEFORE scraping so it can skip known results.
export async function getExistingPlaceIds(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { searchIdentifier } = req.query;
    if (!searchIdentifier || typeof searchIdentifier !== 'string') {
      return res.json({ success: true, placeIds: [] });
    }

    const businesses = await Business.find(
      { searchIdentifier },
      { placeId: 1, _id: 0 }
    ).lean();

    const placeIds = businesses.map((b) => b.placeId).filter(Boolean);

    return res.json({ success: true, placeIds, count: placeIds.length });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/businesses/filter-new ────────────────────────────────────────
// Accepts a list of placeIds scraped from the sidebar.
// Returns which ones are NOT yet in the DB (globally, across all searches).
// This is the cross-search dedup check: hotels found via "hotel pakistan" will
// be excluded when the user re-searches "hotel karachi".
export async function filterNewBusinesses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { placeIds } = req.body;
    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      return res.json({ success: true, newPlaceIds: [], existingPlaceIds: [] });
    }

    // Find which of the submitted placeIds already exist in the DB
    const existing = await Business.find(
      { placeId: { $in: placeIds } },
      { placeId: 1, _id: 0 }
    ).lean();

    const existingSet = new Set(existing.map((b) => b.placeId));
    const newPlaceIds = placeIds.filter((id) => !existingSet.has(id));
    const existingPlaceIds = placeIds.filter((id) => existingSet.has(id));

    return res.json({
      success: true,
      newPlaceIds,
      existingPlaceIds,
      newCount: newPlaceIds.length,
      existingCount: existingPlaceIds.length,
    });
  } catch (error) {
    next(error);
  }
}

// ─── GET /api/businesses ────────────────────────────────────────────────────

export async function listBusinesses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(
      parseInt(req.query.limit as string) || 50,
      100
    );
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;

    const filter: Record<string, any> = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (category) filter.category = { $regex: category, $options: 'i' };

    const [businesses, total] = await Promise.all([
      Business.find(filter)
        .sort({ scrapedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Business.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      businesses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function exportAllBusinesses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const businesses = await Business.find().sort({ scrapedAt: -1 });
    const csv = generateCSV(businesses);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="all-leads.csv"');
    return res.send(csv);
  } catch (error) {
    next(error);
  }
}
