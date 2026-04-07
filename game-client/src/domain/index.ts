/**
 * domain/index.ts — barrel export for the domain layer.
 *
 * External code (engine, tests, renderer) imports from here,
 * not from individual files, so internal restructuring stays transparent.
 */

export * from './Effect'
export * from './Character'
export * from './Skill'
export * from './Deck'
export * from './Team'
export * from './Battle'
export * from './Grid'
