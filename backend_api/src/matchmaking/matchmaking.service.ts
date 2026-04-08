import { Injectable } from '@nestjs/common';

interface QueueEntry {
  userId: string;
  username: string;
  rankPoints: number;
  mode: '1v1' | '2v2' | '4v4';
  joinedAt: Date;
}

export interface MatchResult {
  matchId: string;
  mode: string;
  teams: { side: string; players: string[] }[];
}

@Injectable()
export class MatchmakingService {
  private queues: Map<string, QueueEntry[]> = new Map([
    ['1v1', []],
    ['2v2', []],
    ['4v4', []],
  ]);

  getQueueStatus(mode: string): { playersInQueue: number } {
    const queue = this.queues.get(mode) ?? [];
    return { playersInQueue: queue.length };
  }

  joinQueue(
    userId: string,
    username: string,
    rankPoints: number,
    mode: '1v1' | '2v2' | '4v4',
  ): { queued: boolean; match?: MatchResult } {
    const queue = this.queues.get(mode);
    if (!queue) {
      return { queued: false };
    }

    // Check if player is already in queue
    const existing = queue.findIndex((e) => e.userId === userId);
    if (existing !== -1) {
      return { queued: true };
    }

    queue.push({ userId, username, rankPoints, mode, joinedAt: new Date() });

    // Check if we have enough players to form a match
    const playersNeeded = this.getPlayersNeeded(mode);
    if (queue.length >= playersNeeded) {
      return { queued: false, match: this.formMatch(queue, mode, playersNeeded) };
    }

    return { queued: true };
  }

  leaveQueue(userId: string, mode: string): boolean {
    const queue = this.queues.get(mode);
    if (!queue) return false;

    const index = queue.findIndex((e) => e.userId === userId);
    if (index === -1) return false;

    queue.splice(index, 1);
    return true;
  }

  private getPlayersNeeded(mode: string): number {
    switch (mode) {
      case '1v1':
        return 2;
      case '2v2':
        return 4;
      case '4v4':
        return 8;
      default:
        return 2;
    }
  }

  private formMatch(
    queue: QueueEntry[],
    mode: string,
    playersNeeded: number,
  ): MatchResult {
    // Sort by rank for balanced matchmaking
    queue.sort((a, b) => a.rankPoints - b.rankPoints);

    const players = queue.splice(0, playersNeeded);
    const halfSize = playersNeeded / 2;

    // Alternate assignment for balanced teams
    const teamA: string[] = [];
    const teamB: string[] = [];
    players.forEach((p, i) => {
      if (i % 2 === 0) {
        teamA.push(p.userId);
      } else {
        teamB.push(p.userId);
      }
    });

    // Trim teams to exact half size
    const finalTeamA = teamA.slice(0, halfSize);
    const finalTeamB = teamB.slice(0, halfSize);

    return {
      matchId: `match-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      mode,
      teams: [
        { side: 'A', players: finalTeamA },
        { side: 'B', players: finalTeamB },
      ],
    };
  }
}
