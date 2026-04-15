/**
 * simulation/BalanceSimulator.ts — batch balance-testing simulator.
 *
 * Runs N battles silently (no per-event logging) and prints aggregate
 * statistics useful for tuning role stats, skill values, and passives.
 *
 * Usage:
 *   npx tsx src/simulation/BalanceSimulator.ts [N]
 *   npm run sim:balance -- 500
 *
 * Default N = 1000.
 */

import { Character }       from '../domain/Character'
import type { CharacterStats } from '../domain/Character'
import { Team }            from '../domain/Team'
import { Battle }          from '../domain/Battle'
import { CombatEngine }    from '../engine/CombatEngine'
import type { TargetSpec } from '../engine/CombatEngine'
import type { Skill }      from '../domain/Skill'
import { SkillRegistry }   from '../domain/SkillRegistry'
import { SKILL_CATALOG }   from '../data/skillCatalog'
import { DECK_ASSIGNMENTS } from '../data/deckAssignments'
import { PASSIVE_CATALOG }  from '../data/passiveCatalog'
import { GLOBAL_RULES }     from '../data/globalRules'
import { EventType }        from '../engine/types'
import type { EngineEvent } from '../engine/types'

// ─────────────────────────────────────────────────────────────────────────────
// ANSI helpers
// ─────────────────────────────────────────────────────────────────────────────

const A = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared setup (same as BattleSim)
// ─────────────────────────────────────────────────────────────────────────────

const registry = new SkillRegistry(SKILL_CATALOG)

const STATS: Record<string, CharacterStats> = {
  king:       { maxHp: 180, attack: 15, defense: 15, mobility: 3 },
  warrior:    { maxHp: 180, attack: 16, defense: 18, mobility: 2 },
  executor:   { maxHp: 120, attack: 18, defense: 8,  mobility: 3 },
  specialist: { maxHp: 130, attack: 20, defense: 10, mobility: 2 },
}

const ROLES = ['king', 'warrior', 'executor', 'specialist'] as const
type Role = typeof ROLES[number]

// ─────────────────────────────────────────────────────────────────────────────
// Simulation AI (identical to BattleSim)
// ─────────────────────────────────────────────────────────────────────────────

function pickTarget(char: Character, skill: Skill, battle: Battle): TargetSpec {
  switch (skill.targetType) {
    case 'single': {
      const enemies = battle.enemiesOf(char)
      if (enemies.length === 0) return { kind: 'self' }
      const preferred = skill.effectType === 'stun'
        ? (enemies.find((e) => e.role === 'warrior') ?? enemies.find((e) => e.role === 'king'))
        : enemies.find((e) => e.role === 'king')
      const target = preferred ?? enemies.reduce((low, e) => e.hp < low.hp ? e : low, enemies[0])
      return { kind: 'character', characterId: target.id }
    }
    case 'area': {
      const enemies = battle.enemiesOf(char)
      const focus   = enemies.find((e) => e.role === 'king') ?? enemies[0]
      return focus ? { kind: 'area', col: focus.col, row: focus.row } : { kind: 'self' }
    }
    case 'lowest_ally': return { kind: 'lowest_ally' }
    case 'all_allies':  return { kind: 'all_allies' }
    case 'self':        return { kind: 'self' }
  }
}

