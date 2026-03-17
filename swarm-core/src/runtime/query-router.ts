import { ModelShardManager, ShardAssignment, ShardRunTicket } from './model-shard-manager';
import { QoSManager } from './qos';

export interface QueryRouteRequest {
  tenantId: string;
  modelId: string;
}

export class QueryBackpressureError extends Error {
  statusCode: number;
  code: string;
  retryAfterSec: number;

  constructor(message: string, code: string, retryAfterSec: number = 1) {
    super(message);
    this.name = 'QueryBackpressureError';
    this.statusCode = 429;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface QueryExecutionTicket extends ShardRunTicket {
  assignment: ShardAssignment;
}

/**
 * Query router: shard selection + admission control + execution handoff.
 */
export class QueryRouter {
  private manager: ModelShardManager;
  private qos: QoSManager;

  constructor(manager: ModelShardManager, qos: QoSManager) {
    this.manager = manager;
    this.qos = qos;
  }

  async execute<T>(
    request: QueryRouteRequest,
    handler: (ticket: QueryExecutionTicket) => Promise<T>,
  ): Promise<T> {
    const assignment = await this.manager.assignShard(request.modelId, request.tenantId);

    const admission = this.qos.canAdmit({
      tenantId: request.tenantId,
      shardQueueDepth: assignment.queueDepth,
      globalQueueDepth: this.manager.getTotalQueueDepth(),
    });

    if (!admission.ok) {
      throw new QueryBackpressureError(
        `Query queue is saturated (${admission.reason}). Retry shortly.`,
        admission.reason || 'backpressure',
        admission.retryAfterSec || 1,
      );
    }

    this.qos.markQueued(request.tenantId);

    let dequeued = false;

    try {
      return await this.manager.runOnAssignedShard(assignment, async (ticket) => {
        this.qos.markDequeued(request.tenantId);
        dequeued = true;
        const distributedToken = await this.qos.acquireFairShareToken(request.tenantId);
        if (!distributedToken.ok) {
          throw new QueryBackpressureError(
            `Tenant fair-share limit reached (${distributedToken.reason}). Retry shortly.`,
            distributedToken.reason || 'tenant_distributed_fair_share_limit',
            distributedToken.retryAfterSec || 1,
          );
        }
        try {
          return await handler({ ...ticket, assignment });
        } finally {
          this.qos.markCompleted(request.tenantId);
          await this.qos.releaseFairShareToken(request.tenantId);
        }
      });
    } catch (err) {
      if (!dequeued) {
        this.qos.markRejectedQueue(request.tenantId);
      }
      throw err;
    }
  }
}
