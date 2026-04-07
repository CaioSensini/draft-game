/**
 * data/skillCatalog.ts — the canonical source of truth for all skill definitions.
 *
 * This file is PURE DATA — no imports from the engine, no `new Skill()` calls.
 * Every object here is a plain SkillDefinition that can be loaded, validated,
 * serialised to JSON, or sent over the network without any transformation.
 *
 * Adding a new skill to the game:
 *   1. Append a new entry to SKILL_CATALOG below.
 *   2. Reference its `id` in data/deckAssignments.ts if you want it in a deck.
 *   3. No engine, registry, or BattleSim changes required.
 *
 * Fields:
 *   range       — max tile distance (0 = unrestricted)
 *   areaRadius  — AoE radius in tiles (only meaningful for area skills)
 *   secondaryEffect — optional combo: a second status applied after the primary,
 *                     only if the hit was not evaded and target survived.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Catalog sections
 *   [1] KING skills         (ids: lk_* / rk_*)
 *   [2] WARRIOR skills      (ids: lw_* / rw_*)
 *   [3] EXECUTOR skills     (ids: le_* / re_*)
 *   [4] SPECIALIST skills   (ids: ls_* / rs_*)
 *   [5] SPECIAL / COMBO     (ids: sp_*) — demonstrate secondaryEffect
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SkillDefinition } from '../domain/Skill'

export const SKILL_CATALOG: SkillDefinition[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // [1] KING — Leo (left) / Rex (right)
  //     Role: sustained damage, crown stun, self-sustain shields/regen
  // ══════════════════════════════════════════════════════════════════════════

  // ── Left King attacks ────────────────────────────────────────────────────
  {
    id: 'lk_a1', name: 'Royal Strike', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 35, range: 4,
    description: 'A direct blow from the king — high single-target damage.',
  },
  {
    id: 'lk_a2', name: 'Command Hit', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 28, range: 4,
    description: 'Swift authoritative strike, slightly weaker than Royal Strike.',
  },
  {
    id: 'lk_a3', name: 'Decree', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 15, range: 4,
    description: 'Stuns the target for one round with a commanding blow.',
  },
  {
    id: 'lk_a4', name: "Crown's Wrath", category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 40, range: 4,
    description: 'The king unleashes his full fury — highest single-target damage.',
  },

  // ── Left King defenses ───────────────────────────────────────────────────
  {
    id: 'lk_d1', name: 'Golden Shield', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 60, range: 0,
    description: 'A heavy golden barrier that absorbs significant damage.',
  },
  {
    id: 'lk_d2', name: 'Royal Guard', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Sidesteps the next incoming hit entirely.',
  },
  {
    id: 'lk_d3', name: 'Battle Cry', category: 'defense', group: 'defense2',
    effectType: 'regen', targetType: 'self', power: 15, range: 0,
    description: 'The king rallies — regenerates HP over the next three rounds.',
  },
  {
    id: 'lk_d4', name: "King's Resolve", category: 'defense', group: 'defense2',
    effectType: 'heal', targetType: 'self', power: 30, range: 0,
    description: 'Immediate self-heal — restores a moderate amount of HP now.',
  },

  // ── Right King attacks ───────────────────────────────────────────────────
  {
    id: 'rk_a1', name: 'Iron Fist', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 35, range: 4,
    description: 'A crushing iron-gauntleted strike.',
  },
  {
    id: 'rk_a2', name: "Tyrant's Blow", category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 28, range: 4,
    description: 'A sharp blow that leaves the target reeling.',
  },
  {
    id: 'rk_a3', name: 'Dominion', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 15, range: 4,
    description: 'Asserts dominion over the target — stuns for one round.',
  },
  {
    id: 'rk_a4', name: 'Rulership', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 40, range: 4,
    description: 'The tyrant strikes with supreme force.',
  },

  // ── Right King defenses ──────────────────────────────────────────────────
  {
    id: 'rk_d1', name: 'Steel Crown', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 60, range: 0,
    description: 'A steel-forged barrier that absorbs significant damage.',
  },
  {
    id: 'rk_d2', name: 'Royal Parry', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Parries the next incoming blow cleanly.',
  },
  {
    id: 'rk_d3', name: "Conqueror's Will", category: 'defense', group: 'defense2',
    effectType: 'regen', targetType: 'self', power: 15, range: 0,
    description: 'An iron will sustains the tyrant — regenerates HP over three rounds.',
  },
  {
    id: 'rk_d4', name: "Throne's Blessing", category: 'defense', group: 'defense2',
    effectType: 'heal', targetType: 'self', power: 30, range: 0,
    description: 'Draws on royal power for an immediate HP restoration.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // [2] WARRIOR — Wren (left) / Reva (right)
  //     Role: heavy damage, guard (adjacent allies gain DEF), shield tanking
  // ══════════════════════════════════════════════════════════════════════════

  // ── Left Warrior attacks ─────────────────────────────────────────────────
  {
    id: 'lw_a1', name: 'Heavy Blow', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 38, range: 3,
    description: 'A slow but punishing melee strike.',
  },
  {
    id: 'lw_a2', name: 'War Hammer', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 32, range: 3,
    description: 'Thunderous hammer blow that dents armor.',
  },
  {
    id: 'lw_a3', name: 'Shield Bash', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 20, range: 2,
    description: 'Drives the shield into the enemy — stuns and deals damage.',
  },
  {
    id: 'lw_a4', name: 'Rampage', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 44, range: 3,
    description: 'The warrior goes berserk — maximum single-target damage.',
  },

  // ── Left Warrior defenses ────────────────────────────────────────────────
  {
    id: 'lw_d1', name: 'Iron Wall', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 80, range: 0,
    description: 'Raises an iron wall — the heaviest shield in the game.',
  },
  {
    id: 'lw_d2', name: 'Fortress Stance', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 50, range: 0,
    description: 'Defensive stance grants a solid shield buffer.',
  },
  {
    id: 'lw_d3', name: 'Counter Stance', category: 'defense', group: 'defense2',
    effectType: 'reflect', targetType: 'self', power: 30, range: 0,
    description: 'Reflects the next incoming attack back at the attacker.',
  },
  {
    id: 'lw_d4', name: 'Guard Up', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Dodges out of the way of the next hit.',
  },

  // ── Right Warrior attacks ────────────────────────────────────────────────
  {
    id: 'rw_a1', name: 'Cleave', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 38, range: 3,
    description: 'A horizontal cleaving stroke that rips through armor.',
  },
  {
    id: 'rw_a2', name: 'Earthquake', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 32, range: 3,
    description: 'A ground-shaking slam that rattles the target.',
  },
  {
    id: 'rw_a3', name: 'Knockdown', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 20, range: 2,
    description: 'Knocks the target flat — stuns and deals moderate damage.',
  },
  {
    id: 'rw_a4', name: 'Berserker', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 44, range: 3,
    description: 'A berserk frenzy — the warrior deals maximum damage.',
  },

  // ── Right Warrior defenses ───────────────────────────────────────────────
  {
    id: 'rw_d1', name: 'Bulwark', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 80, range: 0,
    description: 'A bulwark stance granting the heaviest possible shield.',
  },
  {
    id: 'rw_d2', name: 'Plate Wall', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 50, range: 0,
    description: 'Full plate blocks incoming damage with a solid shield.',
  },
  {
    id: 'rw_d3', name: 'Retaliate', category: 'defense', group: 'defense2',
    effectType: 'reflect', targetType: 'self', power: 30, range: 0,
    description: 'Turns the next blow back against the attacker.',
  },
  {
    id: 'rw_d4', name: 'Aegis', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Aegis deflects the next attack with perfect timing.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // [3] EXECUTOR — Edge (left) / Echo (right)
  //     Role: isolation burst damage, bleed DoT, armor break, evasion
  // ══════════════════════════════════════════════════════════════════════════

  // ── Left Executor attacks ────────────────────────────────────────────────
  {
    id: 'le_a1', name: 'Swift Slash', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 42, range: 5,
    description: 'A razor-fast slash from a deadly executor.',
  },
  {
    id: 'le_a2', name: 'Armor Break', category: 'attack', group: 'attack1',
    effectType: 'def_down', targetType: 'single', power: 20, range: 4,
    description: 'Shatters armor — reduces target DEF by 20 for 3 rounds.',
  },
  {
    id: 'le_a3', name: 'Bleed Out', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'single', power: 25, range: 4,
    description: 'A deep laceration that causes the target to bleed for 3 rounds.',
  },
  {
    id: 'le_a4', name: 'Coup de Grâce', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 50, range: 5,
    description: 'The killing stroke — maximum executor damage.',
  },

  // ── Left Executor defenses ───────────────────────────────────────────────
  {
    id: 'le_d1', name: 'Ghost Step', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Fades into a ghost-step to evade the next attack.',
  },
  {
    id: 'le_d2', name: 'Phase Shift', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Phases out of reality to dodge the incoming blow.',
  },
  {
    id: 'le_d3', name: 'Barrier', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 40, range: 0,
    description: 'A thin but effective barrier of focused energy.',
  },
  {
    id: 'le_d4', name: 'Dodge Roll', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Rolls clear of the next hit.',
  },

  // ── Right Executor attacks ───────────────────────────────────────────────
  {
    id: 're_a1', name: 'Blade Dance', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 42, range: 5,
    description: 'A deadly blade dance that slices the target cleanly.',
  },
  {
    id: 're_a2', name: 'Armor Break', category: 'attack', group: 'attack1',
    effectType: 'def_down', targetType: 'single', power: 20, range: 4,
    description: 'Shatters armor — reduces target DEF by 20 for 3 rounds.',
  },
  {
    id: 're_a3', name: 'Hemorrhage', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'single', power: 25, range: 4,
    description: 'A strike that causes severe hemorrhaging for 3 rounds.',
  },
  {
    id: 're_a4', name: 'Finishing Blow', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 50, range: 5,
    description: 'The executioner delivers the final blow.',
  },

  // ── Right Executor defenses ──────────────────────────────────────────────
  {
    id: 're_d1', name: 'Evasion', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Pure evasion — negates the next hit.',
  },
  {
    id: 're_d2', name: 'Shadow Form', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Slips into shadow to avoid the incoming attack.',
  },
  {
    id: 're_d3', name: 'Ward', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 40, range: 0,
    description: 'A warding barrier that absorbs moderate damage.',
  },
  {
    id: 're_d4', name: 'Mirage Step', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0, range: 0,
    description: 'Leaves a mirage in place and steps aside.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // [4] SPECIALIST — Sage (left) / Sable (right)
  //     Role: DoT (bleed + poison), stun, heal-reduction passive, self-sustain
  // ══════════════════════════════════════════════════════════════════════════

  // ── Left Specialist attacks ──────────────────────────────────────────────
  {
    id: 'ls_a1', name: 'Toxic Dart', category: 'attack', group: 'attack1',
    effectType: 'bleed', targetType: 'single', power: 20, range: 5,
    description: 'A dart laced with toxin — deals damage and applies bleed.',
  },
  {
    id: 'ls_a2', name: 'Neural Shock', category: 'attack', group: 'attack1',
    effectType: 'stun', targetType: 'single', power: 18, range: 5,
    description: 'A neural disruption shot that stuns the target.',
  },
  {
    id: 'ls_a3', name: 'Venom Strike', category: 'attack', group: 'attack2',
    effectType: 'poison', targetType: 'single', power: 24, range: 5,
    description: 'Injects venom — deals poison DoT that stacks with bleed.',
  },
  {
    id: 'ls_a4', name: 'Disruption', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 22, range: 5,
    description: 'A heavy disruption blast that stuns and deals damage.',
  },

  // ── Left Specialist defenses ─────────────────────────────────────────────
  {
    id: 'ls_d1', name: 'Healing Mist', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'self', power: 25, range: 0,
    description: 'A restorative mist that instantly heals the specialist.',
  },
  {
    id: 'ls_d2', name: 'Regenerate', category: 'defense', group: 'defense1',
    effectType: 'regen', targetType: 'self', power: 20, range: 0,
    description: 'Initiates cellular regeneration — heals over 3 rounds.',
  },
  {
    id: 'ls_d3', name: 'Mend', category: 'defense', group: 'defense2',
    effectType: 'heal', targetType: 'self', power: 30, range: 0,
    description: 'A stronger targeted mend — heals more HP than Healing Mist.',
  },
  {
    id: 'ls_d4', name: 'Recovery', category: 'defense', group: 'defense2',
    effectType: 'regen', targetType: 'self', power: 15, range: 0,
    description: 'A lighter regen effect for sustained recovery.',
  },

  // ── Right Specialist attacks ─────────────────────────────────────────────
  {
    id: 'rs_a1', name: 'Acid Shot', category: 'attack', group: 'attack1',
    effectType: 'bleed', targetType: 'single', power: 20, range: 5,
    description: 'Acid spray that eats through flesh — applies bleed.',
  },
  {
    id: 'rs_a2', name: 'Chain Shock', category: 'attack', group: 'attack1',
    effectType: 'stun', targetType: 'single', power: 18, range: 5,
    description: 'A chained electric shock that stuns the target.',
  },
  {
    id: 'rs_a3', name: 'Corrosion', category: 'attack', group: 'attack2',
    effectType: 'poison', targetType: 'single', power: 24, range: 5,
    description: 'Applies corrosive poison — stacks with bleed DoT.',
  },
  {
    id: 'rs_a4', name: 'Silence', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 22, range: 5,
    description: 'Silences and stuns the target with a concussive blast.',
  },

  // ── Right Specialist defenses ────────────────────────────────────────────
  {
    id: 'rs_d1', name: 'Antidote', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'self', power: 25, range: 0,
    description: 'Self-administers an antidote — instantly heals.',
  },
  {
    id: 'rs_d2', name: 'Regeneration', category: 'defense', group: 'defense1',
    effectType: 'regen', targetType: 'self', power: 20, range: 0,
    description: 'Initiates full regeneration — heals over 3 rounds.',
  },
  {
    id: 'rs_d3', name: 'Patch Up', category: 'defense', group: 'defense2',
    effectType: 'heal', targetType: 'self', power: 30, range: 0,
    description: 'A field patch that provides stronger instant healing.',
  },
  {
    id: 'rs_d4', name: 'Triage', category: 'defense', group: 'defense2',
    effectType: 'regen', targetType: 'self', power: 15, range: 0,
    description: 'Triage protocol initiates light sustained regeneration.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // [5] SPECIAL / COMBO SKILLS — demonstrate secondaryEffect
  //
  //     These skills show how new behaviours can be added as pure data:
  //     no switch-case changes in CombatEngine needed — just add entries here
  //     and reference them in a deck assignment.
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: 'sp_shatter_strike',
    name: 'Shatter Strike',
    category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single',
    power: 28, range: 4,
    description: 'A calculated blow that cracks armor — deals damage AND reduces target DEF by 15 for 3 rounds.',
    secondaryEffect: { effectType: 'def_down', power: 15, ticks: 3 },
  },

  {
    id: 'sp_frenzied_slash',
    name: 'Frenzied Slash',
    category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single',
    power: 30, range: 4,
    description: 'A frenzied cut that deals damage AND opens a bleeding wound (8 damage/round for 3 rounds).',
    secondaryEffect: { effectType: 'bleed', power: 8, ticks: 3 },
  },

  {
    id: 'sp_thunder_strike',
    name: 'Thunder Strike',
    category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single',
    power: 22, range: 5,
    description: 'An electrified strike — deals damage AND stuns the target for 1 round.',
    secondaryEffect: { effectType: 'stun', power: 0, ticks: 1 },
  },

  {
    id: 'sp_venom_blade',
    name: 'Venom Blade',
    category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single',
    power: 25, range: 4,
    description: 'A poisoned blade — deals damage AND injects poison (10 damage/round for 3 rounds). Stacks with bleed.',
    secondaryEffect: { effectType: 'poison', power: 10, ticks: 3 },
  },

  {
    id: 'sp_fortified_barrier',
    name: 'Fortified Barrier',
    category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self',
    power: 50, range: 0,
    description: 'Raises a fortified barrier — grants both a shield (50) AND regen (12 HP/round for 3 rounds).',
    secondaryEffect: { effectType: 'regen', power: 12, ticks: 3 },
  },

  {
    id: 'sp_iron_will',
    name: 'Iron Will',
    category: 'defense', group: 'defense2',
    effectType: 'heal', targetType: 'self',
    power: 20, range: 0,
    description: 'An act of sheer willpower — heals HP AND boosts ATK by 10 for 2 rounds.',
    secondaryEffect: { effectType: 'atk_up', power: 10, ticks: 2 },
  },

  // ── New effect types — demonstrate the EffectResolver extension points ─────

  {
    id: 'sp_true_strike',
    name: 'True Strike',
    category: 'attack', group: 'attack1',
    effectType: 'true_damage', targetType: 'single',
    power: 35, range: 5,
    description: 'Bypasses armor entirely — deals 35 flat damage directly to HP. Ignores DEF, ATK scaling, warrior guard, and wall bonuses.',
  },

  {
    id: 'sp_piercing_shot',
    name: 'Piercing Shot',
    category: 'attack', group: 'attack2',
    effectType: 'true_damage', targetType: 'single',
    power: 25, range: 6,
    description: 'A precise shot that pierces all defenses — 25 flat HP damage with no mitigation.',
    secondaryEffect: { effectType: 'def_down', power: 10, ticks: 2 },
  },

  {
    id: 'sp_cleanse',
    name: 'Purifying Light',
    category: 'defense', group: 'defense1',
    effectType: 'cleanse', targetType: 'self',
    power: 0, range: 0,
    description: 'Washes away all active debuffs (bleed, poison, stun, stat reductions). Self-only.',
  },

  {
    id: 'sp_cleanse_ally',
    name: 'Mending Touch',
    category: 'attack', group: 'attack1',
    effectType: 'cleanse', targetType: 'lowest_ally',
    power: 0, range: 3,
    description: 'Channels cleansing energy to the most wounded ally — removes all their active debuffs.',
  },

  {
    id: 'sp_purge',
    name: 'Dispel Strike',
    category: 'attack', group: 'attack2',
    effectType: 'purge', targetType: 'single',
    power: 0, range: 4,
    description: 'Strips all active buffs (shields, evades, stat boosts, regen) from one enemy.',
  },

  {
    id: 'sp_purge_blast',
    name: 'Null Blast',
    category: 'attack', group: 'attack1',
    effectType: 'purge', targetType: 'single',
    power: 0, range: 5,
    description: 'A nullifying blast — removes all buffs from an enemy AND deals 20 flat true damage.',
    secondaryEffect: { effectType: 'true_damage', power: 20 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // [6] AREA SKILLS — demonstrate the targeting system
  //
  //     All use targetType: 'area'. The player aims at a tile; the engine
  //     resolves which enemies stand on the resulting shape at resolution time.
  //
  //     areaShape overrides the legacy areaRadius fallback and supports any
  //     AreaShape variant: diamond, square, line, ring, cone.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Diamond AoE (classic explosion around a tile) ────────────────────────
  {
    id: 'area_explosion',
    name: 'Explosion',
    category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area',
    power: 30, range: 6,
    areaRadius: 1,
    areaShape: { type: 'diamond', radius: 1 },
    description: 'A fiery explosion centred on the target tile — hits all enemies within 1 tile (diamond, up to 5 cells).',
  },

  // ── Square AoE (3×3 blast) ────────────────────────────────────────────────
  {
    id: 'area_shockwave',
    name: 'Shockwave',
    category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'area',
    power: 25, range: 5,
    areaRadius: 1,
    areaShape: { type: 'square', radius: 1 },
    description: 'A ground shockwave that fills a 3×3 square area with seismic force.',
  },

  // ── Line AoE (piercing beam eastward) ────────────────────────────────────
  {
    id: 'area_beam_east',
    name: 'Piercing Beam',
    category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area',
    power: 35, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 4 },
    description: 'A laser-straight beam aimed east — hits the target tile and the 4 tiles behind it in a line.',
  },

  // ── Ring AoE (hollow ring — hits everything around a central tile) ────────
  {
    id: 'area_ring_burst',
    name: 'Ring Burst',
    category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'area',
    power: 20, range: 6,
    areaShape: { type: 'ring', radius: 1 },
    description: 'An outward burst that strikes the ring of tiles around the target — avoids the centre.',
  },

  // ── Cone AoE (expanding triangle aimed east — useful for warriors) ────────
  {
    id: 'area_war_cleave',
    name: 'War Cleave',
    category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area',
    power: 28, range: 4,
    areaShape: { type: 'cone', direction: 'east', length: 2 },
    description: 'A wide sweeping cleave aimed east — expands outward like a cone, covering a 5-tile triangular area.',
  },

  // ── Poison area (AoE DoT) ─────────────────────────────────────────────────
  {
    id: 'area_toxic_cloud',
    name: 'Toxic Cloud',
    category: 'attack', group: 'attack2',
    effectType: 'poison', targetType: 'area',
    power: 18, range: 6,
    areaShape: { type: 'diamond', radius: 1 },
    description: 'Releases a spreading toxic cloud — poisons all enemies in a diamond area for 3 rounds.',
  },

  // ── Bleed area (AoE bleed) ────────────────────────────────────────────────
  {
    id: 'area_frag_burst',
    name: 'Fragmentation Burst',
    category: 'attack', group: 'attack1',
    effectType: 'bleed', targetType: 'area',
    power: 20, range: 5,
    areaShape: { type: 'square', radius: 1 },
    description: 'Detonates shrapnel in a 3×3 area — applies bleed to all enemies caught in the burst.',
  },
]
