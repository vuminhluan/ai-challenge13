import { createServer, defaultConfig } from './server.js';

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const port = num('PORT', 4000);
const config = defaultConfig({
  tokenTtlSeconds: num('TOKEN_TTL_SECONDS', 3600),
  failureRate: num('FAILURE_RATE', 0.1),
  minDelayMs: num('MIN_DELAY_MS', 200),
  maxDelayMs: num('MAX_DELAY_MS', 500),
  lifecycle: {
    reviewMs: num('LIFECYCLE_REVIEW_MS', 5000),
    decisionMs: num('LIFECYCLE_DECISION_MS', 10_000),
    rejectAboveAmount: num('LIFECYCLE_REJECT_ABOVE', 100_000),
  },
});

createServer(config).listen(port, () => {
  console.log(`Mock insurance API đang chạy tại http://localhost:${port}`);
  console.log(`FAILURE_RATE=${config.failureRate} delay=${config.minDelayMs}-${config.maxDelayMs}ms`);
});
