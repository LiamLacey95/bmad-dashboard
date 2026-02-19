import {
  ALLOWED_TRANSITIONS,
  CANONICAL_STATUSES,
  type CanonicalStatus
} from '../../shared/statusModel.js';
import type { StatusModelRepository } from './interfaces.js';

export class InMemoryStatusModelRepository implements StatusModelRepository {
  async getStatusModel(): Promise<{
    statuses: CanonicalStatus[];
    allowedTransitions: Record<CanonicalStatus, CanonicalStatus[]>;
  }> {
    return {
      statuses: [...CANONICAL_STATUSES],
      allowedTransitions: ALLOWED_TRANSITIONS
    };
  }
}
