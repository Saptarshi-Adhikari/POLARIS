/**
 * POLARIS Nav-OS — 12-Class Seeded Scenario Generator
 *
 * Generates reproducible simulation scenarios across 12 distinct hazard classes
 * using SeededRandom and existing Iceberg entity logic.
 */

import { SeededRandom } from '../utils/seededRandom.js';
import { Iceberg } from '../simulation/iceberg.js';
import { isHardBlocked } from '../ai/routePlannerCore.js';
import { wrappedDelta } from '../utils.js';

export const SCENARIO_CLASSES = [
  'CLASS_A_CLEAR_SEAS',
  'CLASS_B_STATIC_OBSTACLE',
  'CLASS_C_MOVING_CROSSING',
  'CLASS_D_MULTI_ICEBERG_FIELD',
  'CLASS_E_SIDE_APPROACH',
  'CLASS_F_HEAD_ON_APPROACH',
  'CLASS_G_ESCAPE_CORRIDORS',
  'CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE',
  'CLASS_I_SLOW_DOWN_BETTER',
  'CLASS_J_TURN_BETTER',
  'CLASS_K_WORLD_WRAP_CROSSING',
  'CLASS_L_SAFE_VS_RISKY_CHOICE'
];

export const ROUTE_MODES = [
  'FASTEST',
  'BALANCED',
  'SAFEST',
  'FUEL_EFFICIENT'
];

export const CURRICULUM_LEVELS = [
  { level: 'EASY', weight: 0.20 },
  { level: 'NORMAL', weight: 0.50 },
  { level: 'HARD', weight: 0.25 },
  { level: 'EXTREME', weight: 0.05 }
];

export function getCurriculumLevel(seed) {
  const rng = new SeededRandom(seed);
  const val = rng.next();
  if (val < 0.20) return 'EASY';
  if (val < 0.70) return 'NORMAL';
  if (val < 0.95) return 'HARD';
  return 'EXTREME';
}

export class ScenarioGenerator {
  constructor() {}

