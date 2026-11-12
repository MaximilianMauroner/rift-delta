import { createPublicRankingManifestLoader } from './manifestLoader'

export const RANKING_MANIFEST_URL = import.meta.env.VITE_RANKING_DATA_URL || '/data/ranking-summary.json'

/** One manifest request for the whole app. Every route that reads public data starts from it. */
export const loadRankingManifest = createPublicRankingManifestLoader(RANKING_MANIFEST_URL)
