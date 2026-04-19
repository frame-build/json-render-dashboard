import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface DashboardShare {
  id: string;
  title: string;
  spec: unknown;
  createdAt: string;
  meta?: {
    sourceMessageId?: string;
    summaryText?: string;
  };
}

const SHARE_TTL_SECONDS = Number(process.env.SHARE_TTL_SECONDS) || 60 * 60 * 24 * 30;
const REDIS_PREFIX = "share:dashboard:";
const FILE_FALLBACK_DIR = path.join(process.cwd(), ".cache", "shares");

let redisClient: Redis | null | undefined;
const inMemoryShares = new Map<string, DashboardShare>();

function getRedis() {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    redisClient = null;
    return redisClient;
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

function isValidShareId(shareId: string) {
  return /^[a-zA-Z0-9-]{8,80}$/.test(shareId);
}

function isExpired(share: DashboardShare) {
  const created = Date.parse(share.createdAt);
  if (Number.isNaN(created)) return true;
  return Date.now() > created + SHARE_TTL_SECONDS * 1000;
}

async function writeShareToFile(share: DashboardShare) {
  await mkdir(FILE_FALLBACK_DIR, { recursive: true });
  const filePath = path.join(FILE_FALLBACK_DIR, `${share.id}.json`);
  await writeFile(filePath, JSON.stringify(share), "utf8");
}

async function readShareFromFile(shareId: string) {
  if (!isValidShareId(shareId)) return null;

  try {
    const filePath = path.join(FILE_FALLBACK_DIR, `${shareId}.json`);
    const payload = await readFile(filePath, "utf8");
    const share = JSON.parse(payload) as DashboardShare;

    if (isExpired(share)) {
      await unlink(filePath).catch(() => undefined);
      return null;
    }

    return share;
  } catch {
    return null;
  }
}

export async function createDashboardShare(input: {
  title?: string | null;
  spec: unknown;
  meta?: DashboardShare["meta"];
}) {
  const share: DashboardShare = {
    id: randomUUID(),
    title: normalizeTitle(input.title),
    spec: input.spec,
    createdAt: new Date().toISOString(),
    meta: input.meta,
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(redisKey(share.id), share, { ex: SHARE_TTL_SECONDS });
    return share;
  }

  inMemoryShares.set(share.id, share);
  await writeShareToFile(share);
  return share;
}

export async function getDashboardShare(shareId: string) {
  const redis = getRedis();

  if (redis) {
    const share = await redis.get<DashboardShare>(redisKey(shareId));
    return share ?? null;
  }

  const fromMemory = inMemoryShares.get(shareId);
  if (fromMemory && !isExpired(fromMemory)) {
    return fromMemory;
  }

  const fromFile = await readShareFromFile(shareId);
  if (fromFile) {
    inMemoryShares.set(shareId, fromFile);
  }

  return fromFile;
}

export async function updateDashboardShare(input: {
  shareId: string;
  spec: unknown;
  title?: string | null;
}) {
  const current = await getDashboardShare(input.shareId);
  if (!current) {
    return null;
  }

  const nextShare: DashboardShare = {
    ...current,
    ...(input.title !== undefined ? { title: normalizeTitle(input.title) } : {}),
    spec: input.spec,
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(redisKey(input.shareId), nextShare, { ex: SHARE_TTL_SECONDS });
    return nextShare;
  }

  inMemoryShares.set(input.shareId, nextShare);
  await writeShareToFile(nextShare);
  return nextShare;
}
