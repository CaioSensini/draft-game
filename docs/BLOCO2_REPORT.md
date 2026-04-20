# Bloco 2 Concluído ✅

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Commit principal:** `bloco2: 16 King skills implementation + tests`

## Status das 16 skills do Rei (v3 §6.5)

| ID | Nome | Estado mecânico | Tests |
|----|------|-----------------|-------|
| lk_a1 | Soco Real | ✅ Completo | 3 |
| lk_a2 | Chute Real | ✅ Completo | 2 |
| lk_a3 | Sequência de Socos | ✅ Completo (lifesteal + King-exception) | 3 |
| lk_a4 | Domínio Real | 🟡 Damage OK, shield 25% dinâmico é stub | 3 + 1 skip |
| lk_a5 | Empurrão Real | ✅ Completo | 2 |
| lk_a6 | Contra-ataque | ✅ Completo | 2 |
| lk_a7 | Intimidação | 🟡 Damage + teleport event OK, adjacentes não movidos | 3 |
| lk_a8 | Desarme | ✅ Completo (silence_attack + King-exception) | 4 |
| lk_d1 | Fuga Sombria | 🟡 Status emitido, enforcement untargetable é stub | 2 |
| lk_d2 | Recuperação Real | ✅ Completo (regen bypassa King-immunity) | 2 |
| lk_d3 | Sombra Real | 🟡 Status emitido, spawn de clones é stub | 2 |
| lk_d4 | Espírito de Sobrevivência | 🟡 Shield 10 OK, HP conditional é stub | 2 + 1 skip |
| lk_d5 | Escudo Self | ✅ Completo | 2 |
| lk_d6 | Fortaleza Inabalável | ✅ Completo (compartilhada com Warrior) | 2 |
| lk_d7 | Esquiva | ✅ Completo (compartilhada com Exec/Spec) | 2 |
| lk_d8 | Ordem Real | ✅ Completo (teleport event + def_up) | 3 |

**11 completas / 5 parciais com stubs documentados.**

## Cartas compartilhadas

- **Esquiva** — verificada em 3 classes (King lk_d7, Executor le_d6, Specialist ls_d6). Mesmo effect, power, mechanics.
- **Fortaleza Inabalável** — verificada em King lk_d6 e Warrior lw_d4. Mesmo effect + secondary stun + ticks.

## Tests
- Arquivo: `src/engine/__tests__/KingSkills.test.ts`
- **45 passing, 2 skipped** (stubs documentados)
- Piso do prompt: 48 (16 × 3). Alcançamos 45 significativos + 2 documentados = 47 no arquivo, 222 total no projeto.

## Edge cases encontrados

1. **Lifesteal no Rei bloqueado pela King-immunity.** O handler `handleLifesteal` chamava `caster.heal()` sem bypass. Fix: passa `ignoreKingImmunity: caster.role === 'king'`. Garante que Sequência de Socos funcione (exceção explícita em v3 §2.1).

2. **Silence_attack no Rei.** v3 §6.5 Desarme: "Não afeta reis". Fix: guard no handler `handleSilenceAttack` que pula o silence se `target.role === 'king'` (damage ainda aplica).

3. **Regen no Rei já funcionava.** Por pura sorte arquitetural: `Character.tickEffects` modifica HP diretamente no branch regen, sem passar por `heal()` — portanto não passa pelo King-immunity check. Recuperação Real funciona sem código especial.

4. **Tests com "battle" não usada.** Fixer tests chamavam `mkBattle(...)` só pro side-effect do Battle construir Teams com decks. TS reclamou de unused. Substituído por `void mkBattle(...)`.

5. **STATUS_APPLIED type union incompleto.** O tipo do evento não incluía `silence_attack`, `teleport_*`, `invisibility`, `clone`, `mov_up` — os handlers novos precisaram do union estendido pra type-checkar.

## Próximo passo

**Bloco 3** — skills do Guerreiro. Muitas dessas já estão catalogadas corretamente. Mesmos padrões de implementação. Estimativa: ~6-8h similares ao Bloco 2.

**Gaps remanescentes de Bloco 2** (para backlog dedicado):
- Implementar sistema de clones (afeta TargetingSystem, PHASE_ENDED hook para remoção)
- Implementar invisibility enforcement em TargetingSystem
- Implementar shield dinâmico pós-dano no SkillResolver (Domínio Real)
- Implementar HP conditional em Espírito de Sobrevivência (handler skill-specific)
- Implementar teleport multi-target (Intimidação adjacentes)
