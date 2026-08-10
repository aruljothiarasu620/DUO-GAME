// client/src/game/collision.ts — AABB Collision Detection

import type { Platform, Player, Enemy } from '../../../shared/types';

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function overlaps(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export interface CollisionResult {
  collided: boolean;
  overlapX: number;
  overlapY: number;
  fromLeft: boolean;
  fromRight: boolean;
  fromTop: boolean;
  fromBottom: boolean;
}

export function resolveAABB(a: AABB, b: AABB): CollisionResult {
  const result: CollisionResult = {
    collided: false,
    overlapX: 0, overlapY: 0,
    fromLeft: false, fromRight: false,
    fromTop: false, fromBottom: false,
  };

  if (!overlaps(a, b)) return result;
  result.collided = true;

  const overlapLeft   = (a.x + a.width)  - b.x;
  const overlapRight  = (b.x + b.width)  - a.x;
  const overlapTop    = (a.y + a.height) - b.y;
  const overlapBottom = (b.y + b.height) - a.y;

  // Find minimum overlap axis
  const minX = Math.min(overlapLeft, overlapRight);
  const minY = Math.min(overlapTop, overlapBottom);

  if (minX < minY) {
    result.overlapX = minX;
    if (overlapLeft < overlapRight) {
      result.fromLeft = true;
    } else {
      result.fromRight = true;
    }
  } else {
    result.overlapY = minY;
    if (overlapTop < overlapBottom) {
      result.fromTop = true;
    } else {
      result.fromBottom = true;
    }
  }

  return result;
}

/**
 * Resolve player vs solid platforms. Mutates player position and velocity.
 * Returns true if player is on ground after resolution.
 */
export function resolvePlatformCollisions(
  player: { x: number; y: number; width: number; height: number; vx: number; vy: number; isOnGround: boolean },
  platforms: Platform[],
  playerWorld: 'light' | 'dark'
): boolean {
  let onGround = false;

  for (const plat of platforms) {
    if (!plat.isSolid) continue;
    if (plat.world !== 'both' && plat.world !== playerWorld) continue;

    const col = resolveAABB(player, plat);
    if (!col.collided) continue;

    if (col.fromTop) {
      // Player lands on top
      player.y = plat.y - player.height;
      player.vy = 0;
      onGround = true;
    } else if (col.fromBottom) {
      player.y = plat.y + plat.height;
      player.vy = 0;
    } else if (col.fromLeft) {
      player.x = plat.x - player.width;
      player.vx = 0;
    } else if (col.fromRight) {
      player.x = plat.x + plat.width;
      player.vx = 0;
    }
  }

  player.isOnGround = onGround;
  return onGround;
}

export function checkEnemyCollision(
  player: Player,
  enemies: Enemy[],
  playerWorld: 'light' | 'dark'
): boolean {
  for (const enemy of enemies) {
    if (!enemy.isAlive) continue;
    if (enemy.world !== 'both' && enemy.world !== playerWorld) continue;
    if (overlaps(player, enemy)) return true;
  }
  return false;
}
