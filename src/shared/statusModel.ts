export const CANONICAL_STATUSES = [
  'queued',
  'in_progress',
  'blocked',
  'failed',
  'done',
  'canceled'
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<CanonicalStatus, CanonicalStatus[]> = {
  queued: ['in_progress', 'blocked', 'canceled'],
  in_progress: ['blocked', 'failed', 'done', 'canceled'],
  blocked: ['in_progress', 'canceled', 'failed'],
  failed: ['queued', 'in_progress', 'canceled'],
  done: [],
  canceled: []
};