function runActorTurn(actor: Character, battle: Battle, engine: CombatEngine): boolean {
  if (!actor.alive || actor.isStunned) {
    engine.skipCurrentTurn(actor.isStunned ? 'stunned' : 'dead')
    return false
  }

  const atkDeck = battle.teamOf(actor.side).attackDeck(actor.id)
  const defDeck = battle.teamOf(actor.side).defenseDeck(actor.id)
  if (!atkDeck || !defDeck) { engine.skipCurrentTurn('no_selection'); return false }

  const atkSkill = atkDeck.hand[0]
  const defSkill = defDeck.hand[0]
  if (!atkSkill || !defSkill) { engine.skipCurrentTurn('no_selection'); return false }

  const target = pickTarget(actor, atkSkill, battle)
  engine.selectAttack(actor.id, atkSkill, target)
  engine.selectDefense(actor.id, defSkill)
  engine.commitCurrentTurn()
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate stat accumulators
// ─────────────────────────────────────────────────────────────────────────────

interface RoleStat {
  totalDamageDealt:    number
  totalDamageReceived: number
  totalHealsGiven:     number
  totalKills:          number
  totalDeaths:         number
  gamesPlayed:         number   // always 2 * N  (one per side)
}

function emptyRoleStat(): RoleStat {
  return {
    totalDamageDealt: 0, totalDamageReceived: 0,
    totalHealsGiven: 0, totalKills: 0, totalDeaths: 0, gamesPlayed: 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run one silent battle, return structured result
// ─────────────────────────────────────────────────────────────────────────────

interface BattleResult {
  winner: 'left' | 'right' | 'draw'
  rounds: number
  /** Per-character stats keyed by character id */
  charStats: Map<string, { role: Role; side: 'left' | 'right'; damageDealt: number; damageReceived: number; healsGiven: number; kills: number; alive: boolean }>
  /** Skill usage counts keyed by skill id */
  skillUses: Map<string, number>
}

function runOneBattle(): BattleResult {
  // Build characters
  const leftKing       = new Character('lking',       'Leo',   'king',       'left',  3, 2, STATS.king)
  const leftWarrior    = new Character('lwarrior',    'Wren',  'warrior',    'left',  3, 1, STATS.warrior)
  const leftExecutor   = new Character('lexecutor',   'Edge',  'executor',   'left',  2, 2, STATS.executor)
  const leftSpecialist = new Character('lspecialist', 'Sage',  'specialist', 'left',  3, 3, STATS.specialist)

  const rightKing       = new Character('rking',       'Rex',   'king',       'right', 12, 2, STATS.king)
  const rightWarrior    = new Character('rwarrior',    'Reva',  'warrior',    'right', 12, 1, STATS.warrior)
  const rightExecutor   = new Character('rexecutor',   'Echo',  'executor',   'right', 13, 2, STATS.executor)
  const rightSpecialist = new Character('rspecialist', 'Sable', 'specialist', 'right', 12, 3, STATS.specialist)

  const d = (id: string) => {
    const a = DECK_ASSIGNMENTS[id]
    if (!a) throw new Error(`No deck assignment for character "${id}"`)
    return registry.buildDeckConfig([...a.attackIds], [...a.defenseIds])
  }

  const leftTeam = new Team('left', [leftKing, leftWarrior, leftExecutor, leftSpecialist], {
    king: d('lking'), warrior: d('lwarrior'), executor: d('lexecutor'), specialist: d('lspecialist'),
  })
  const rightTeam = new Team('right', [rightKing, rightWarrior, rightExecutor, rightSpecialist], {
    king: d('rking'), warrior: d('rwarrior'), executor: d('rexecutor'), specialist: d('rspecialist'),
  })

  const battle = new Battle({ leftTeam, rightTeam })
  const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG, GLOBAL_RULES)

  // Track skill usage via event listener
  const skillUses = new Map<string, number>()
  engine.on((event: EngineEvent) => {
    if (event.type === EventType.SKILL_USED) {
      const count = skillUses.get(event.skillId) ?? 0
      skillUses.set(event.skillId, count + 1)
    }
  })

  // Run
  const MAX_ROUNDS = 25
  battle.start()
  let lastRound = 0

  while (!battle.isOver && battle.round <= MAX_ROUNDS) {
    if (battle.phase === 'movement') { battle.advancePhase(); continue }

    const round = battle.round
    if (round !== lastRound) {
      engine.applyRoundStartRules()
      lastRound = round
    }

    // Interleaved action phase: both sides resolve in a single phase
    engine.beginActionPhase()
    while (!engine.isPhaseComplete && !battle.isOver) {
      const actor = engine.getCurrentActor()
      if (!actor) break
      runActorTurn(actor, battle, engine)
    }

    // Action phase ends → round boundary; advance then tick effects
    battle.advancePhase()
    if (!battle.isOver) {
      engine.tickStatusEffects()
    }
    if (battle.isOver) break
  }

  if (!battle.isOver) {
    engine.forfeit('left')
  }

  const victory = engine.getVictoryResult()

  // Collect per-character stats
  const allChars = [...leftTeam.all, ...rightTeam.all]
  const charStats = new Map<string, { role: Role; side: 'left' | 'right'; damageDealt: number; damageReceived: number; healsGiven: number; kills: number; alive: boolean }>()
  for (const c of allChars) {
    const s = engine.getStats(c.id)
    charStats.set(c.id, {
      role: c.role as Role,
      side: c.side as 'left' | 'right',
      damageDealt: s.damageDealt,
      damageReceived: s.damageReceived,
      healsGiven: s.healsGiven,
      kills: s.kills,
      alive: c.alive,
    })
  }

  let winner: 'left' | 'right' | 'draw'
  if (victory?.winner === 'left') winner = 'left'
  else if (victory?.winner === 'right') winner = 'right'
  else winner = 'draw'

  return { winner, rounds: victory?.round ?? battle.round, charStats, skillUses }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — batch run + report
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const N = Math.max(1, parseInt(process.argv[2] ?? '1000', 10))

  console.log(`\n${A.bold}${A.yellow}${'='.repeat(64)}${A.reset}`)
  console.log(`${A.bold}${A.yellow}   DRAFT — BALANCE SIMULATOR  (${N} battles)${A.reset}`)
  console.log(`${A.bold}${A.yellow}${'='.repeat(64)}${A.reset}\n`)

  // Accumulators
  let leftWins  = 0
  let rightWins = 0
  let draws     = 0
  let totalRounds = 0

  const roleStats = new Map<Role, RoleStat>()
  for (const r of ROLES) roleStats.set(r, emptyRoleStat())

  const skillUsageTotal = new Map<string, number>()

  const t0 = performance.now()

  for (let i = 0; i < N; i++) {
    const result = runOneBattle()

    // Win/draw counters
    if (result.winner === 'left')  leftWins++
    else if (result.winner === 'right') rightWins++
    else draws++

    totalRounds += result.rounds

    // Per-role aggregation
    for (const [, cs] of result.charStats) {
      const rs = roleStats.get(cs.role)!
      rs.totalDamageDealt    += cs.damageDealt
      rs.totalDamageReceived += cs.damageReceived
      rs.totalHealsGiven     += cs.healsGiven
      rs.totalKills          += cs.kills
      if (!cs.alive) rs.totalDeaths++
      rs.gamesPlayed++
    }

    // Skill usage
    for (const [skillId, count] of result.skillUses) {
      skillUsageTotal.set(skillId, (skillUsageTotal.get(skillId) ?? 0) + count)
    }

    // Progress indicator every 10%
    if (N >= 100 && (i + 1) % Math.floor(N / 10) === 0) {
      const pct = Math.round(((i + 1) / N) * 100)
      process.stdout.write(`\r${A.gray}  Progress: ${pct}%${A.reset}`)
    }
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2)
  if (N >= 100) process.stdout.write('\r')  // clear progress line

  // ─── Win rates ───────────────────────────────────────────────────────────
  console.log(`${A.bold}  Win Rates${A.reset}`)
  console.log(`  ${'─'.repeat(40)}`)
  const leftPct  = ((leftWins / N) * 100).toFixed(1)
  const rightPct = ((rightWins / N) * 100).toFixed(1)
  const drawPct  = ((draws / N) * 100).toFixed(1)
  console.log(`  ${A.blue}Blue (left) ${A.reset} ${leftWins.toString().padStart(5)} wins  ${A.bold}${leftPct}%${A.reset}`)
  console.log(`  ${A.red}Red (right) ${A.reset} ${rightWins.toString().padStart(5)} wins  ${A.bold}${rightPct}%${A.reset}`)
  console.log(`  ${A.yellow}Draws       ${A.reset} ${draws.toString().padStart(5)}        ${A.bold}${drawPct}%${A.reset}`)
  console.log(`  Avg rounds: ${A.cyan}${(totalRounds / N).toFixed(1)}${A.reset}`)
  console.log()

  // ─── Per-role stats ──────────────────────────────────────────────────────
  console.log(`${A.bold}  Per-Role Averages (per battle, both sides combined)${A.reset}`)
  console.log(`  ${'─'.repeat(64)}`)
  console.log(
    `  ${'Role'.padEnd(12)}`
    + `${'Dmg Dealt'.padStart(10)}`
    + `${'Dmg Recv'.padStart(10)}`
    + `${'Heals'.padStart(8)}`
    + `${'Kills'.padStart(7)}`
    + `${'Deaths'.padStart(8)}`
    + `${'Death%'.padStart(8)}`,
  )
  console.log(`  ${'─'.repeat(64)}`)
  for (const role of ROLES) {
    const rs = roleStats.get(role)!
    const gp = rs.gamesPlayed || 1
    const deathPct = ((rs.totalDeaths / gp) * 100).toFixed(0)
    console.log(
      `  ${A.cyan}${role.padEnd(12)}${A.reset}`
      + `${(rs.totalDamageDealt / gp).toFixed(0).padStart(10)}`
      + `${(rs.totalDamageReceived / gp).toFixed(0).padStart(10)}`
      + `${(rs.totalHealsGiven / gp).toFixed(0).padStart(8)}`
      + `${(rs.totalKills / gp).toFixed(1).padStart(7)}`
      + `${(rs.totalDeaths / gp).toFixed(1).padStart(8)}`
      + `${(deathPct + '%').padStart(8)}`,
    )
  }
  console.log()

  // ─── Skill usage ─────────────────────────────────────────────────────────
  const sortedSkills = [...skillUsageTotal.entries()].sort((a, b) => b[1] - a[1])
  console.log(`${A.bold}  Skill Usage (total across all ${N} battles)${A.reset}`)
  console.log(`  ${'─'.repeat(50)}`)
  console.log(`  ${'Skill ID'.padEnd(30)} ${'Uses'.padStart(8)} ${'Avg/Battle'.padStart(12)}`)
  console.log(`  ${'─'.repeat(50)}`)

  // Resolve skill names from registry when possible
  for (const [skillId, count] of sortedSkills) {
    const avgUse = (count / N).toFixed(1)
    const label = skillId.padEnd(30)
    console.log(`  ${A.gray}${label}${A.reset} ${count.toString().padStart(8)} ${avgUse.padStart(12)}`)
  }
  console.log()

  // ─── Footer ──────────────────────────────────────────────────────────────
  console.log(`${A.bold}${A.yellow}${'='.repeat(64)}${A.reset}`)
  console.log(`${A.gray}  ${N} battles completed in ${elapsed}s${A.reset}`)
  console.log(`${A.bold}${A.yellow}${'='.repeat(64)}${A.reset}\n`)
}

main()
