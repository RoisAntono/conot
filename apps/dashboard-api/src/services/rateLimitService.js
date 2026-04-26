"use strict";

class RateLimitService {
  constructor() {
    this.buckets = new Map();
  }

  check(key, windowMs, maxRequests) {
    const now = Date.now();
    const bucket = this.buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);

    return {
      allowed: bucket.count <= maxRequests,
      remaining: Math.max(0, maxRequests - bucket.count),
      resetAt: bucket.resetAt
    };
  }
}

module.exports = {
  RateLimitService
};