  /**
   * Generates start position, destination, and icebergs for a specified scenario class & seed.
   */
  generateScenario(seed = 12345, scenarioClass = 'CLASS_A_CLEAR_SEAS', options = {}) {
    const rng = new SeededRandom(seed);
    const difficulty = options.difficulty || getCurriculumLevel(seed);
    const iceCountParam = options.icebergCount;

    // Difficulty multiplier for iceberg dynamics
    const speedMult = difficulty === 'EASY' ? 0.6 : (difficulty === 'HARD' ? 1.4 : (difficulty === 'EXTREME' ? 1.8 : 1.0));
    const sizeMult = difficulty === 'EASY' ? 0.8 : (difficulty === 'HARD' ? 1.2 : (difficulty === 'EXTREME' ? 1.4 : 1.0));

    // Standard start and destination defaults
    let start = { x: 400, y: 1800, heading: 330 };
    let destination = { x: 3000, y: 600 };

    let icebergs = [];
    const midX = (start.x + destination.x) / 2;
    const midY = (start.y + destination.y) / 2;

    switch (scenarioClass) {
      case 'CLASS_A_CLEAR_SEAS': {
        // No icebergs directly on path; 0-2 distant small icebergs far away
        const count = iceCountParam !== undefined ? iceCountParam : rng.rangeInt(0, 2);
        for (let i = 0; i < count; i++) {
          icebergs.push(new Iceberg({
            id: `ice_a_${i}`,
            name: `ICE-A${i}`,
            x: rng.range(100, 500),
            y: rng.range(100, 500),
            size: rng.range(30, 50),
            vx: rng.range(-0.5, 0.5),
            vy: rng.range(-0.5, 0.5)
          }));
        }
        break;
      }

      case 'CLASS_B_STATIC_OBSTACLE': {
        // Static iceberg placed directly on the mid-point of path
        const count = iceCountParam !== undefined ? iceCountParam : 1;
        icebergs.push(new Iceberg({
          id: 'ice_b_main',
          name: 'ICE-B-STATIC',
          x: midX,
          y: midY,
          size: 70,
          vx: 0,
          vy: 0
        }));
        for (let i = 1; i < count; i++) {
          icebergs.push(new Iceberg({
            id: `ice_b_${i}`,
            name: `ICE-B${i}`,
            x: midX + rng.range(-300, 300),
            y: midY + rng.range(-300, 300),
            size: 40,
            vx: 0,
            vy: 0
          }));
        }
        break;
      }

      case 'CLASS_C_MOVING_CROSSING': {
        // Single iceberg moving perpendicularly across the direct route path
        icebergs.push(new Iceberg({
          id: 'ice_c_crossing',
          name: 'ICE-C-CROSSING',
          x: midX - 200,
          y: midY + 300,
          size: 65,
          vx: 1.5,
          vy: -2.5
        }));
        break;
      }

      case 'CLASS_D_MULTI_ICEBERG_FIELD': {
        // Multi-iceberg field (3–8 icebergs) scattered across the transit area
        const count = iceCountParam !== undefined ? iceCountParam : rng.rangeInt(4, 7);
        for (let i = 0; i < count; i++) {
          icebergs.push(new Iceberg({
            id: `ice_d_${i}`,
            name: `FIELD-ICE-${i}`,
            x: rng.range(800, 2600),
            y: rng.range(600, 1600),
            size: rng.range(40, 85),
            vx: rng.range(-1.2, 1.2),
            vy: rng.range(-1.2, 1.2)
          }));
        }
        break;
      }

      case 'CLASS_E_SIDE_APPROACH': {
        // Iceberg approaching from starboard flank
        icebergs.push(new Iceberg({
          id: 'ice_e_flank',
          name: 'ICE-E-FLANK',
          x: start.x + 400,
          y: start.y - 600,
          size: 75,
          vx: -1.0,
          vy: 2.0
        }));
        break;
      }

      case 'CLASS_F_HEAD_ON_APPROACH': {
        // Iceberg moving directly head-on towards ship
        icebergs.push(new Iceberg({
          id: 'ice_f_headon',
          name: 'ICE-F-HEADON',
          x: start.x + 800,
          y: start.y - 450,
          size: 70,
          vx: -3.0,
          vy: 1.7
        }));
        break;
      }

      case 'CLASS_G_ESCAPE_CORRIDORS': {
        // Cluster of icebergs forming a narrow corridor
        icebergs.push(new Iceberg({
          id: 'ice_g_1',
          name: 'ICE-G1',
          x: midX - 50,
          y: midY - 140,
          size: 60,
          vx: 0,
          vy: 0
        }));
        icebergs.push(new Iceberg({
          id: 'ice_g_2',
          name: 'ICE-G2',
          x: midX + 50,
          y: midY + 140,
          size: 60,
          vx: 0,
          vy: 0
        }));
        break;
      }

      case 'CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE': {
        // Close proximity hazard requiring immediate early turn
        icebergs.push(new Iceberg({
          id: 'ice_h_close',
          name: 'ICE-H-CLOSE',
          x: start.x + 250,
          y: start.y - 140,
          size: 80,
          vx: -0.5,
          vy: 0.5
        }));
        break;
      }

      case 'CLASS_I_SLOW_DOWN_BETTER': {
        // High-speed crossing hazard where slowing down allows safe pass
        icebergs.push(new Iceberg({
          id: 'ice_i_speed',
          name: 'ICE-I-SLOWDOWN',
          x: start.x + 500,
          y: start.y - 600,
          size: 60,
          vx: 0.2,
          vy: 3.5
        }));
        break;
      }

      case 'CLASS_J_TURN_BETTER': {
        // Wide crossing hazard where slight heading adjustment clears path cleanly
        icebergs.push(new Iceberg({
          id: 'ice_j_turn',
          name: 'ICE-J-TURN',
          x: start.x + 600,
          y: start.y - 300,
          size: 90,
          vx: -1.0,
          vy: 0.2
        }));
        break;
      }

      case 'CLASS_K_WORLD_WRAP_CROSSING': {
        // Ship near boundary, iceberg crossing x=0 / x=3600 boundary
        start = { x: 200, y: 1200, heading: 180 };
        destination = { x: 3400, y: 1200 };
        icebergs.push(new Iceberg({
          id: 'ice_k_wrap',
          name: 'ICE-K-WRAP',
          x: 50,
          y: 1200,
          size: 65,
          vx: -2.0,
          vy: 0
        }));
        break;
      }

      case 'CLASS_L_SAFE_VS_RISKY_CHOICE': {
        // Direct route blocked by cluster; detour route open
        icebergs.push(new Iceberg({
          id: 'ice_l_block1',
          name: 'ICE-L1',
          x: midX,
          y: midY,
          size: 80,
          vx: 0,
          vy: 0
        }));
        icebergs.push(new Iceberg({
          id: 'ice_l_block2',
          name: 'ICE-L2',
          x: midX + 60,
          y: midY - 90,
          size: 70,
          vx: 0,
          vy: 0
        }));
        break;
      }

      default:
        break;
    }

    // Verify initial ship position is not hard-blocked at start
    let attempts = 0;
    while (isHardBlocked(start.x, start.y, 0, icebergs) && attempts < 10) {
      start.x += 30;
      start.y += 30;
      attempts++;
    }

    return {
      seed,
      scenarioClass,
      start,
      destination,
      icebergs
    };
  }
}
