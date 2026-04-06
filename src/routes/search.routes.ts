import { Router } from 'express';
import {
  submitSearch,
  exportSearch,
  getSessionStats,
  resetSession,
  listBusinesses,
  exportAllBusinesses,
  getExistingPlaceIds,
  filterNewBusinesses,
} from '../controllers/search.controller';

const router = Router();

// Core scraping endpoint — Chrome extension POSTs here
router.post('/search', submitSearch);

// Export a particular search as a CSV download
router.get('/search/:searchId/export', exportSearch);

// Per-session deduplication stats
router.get('/session/:sessionId/stats', getSessionStats);

// Clear session seen-history so next scrape returns fresh results
router.post('/session/:sessionId/reset', resetSession);

// Global cross-search dedup: returns which placeIds from a batch are NOT in the DB yet
// Must be before /businesses to avoid Express treating "filter-new" as a dynamic segment
router.post('/businesses/filter-new', filterNewBusinesses);

// Returns placeIds already saved for a specific search identifier
router.get('/businesses/existing', getExistingPlaceIds);

// Browse / search all stored businesses
router.get('/businesses', listBusinesses);

// Export all businesses
router.get('/businesses/export', exportAllBusinesses);

export default router;
