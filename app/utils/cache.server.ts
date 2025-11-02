import NodeCache from "node-cache";

export const appCache = new NodeCache({
  stdTTL: 60 * 120, // 2 hour default TTL
  checkperiod: 3600, // Clean up expired keys every hour
});