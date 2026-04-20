import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import type { Spec } from "@json-render/react";
import {
  deepCloneJson,
  prepareCanonicalShareSpec,
} from "@/lib/render/share-spec";

export interface DashboardShare {
  id: string;
  title: string;
  spec: Spec;
  createdAt: string;
  meta?: {
    sourceMessageId?: string;
    summaryText?: string;
  };
}

const SHARE_TTL_SECONDS =
  Number(process.env.SHARE_TTL_SECONDS) || 60 * 60 * 24 * 30;
const REDIS_PREFIX = "share:dashboard:";

let redisClient: Redis | null = null;

function getRedis() {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing KV_REST_API_URL or KV_REST_API_TOKEN environment variables.",
    );
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function redisKey(shareId: string) {
  return `${REDIS_PREFIX}${shareId}`;
}

function normalizeTitle(value?: string | null) {
  const title = value?.trim();
  if (!title) return "Shared dashboard";
  return title.slice(0, 120);
}

function cloneShare(share: DashboardShare): DashboardShare {
  return {
    ...share,
    spec: deepCloneJson(share.spec),
    meta: share.meta ? { ...share.meta } : undefined,
  };
}

export async function createDashboardShare(input: {
  title?: string | null;
  spec: Spec;
  meta?: DashboardShare["meta"];
}) {
  const share: DashboardShare = {
    id: randomUUID(),
    title: normalizeTitle(input.title),
    spec: prepareCanonicalShareSpec(input.spec),
    createdAt: new Date().toISOString(),
    meta: input.meta ? { ...input.meta } : undefined,
  };

  const redis = getRedis();
  await redis.set(redisKey(share.id), share, { ex: SHARE_TTL_SECONDS });
  return cloneShare(share);
}

export async function getDashboardShare(shareId: string) {
  const redis = getRedis();
  const share = await redis.get<DashboardShare>(redisKey(shareId));
  return share ? cloneShare(share) : null;
}

export async function updateDashboardShare(input: {
  shareId: string;
  spec: Spec;
  title?: string | null;
}) {
  const current = await getDashboardShare(input.shareId);
  if (!current) {
    return null;
  }

  const nextShare: DashboardShare = {
    ...current,
    ...(input.title !== undefined
      ? { title: normalizeTitle(input.title) }
      : {}),
    spec: prepareCanonicalShareSpec(input.spec),
  };

  const redis = getRedis();
  await redis.set(redisKey(input.shareId), nextShare, {
    ex: SHARE_TTL_SECONDS,
  });
  return cloneShare(nextShare);
}
