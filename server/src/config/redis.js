import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config();

let redisClient;
let isFallback = false;

// Check if Upstash Redis credentials are provided
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('[Redis] Connected to Upstash Redis');
  } catch (err) {
    console.warn('[Redis] Failed to initialize Upstash client, falling back to in-memory store', err.message);
    isFallback = true;
  }
} else {
  isFallback = true;
}

if (isFallback) {
  console.log('[Redis] No Upstash Redis credentials found. Using local in-memory Redis fallback cache.');
  
  // High-fidelity in-memory cache mimicking Upstash Redis REST interface
  const store = new Map();
  const timeouts = new Map();

  redisClient = {
    async get(key) {
      if (!store.has(key)) return null;
      const data = store.get(key);
      try {
        return typeof data === 'string' ? JSON.parse(data) : data;
      } catch {
        return data;
      }
    },
    async set(key, value, options = {}) {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
      store.set(key, serialized);
      
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key));
        timeouts.delete(key);
      }

      if (options.ex) {
        const timer = setTimeout(() => {
          store.delete(key);
          timeouts.delete(key);
        }, options.ex * 1000);
        timeouts.set(key, timer);
      }
      return 'OK';
    },
    async del(key) {
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key));
        timeouts.delete(key);
      }
      return store.delete(key) ? 1 : 0;
    },
    async flushall() {
      for (const timer of timeouts.values()) clearTimeout(timer);
      timeouts.clear();
      store.clear();
      return 'OK';
    },
    isFallbackMode: true,
  };
}

export const getCache = async (key) => {
  try {
    return await redisClient.get(key);
  } catch (err) {
    console.error(`[Redis] Error getting key ${key}:`, err.message);
    return null;
  }
};

export const setCache = async (key, value, ttlSeconds = 300) => {
  try {
    return await redisClient.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    console.error(`[Redis] Error setting key ${key}:`, err.message);
    return null;
  }
};

export const deleteCache = async (key) => {
  try {
    return await redisClient.del(key);
  } catch (err) {
    console.error(`[Redis] Error deleting key ${key}:`, err.message);
    return null;
  }
};

export default {
  client: redisClient,
  getCache,
  setCache,
  deleteCache,
  isFallback: () => isFallback,
};
