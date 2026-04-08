/**
 * simulation/BattleSim.ts — end-to-end battle simulation.
 *
 * Exercises the full domain + engine stack without any UI:
 *   Character → Team → Battle → CombatEngine → EventBus
 *
 * Run from game-client/:
 *   npm run sim
 *
 * No Phaser, no DOM, pure logic only.
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** ANSI colour helpers (no-op if output is not a TTY). */
const C = {
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

const PAD = '  '

// ─────────────────────────────────────────────────────────────────────────────
// Skill registry — built from data/skillCatalog.ts at startup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The registry is the single gateway to Skill objects.
 * Skills are defined in data/skillCatalog.ts (pure data).
 * Deck assignments (which IDs each character uses) are in data/deckAssignments.ts.
 * Nothing in this file needs to change when new skills are added.
 */
const registry = new SkillRegistry(SKILL_CATALOG)

// ─────────────────────────────────────────────────────────────────────────────
// Role stats
// ─────────────────────────────────────────────────────────────────────────────

const STATS: Record<string, CharacterStats> = {
  king:       { maxHp: 150, attack: 40, defense: 30, mobility: 3 },
  warrior:    { maxHp: 200, attack: 45, defense: 50, mobility: 2 },
  executor:   { maxHp: 120, attack: 65, defense: 20, mobility: 4 },
  specialist: { maxHp: 130, attack: 38, defense: 25, mobility: 3 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation AI — picks skills and targets automatically
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick the best target for `char` using `skill`.
 * Priority: enemy king → lowest-HP enemy → first living enemy.
 */
function pickTarget(char: Character, skill: Skill, battle: Battle): TargetSpec {
  switch (skill.targetType) {
    case 'single': {
      const enemies  = battle.enemiesOf(char)
      if (enemies.length === 0) return { kind: 'self' }  // fallback (shouldn't happen)
      // For stun, prefer the warrior (disrupts guard), else target king
      const preferred = skill.effectType === 'stun'
        ? (enemies.find((e) => e.role === 'warrior') ?? enemies.find((e) => e.role === 'king'))
        : enemies.find((e) => e.role === 'king')
      const target = preferred ?? enemies.reduce((low, e) => e.hp < low.hp ? e : low, enemies[0])
      return { kind: 'character', characterId: target.id }
    }
    case 'area': {
      // Target the tile of the enemy king, or the first enemy
      const enemies = battle.enemiesOf(char)
      const focus   = enemies.find((e) => e.role === 'king') ?? enemies[0]
      return focus ? { kind: 'area', col: focus.col, row: focus.row } : { kind: 'self' }
    }
    case 'lowest_ally': return { kind: 'lowest_ally' }
    case 'all_allies':  return { kind: 'all_allies' }
    case 'self':        return { kind: 'self' }
  }
}

/**
 * Select and commit one actor's turn using the sequential TurnManager API.
 * Returns true if the actor acted, false if skipped.
 */
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

  const atkResult = engine.selectAttack(actor.id, atkSkill, target)
  if (!atkResult.ok) console.log(`${PAD}${C.yellow}WARN attack select: ${atkResult.error}${C.reset}`)

  const defResult = engine.selectDefense(actor.id, defSkill)
  if (!defResult.ok) console.log(`${PAD}${C.yellow}WARN defense select: ${defResult.error}${C.reset}`)

  engine.commitCurrentTurn()
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger — subscribes to EngineEvent and formats readable output
// ─────────────────────────────────────────────────────────────────────────────

function makeLogger(battle: Battle) {
  /** Quick name lookup across both teams. */
  function nameOf(id: string): string {
    return battle.getCharacter(id)?.name ?? id
  }

  return function onEvent(event: ReturnType<typeof battle.getCharacter> extends never ? never : Parameters<Parameters<CombatEngine['on']>[0]>[0]): void {
    switch (event.type) {

      case EventType.DAMAGE_APPLIED: {
        const victim = battle.getCharacter(event.unitId)!
        const src    = event.sourceId ? nameOf(event.sourceId) : '?'
        console.log(
          `${PAD}${C.red}💥 ${nameOf(event.unitId)}${C.reset} takes ${C.bold}${event.amount}${C.reset} dmg`
          + ` from ${C.cyan}${src}${C.reset}`
          + ` → HP ${C.yellow}${event.newHp}/${victim.maxHp}${C.reset}`,
        )
        break
      }

      case EventType.SHIELD_ABSORBED: {
        console.log(
          `${PAD}${C.blue}🛡  ${nameOf(event.unitId)}${C.reset}'s shield absorbs ${event.shieldDamage}`
          + ` (shield left: ${event.newShield})`,
        )
        break
      }

      case EventType.EVADE_TRIGGERED:
        console.log(`${PAD}${C.cyan}💨 ${nameOf(event.unitId)}${C.reset} evades the attack!`)
        break

      case EventType.REFLECT_TRIGGERED:
        console.log(
          `${PAD}${C.cyan}🪞 ${nameOf(event.unitId)}${C.reset} reflects`
          + ` ${event.amount} dmg back to ${C.red}${nameOf(event.sourceId)}${C.reset}`,
        )
        break

      case EventType.HEAL_APPLIED: {
        const char = battle.getCharacter(event.unitId)!
        const src  = event.sourceId ? ` (from ${nameOf(event.sourceId)})` : ''
        console.log(
          `${PAD}${C.green}💚 ${nameOf(event.unitId)}${C.reset} heals +${event.amount}${src}`
          + ` → HP ${C.yellow}${event.newHp}/${char.maxHp}${C.reset}`,
        )
        break
      }

      case EventType.SHIELD_APPLIED:
        console.log(`${PAD}${C.blue}🛡  ${nameOf(event.unitId)}${C.reset} gains +${event.amount} shield`)
        break

      case EventType.STATUS_APPLIED: {
        const icons: Record<string, string> = {
          bleed: '🩸', poison: '☠ ', stun: '⚡', regen: '🌿', reflect: '🪞', evade: '💨',
          def_down: '🔻', atk_down: '🔻', mov_down: '🔻',
          def_up:   '🔺', atk_up:   '🔺',
        }
        const labels: Record<string, string> = {
          def_down: `DEF −${event.value} (debuff)`,
          atk_down: `ATK −${event.value} (debuff)`,
          mov_down: `MOV −${event.value} (debuff)`,
          def_up:   `DEF +${event.value} (buff)`,
          atk_up:   `ATK +${event.value} (buff)`,
        }
        const tag = labels[event.status] ?? `${event.status}${event.value > 0 ? ` (${event.value})` : ''}`
        const colour = ['def_down','atk_down','mov_down','bleed','poison','stun'].includes(event.status)
          ? C.red : C.green
        console.log(
          `${PAD}${icons[event.status] ?? '✨'} ${nameOf(event.unitId)}`
          + ` → ${colour}${tag}${C.reset}`,
        )
        break
      }

      case EventType.BLEED_TICK:
        console.log(
          `${PAD}🩸 ${C.red}${nameOf(event.unitId)}${C.reset} bleeds`
          + ` ${event.damage} dmg → HP ${event.newHp}`,
        )
        break

      case EventType.POISON_TICK:
        console.log(
          `${PAD}☠  ${C.red}${nameOf(event.unitId)}${C.reset} poisoned`
          + ` ${event.damage} dmg → HP ${event.newHp}`,
        )
        break

      case EventType.REGEN_TICK:
        console.log(
          `${PAD}🌿 ${C.green}${nameOf(event.unitId)}${C.reset} regenerates`
          + ` +${event.heal} HP → ${event.newHp}`,
        )
        break

      case EventType.STAT_MODIFIER_EXPIRED: {
        const labels: Record<string, string> = {
          def_down: 'DEF debuff', atk_down: 'ATK debuff', mov_down: 'MOV debuff',
          def_up:   'DEF buff',   atk_up:   'ATK buff',
        }
        console.log(
          `${PAD}${C.gray}↩  ${nameOf(event.unitId)}'s ${labels[event.effectType] ?? event.effectType} expired${C.reset}`,
        )
        break
      }

      case EventType.CHARACTER_DIED: {
        const kingTag  = event.wasKing ? ` ${C.yellow}[KING]${C.reset}` : ''
        const killerTag = event.killedBy
          ? ` — killed by ${C.cyan}${nameOf(event.killedBy)}${C.reset}`
          : ` — killed by a ${C.red}status effect${C.reset}`
        console.log(
          `\n${PAD}${C.red}${C.bold}☠  ${nameOf(event.unitId)}${C.reset}${kingTag} slain on round ${event.round}${killerTag}\n`,
        )
        break
      }

      case EventType.AREA_RESOLVED:
        console.log(
          `${PAD}💥 Area at (${event.centerCol},${event.centerRow})`
          + ` hits: ${event.hitIds.map(nameOf).join(', ')}`,
        )
        break

      case EventType.TURN_STARTED: {
        const sideC = battle.getCharacter(event.unitId)?.side === 'left' ? C.blue : C.red
        console.log(
          `\n${PAD}${sideC}${C.bold}[${event.order}/${event.total}] ${nameOf(event.unitId)}'s turn${C.reset}`,
        )
        break
      }

      case EventType.TURN_COMMITTED:
        console.log(`${PAD}${C.gray}✓ ${nameOf(event.unitId)} committed${C.reset}`)
        break

      case EventType.TURN_SKIPPED: {
        const labels: Record<string, string> = {
          stunned:      'stunned',
          dead:         'dead',
          no_selection: 'no selection',
          timed_out:    'timed out',
        }
        console.log(`${PAD}${C.yellow}⚡ ${nameOf(event.unitId)} skipped (${labels[event.reason] ?? event.reason})${C.reset}`)
        break
      }

      case EventType.COMBAT_RULE_ACTIVE: {
        const sideC = event.side === 'left' ? C.blue : C.red
        console.log(
          `${PAD}${C.gray}⚖  [Rule] ${event.ruleId} → ${sideC}${event.side}${C.reset}`
          + `${C.gray} bonus: +${(event.value * 100).toFixed(0)} %${C.reset}`,
        )
        break
      }

      case EventType.PASSIVE_TRIGGERED: {
        const tgt = event.targetId ? ` → ${nameOf(event.targetId)}` : ''
        console.log(
          `${PAD}${C.gray}✦ [Passive] ${nameOf(event.unitId)}: ${event.passiveId}${tgt}${C.reset}`,
        )
        break
      }

      case EventType.BATTLE_ENDED: {
        const reasons: Record<string, string> = {
          king_slain:         'King slain',
          simultaneous_kings: 'Simultaneous kings — DRAW',
          timeout:            'Round limit — DRAW',
          forfeit:            'Forfeit',
        }
        if (event.winner) {
          const side = event.winner === 'left'
            ? `${C.blue}${C.bold}BLUE (left)${C.reset}`
            : `${C.red}${C.bold}RED (right)${C.reset}`
          console.log(`\n${C.bold}${C.yellow}═══ BATTLE ENDED (Round ${event.round}) — ${side}${C.bold}${C.yellow} wins! [${reasons[event.reason]}] ═══${C.reset}`)
        } else {
          console.log(`\n${C.bold}${C.yellow}═══ BATTLE ENDED (Round ${event.round}) — DRAW! [${reasons[event.reason]}] ═══${C.reset}`)
        }
        break
      }

      default:
        break
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main simulation
// ─────────────────────────────────────────────────────────────────────────────

export function runSimulation(): void {
  // ── Build characters ──────────────────────────────────────────────────────

  const leftKing       = new Character('lking',       'Leo',   'king',       'left',  3, 2, STATS.king)
  const leftWarrior    = new Character('lwarrior',    'Wren',  'warrior',    'left',  3, 1, STATS.warrior)
  const leftExecutor   = new Character('lexecutor',   'Edge',  'executor',   'left',  2, 2, STATS.executor)
  const leftSpecialist = new Character('lspecialist', 'Sage',  'specialist', 'left',  3, 3, STATS.specialist)

  const rightKing       = new Character('rking',       'Rex',   'king',       'right', 12, 2, STATS.king)
  const rightWarrior    = new Character('rwarrior',    'Reva',  'warrior',    'right', 12, 1, STATS.warrior)
  const rightExecutor   = new Character('rexecutor',   'Echo',  'executor',   'right', 13, 2, STATS.executor)
  const rightSpecialist = new Character('rspecialist', 'Sable', 'specialist', 'right', 12, 3, STATS.specialist)

  // ── Build teams (decks resolved via registry + deck assignments) ─────────

  const d = (id: string) => {
    const a = DECK_ASSIGNMENTS[id]
    if (!a) throw new Error(`No deck assignment for character "${id}"`)
    return registry.buildDeckConfig([...a.attackIds], [...a.defenseIds])
  }

  const leftTeam = new Team('left', [leftKing, leftWarrior, leftExecutor, leftSpecialist], {
    king:       d('lking'),
    warrior:    d('lwarrior'),
    executor:   d('lexecutor'),
    specialist: d('lspecialist'),
  })

  const rightTeam = new Team('right', [rightKing, rightWarrior, rightExecutor, rightSpecialist], {
    king:       d('rking'),
    warrior:    d('rwarrior'),
    executor:   d('rexecutor'),
    specialist: d('rspecialist'),
  })

  // ── Build battle + engine ─────────────────────────────────────────────────

  const battle = new Battle({ leftTeam, rightTeam })
  const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG, GLOBAL_RULES)

  // ── Subscribe to events ───────────────────────────────────────────────────

  const logger = makeLogger(battle)
  engine.on(logger)

  // ── Print initial state ───────────────────────────────────────────────────

  const line = '═'.repeat(60)
  console.log(`\n${C.bold}${C.yellow}${line}${C.reset}`)
  console.log(`${C.bold}${C.yellow}   DRAFT — BATTLE SIMULATION${C.reset}`)
  console.log(`${C.bold}${C.yellow}${line}${C.reset}`)
  console.log(`${C.gray}  Skill registry: ${registry.size} skills loaded from catalog${C.reset}`)

  console.log(`\n${C.bold}${C.blue}  Blue team (left):${C.reset}`)
  for (const c of leftTeam.all) {
    const deck = leftTeam.deck(c.id)!
    const atkHand  = deck.attack.hand.map((s) => s.name).join(', ')
    const defHand  = deck.defense.hand.map((s) => s.name).join(', ')
    console.log(`    ${c.name} (${c.role}) — HP:${c.hp}  ATK:${c.attack}  DEF:${c.defense}`)
    console.log(`${C.gray}      ATK hand: [${atkHand}]  DEF hand: [${defHand}]${C.reset}`)
  }

  console.log(`\n${C.bold}${C.red}  Red  team (right):${C.reset}`)
  for (const c of rightTeam.all) {
    const deck = rightTeam.deck(c.id)!
    const atkHand  = deck.attack.hand.map((s) => s.name).join(', ')
    const defHand  = deck.defense.hand.map((s) => s.name).join(', ')
    console.log(`    ${c.name} (${c.role}) — HP:${c.hp}  ATK:${c.attack}  DEF:${c.defense}`)
    console.log(`${C.gray}      ATK hand: [${atkHand}]  DEF hand: [${defHand}]${C.reset}`)
  }

  console.log()

  // ── Run the battle ────────────────────────────────────────────────────────

  const MAX_ROUNDS = 25
  battle.start()
  let lastRound    = 0
  let totalActions = 0

  while (!battle.isOver && battle.round <= MAX_ROUNDS) {

    // ── Movement phase: skip (no movement in simulation) ──────────────────
    if (battle.phase === 'movement') {
      battle.advancePhase()
      continue
    }

    // ── Action phase ──────────────────────────────────────────────────────
    const round = battle.round
    const side  = battle.currentSide

    if (round !== lastRound) {
      // New round banner + global rule evaluation
      console.log(`${C.bold}${C.yellow}${'─'.repeat(60)}${C.reset}`)
      console.log(`${C.bold}  Round ${round}${C.reset}`)
      console.log(`${C.bold}${C.yellow}${'─'.repeat(60)}${C.reset}`)
      engine.applyRoundStartRules()   // emits combat_rule_active events for active rules
      lastRound = round
    }

    const sideColour = side === 'left' ? C.blue : C.red
    const sideName   = side === 'left' ? 'Blue (left)' : 'Red  (right)'
    console.log(`\n${sideColour}${C.bold}  ▶ ${sideName} — Action Phase${C.reset}`)

    // Print who acts this phase and their hand
    for (const char of battle.currentTeam.living) {
      const deck = battle.teamOf(char.side).deck(char.id)
      if (!deck) continue
      const atkHand = deck.attack.hand.map((s) => s.name).join(', ')
      const defHand = deck.defense.hand.map((s) => s.name).join(', ')
      const stunTag = char.isStunned ? ` ${C.yellow}[STUNNED]${C.reset}` : ''
      console.log(
        `${C.gray}    ${char.name}${stunTag} — ATK:[${atkHand}]  DEF:[${defHand}]${C.reset}`,
      )
    }

    // Run actors one-by-one in role order (king → warrior → executor → specialist)
    engine.beginActionPhase()
    while (!engine.isPhaseComplete && !battle.isOver) {
      const actor = engine.getCurrentActor()
      if (!actor) break
      const acted = runActorTurn(actor, battle, engine)
      if (acted) totalActions++
    }

    // Print HP snapshot after resolution
    console.log(`\n${C.gray}  ── HP snapshot ─────────────────────────────────────${C.reset}`)
    for (const c of [...leftTeam.all, ...rightTeam.all]) {
      if (!c.alive) continue
      const sideC = c.side === 'left' ? C.blue : C.red
      const bar   = c.hp <= 0 ? `${C.red}DEAD${C.reset}` : `${C.yellow}${c.hp}/${c.maxHp}${C.reset}`
      console.log(`  ${sideC}${c.name.padEnd(8)}${C.reset}  ${bar}`)
    }

    // Remember if right side just finished — round will increment after advance.
    const rightSideJustFinished = side === 'right'
    battle.advancePhase()

    // ── End of full round (both sides done) ──────────────────────────────
    // After right side's action phase advances, the round counter has incremented.
    if (rightSideJustFinished && !battle.isOver) {
      console.log(`\n${C.gray}  ── Ticking status effects... ────────────────────────${C.reset}`)
      engine.tickStatusEffects()
    }

    if (battle.isOver) break
  }

  // ── Time-out draw ─────────────────────────────────────────────────────────
  if (!battle.isOver) {
    engine.forfeit('left')  // forces a clean VictoryResult (timeout)
    console.log(
      `\n${C.bold}${C.yellow}⏱  Round limit reached (${MAX_ROUNDS}) — no winner.${C.reset}`,
    )
  }

  const victory  = engine.getVictoryResult()
  const allChars = [...leftTeam.all, ...rightTeam.all]
  const colourOf = (c: Character) => c.side === 'left' ? C.blue : C.red

  // ── Final roster ──────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.yellow}${'═'.repeat(60)}${C.reset}`)
  console.log(`${C.bold}  Final Roster${C.reset}`)
  console.log(`${C.bold}${C.yellow}${'═'.repeat(60)}${C.reset}`)

  function hpBar(char: Character): string {
    const ratio  = char.hp / char.maxHp
    const filled = Math.round(ratio * 10)
    const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled)
    const colour = ratio > 0.6 ? C.green : ratio > 0.3 ? C.yellow : C.red
    return `${colour}${bar}${C.reset} ${char.hp}/${char.maxHp}`
  }

  for (const c of allChars) {
    const death = engine.getDeathRecord(c.id)
    const sideC = colourOf(c)
    const kingMark = c.role === 'king' ? `${C.yellow}♚${C.reset} ` : '  '

    let statusStr: string
    if (c.alive) {
      const fx = c.effects.length > 0 ? `  [${c.effects.map((e) => e.type).join(', ')}]` : ''
      statusStr = `${hpBar(c)}${C.gray}${fx}${C.reset}`
    } else {
      const killer  = death?.killedBy ? (battle.getCharacter(death.killedBy)?.name ?? death.killedBy) : 'DoT'
      statusStr = `${C.red}☠  DEAD — round ${death?.round ?? '?'}, killed by ${killer}${C.reset}`
    }
    console.log(`  ${kingMark}${sideC}${c.name.padEnd(9)}${C.reset}${C.gray}(${c.role})${C.reset}  ${statusStr}`)
  }

  // ── Combat statistics ─────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.yellow}${'═'.repeat(60)}${C.reset}`)
  console.log(
    `${C.bold}  Combat Statistics`
    + `  ·  Rounds: ${victory?.round ?? battle.round}`
    + `  ·  Actions: ${totalActions}${C.reset}`,
  )
  console.log(`${C.bold}${C.yellow}${'═'.repeat(60)}${C.reset}\n`)

  console.log(
    `  ${'Name'.padEnd(10)} ${'Role'.padEnd(12)} ${'Dealt'.padStart(6)} ${'Recv'.padStart(6)} ${'Heals'.padStart(6)} ${'Kills'.padStart(6)}   Outcome`,
  )
  console.log(`  ${'─'.repeat(62)}`)

  for (const char of allChars) {
    const stat    = engine.getStats(char.id)
    const death   = engine.getDeathRecord(char.id)
    const outcome = char.alive
      ? `${C.green}survived${C.reset}`
      : `${C.red}died r${death?.round ?? '?'}${C.reset}`
    console.log(
      `  ${colourOf(char)}${char.name.padEnd(10)}${C.reset}`
      + ` ${char.role.padEnd(12)}`
      + ` ${String(stat.damageDealt).padStart(6)}`
      + ` ${String(stat.damageReceived).padStart(6)}`
      + ` ${String(stat.healsGiven).padStart(6)}`
      + ` ${String(stat.kills).padStart(6)}`
      + `   ${outcome}`,
    )
  }

  console.log()
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point (auto-run when executed directly)
// ─────────────────────────────────────────────────────────────────────────────

runSimulation()
