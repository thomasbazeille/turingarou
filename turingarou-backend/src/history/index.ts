/**
 * Game history: read-only access to finished games, pseudonymized export, deterministic analysis and the
 * learned briefing for AI prompts. Scripts: export-history.ts, analyze-history.ts, test-history.ts.
 */

export * from './types.js';
export { withReadOnly, createReadOnlyPool, getHistoryPool, BEGIN_READ_ONLY, type SqlClient, type SqlPool } from './readonly.js';
export { streamGames, loadGames, loadGameById, readGameRows, readStrategy, type GameQuery } from './reader.js';
export { makePseudonymizer, pseudonymizeGame, resolveSalt, type Pseudonymizer } from './pseudonymize.js';
export { parseTelemetry, applyProviders } from './telemetry.js';
export { registerHistoryRoutes, tokenMatches } from './routes.js';
export { selectHumanPersona, type HumanPersona, type PersonaQuery } from './persona.js';
export { analyzeCorpus, parseCorpus, type HistoryAnalysis, type Section } from './analysis.js';
export { renderReport } from './report.js';
export { getLearnedBriefing, renderBriefing, parseBriefingHeader, LEARNED_DIR } from './briefing.js';
