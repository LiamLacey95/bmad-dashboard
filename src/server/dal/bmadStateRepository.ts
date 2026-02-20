import Database from 'better-sqlite3';
import type { CostAnalyticsRepository, DeliveryRepository, WorkflowRepository, WorkflowQuery, WorkflowSummary, WorkflowTransition, Story, ProjectHealth, KanbanBoard, CostSummary, AgentCost } from './interfaces.js';
import type { CanonicalStatus } from '../../shared/statusModel.js';

// Read-only repository that queries the actual BMAD state database
export class BMADStateRepository implements WorkflowRepository, DeliveryRepository, CostAnalyticsRepository {
  private db: Database.Database;

  constructor(bmadStatePath: string) {
    this.db = new Database(bmadStatePath, { readonly: true });
  }

  close(): void {
    this.db.close();
  }

  // WorkflowRepository implementation
  async getWorkflows(query: WorkflowQuery): Promise<{ items: WorkflowSummary[]; total: number }> {
    const stmt = this.db.prepare(`
      SELECT type as id, status, error_message, spawned_at as startedAt, completed_at as completedAt
      FROM agents 
      ORDER BY spawned_at DESC
    `);
    
    const rows = stmt.all();
    const items = rows.map((row: any) => ({
      id: row.id,
      name: this.formatAgentName(row.id),
      status: this.mapStatus(row.status) as CanonicalStatus,
      owner: 'BMAD Framework',
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      lastTransitionAt: row.completedAt || row.startedAt,
      criteriaSummary: { passed: row.status === 'completed' ? 5 : 0, total: 5 },
    }));
    
    return { items, total: items.length };
  }

  async getWorkflowById(id: string): Promise<WorkflowSummary | null> {
    const stmt = this.db.prepare(`
      SELECT type as id, status, error_message, spawned_at as startedAt, completed_at as completedAt
      FROM agents 
      WHERE type = ?
    `);
    
    const row = stmt.get(id);
    if (!row) return null;
    
    return {
      id: row.id,
      name: this.formatAgentName(row.id),
      status: this.mapStatus(row.status) as CanonicalStatus,
      owner: 'BMAD Framework',
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      lastTransitionAt: row.completedAt || row.startedAt,
      criteriaSummary: { passed: row.status === 'completed' ? 5 : 0, total: 5 },
    };
  }

  async getWorkflowTransitions(workflowId: string, limit: number): Promise<WorkflowTransition[]> {
    const stmt = this.db.prepare(`
      SELECT type, created_at, payload 
      FROM events 
      WHERE agent_type = ?
      ORDER BY created_at ASC
      LIMIT ?
    `);
    
    const rows = stmt.all(workflowId, limit);
    return rows.map((row: any, index: number) => ({
      id: `${workflowId}-t${index}`,
      fromStatus: index === 0 ? 'queued' : this.mapEventToStatus(rows[index - 1]?.type),
      toStatus: this.mapEventToStatus(row.type),
      actor: 'BMAD Agent',
      reason: row.payload || 'State transition',
      timestamp: row.created_at,
    }));
  }

  async applyWorkflowTransition(): Promise<void> {
    // Read-only - no transitions allowed
    throw new Error('BMADStateRepository is read-only');
  }

  // DeliveryRepository implementation  
  async listProjects(): Promise<ProjectHealth[]> {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
      FROM agents
    `);
    
    const stats = stmt.get();
    
    return [{
      projectId: 'bmad-dashboard',
      name: 'BMAD Dashboard',
      health: stats.failed > 0 ? 'at_risk' : stats.running > 0 ? 'in_progress' : 'healthy',
      blockedCount: stats.failed || 0,
      completedCount: stats.completed || 0,
      inProgressCount: stats.running || 0,
      lastSyncAt: new Date().toISOString(),
    }];
  }

  async getKanbanBoard(projectId: string): Promise<KanbanBoard> {
    const columns = [
      { id: 'queued', name: 'Queued', stories: [] as Story[] },
      { id: 'running', name: 'In Progress', stories: [] as Story[] },
      { id: 'completed', name: 'Completed', stories: [] as Story[] },
      { id: 'failed', name: 'Failed', stories: [] as Story[] },
    ];

    const stmt = this.db.prepare(`
      SELECT type, status, error_message, spawned_at
      FROM agents
      ORDER BY spawned_at DESC
    `);
    
    const rows = stmt.all();
    
    rows.forEach((row: any) => {
      const story: Story = {
        id: row.type,
        title: this.formatAgentName(row.type),
        status: row.status,
        assignee: 'BMAD Agent',
        labels: ['agent'],
        blocked: row.status === 'failed',
        lastTransitionAt: row.spawned_at,
      };
      
      const column = columns.find(c => c.id === row.status);
      if (column) {
        column.stories.push(story);
      } else {
        columns[0].stories.push(story);
      }
    });

    return {
      projectId,
      columns: columns.filter(c => c.stories.length > 0),
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  // CostAnalyticsRepository implementation
  async getCostSummary(): Promise<CostSummary> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as totalAgents
      FROM agents
    `);
    
    const { totalAgents } = stmt.get();
    
    return {
      totalCost: totalAgents * 0.15,
      currency: 'USD',
      agentCount: totalAgents,
      period: 'all-time',
    };
  }

  async listAgentCosts(): Promise<AgentCost[]> {
    const stmt = this.db.prepare(`
      SELECT type, COUNT(*) as runs, AVG(credits_consumed) as avgCredits
      FROM agents
      GROUP BY type
    `);
    
    const rows = stmt.all();
    return rows.map((row: any) => ({
      agentId: row.type,
      agentName: this.formatAgentName(row.type),
      totalCost: (row.avgCredits || 0.15) * row.runs,
      runs: row.runs,
      avgCostPerRun: row.avgCredits || 0.15,
    }));
  }

  private formatAgentName(type: string): string {
    return type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  private mapStatus(status: string): string {
    const map: Record<string, string> = {
      'completed': 'done',
      'failed': 'failed',
      'running': 'in_progress',
      'queued': 'queued',
    };
    return map[status] || status;
  }

  private mapEventToStatus(eventType: string): string {
    if (!eventType) return 'queued';
    if (eventType.includes('complete')) return 'done';
    if (eventType.includes('fail')) return 'failed';
    if (eventType.includes('start')) return 'in_progress';
    return 'queued';
  }
}
