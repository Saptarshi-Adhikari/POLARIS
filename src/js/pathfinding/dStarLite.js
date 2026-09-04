/**
 * D* Lite Incremental Search Algorithm (Phase 9)
 *
 * Based on: Likhachev, S., Gordon, G., & Thrun, S. (2005). "D* Lite."
 * Key insight: When edge costs change (e.g., moving icebergs), only update affected
 * vertices instead of replanning from scratch (10-100x faster than A*).
 */

export class DStarLite {
  constructor(gridWidth, gridHeight) {
    this.width = gridWidth;
    this.height = gridHeight;

    this.grid = [];  // 0 = free, 1 = obstacle
    this.g = [];     // Cost from start
    this.rhs = [];   // One-step lookahead cost
    this.keys = [];  // Priority queue keys

    this.start = { x: 0, y: 0 };
    this.goal = { x: 0, y: 0 };

    this.openSet = [];

    this.k_m = 0;
    this.s_last = null;

    this.stats = {
      expansions: 0,
      replanTime: 0,
      isIncremental: false
    };

    this.initializeGrid();
  }

  initializeGrid() {
    for (let x = 0; x < this.width; x++) {
      this.grid[x] = [];
      this.g[x] = [];
      this.rhs[x] = [];
      this.keys[x] = [];

      for (let y = 0; y < this.height; y++) {
        this.grid[x][y] = 0;
        this.g[x][y] = Infinity;
        this.rhs[x][y] = Infinity;
        this.keys[x][y] = { k1: Infinity, k2: Infinity };
      }
    }
  }

  calculateKey(node) {
    const g = this.g[node.x][node.y];
    const rhs = this.rhs[node.x][node.y];
    const h = this.heuristic(node, this.start);

    return {
      k1: Math.min(g, rhs) + h + this.k_m,
      k2: Math.min(g, rhs)
    };
  }

  heuristic(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getNeighbors(node) {
    const neighbors = [];
    const directions = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: 1, y: 1 }
    ];

    for (const dir of directions) {
      const nx = node.x + dir.x;
      const ny = node.y + dir.y;

      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        if (this.grid[nx][ny] === 0) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }

    return neighbors;
  }

  edgeCost(from, to) {
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  updateVertex(node) {
    if (this.equalNodes(node, this.goal)) {
      this.rhs[node.x][node.y] = 0;
    } else {
      let minCost = Infinity;
      const neighbors = this.getNeighbors(node);

      for (const neighbor of neighbors) {
        const cost = this.edgeCost(node, neighbor) + this.g[neighbor.x][neighbor.y];
        minCost = Math.min(minCost, cost);
      }

      this.rhs[node.x][node.y] = minCost;
    }

    this.removeFromOpenSet(node);

    if (this.rhs[node.x][node.y] !== this.g[node.x][node.y]) {
      this.keys[node.x][node.y] = this.calculateKey(node);
      this.insertIntoOpenSet(node, this.keys[node.x][node.y]);
    }
  }

  initialize(start, goal) {
    this.start = { x: Math.max(0, Math.min(this.width - 1, start.x)), y: Math.max(0, Math.min(this.height - 1, start.y)) };
    this.goal = { x: Math.max(0, Math.min(this.width - 1, goal.x)), y: Math.max(0, Math.min(this.height - 1, goal.y)) };

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        this.g[x][y] = Infinity;
        this.rhs[x][y] = Infinity;
        this.keys[x][y] = { k1: Infinity, k2: Infinity };
      }
    }

    this.rhs[this.goal.x][this.goal.y] = 0;
    this.keys[this.goal.x][this.goal.y] = this.calculateKey(this.goal);

    this.openSet = [];
    this.insertIntoOpenSet(this.goal, this.keys[this.goal.x][this.goal.y]);

    this.k_m = 0;
    this.s_last = { ...this.start };
    this.stats.expansions = 0;
  }

  computeShortestPath() {
    const startTime = performance.now();
    let maxSteps = 5000;

    while (this.openSet.length > 0 && maxSteps-- > 0) {
      const s = this.openSet[0];
      const keyS = this.keys[s.x][s.y];

      if (keyS.k1 >= this.calculateKey(this.s_last).k1 &&
          this.rhs[this.s_last.x][this.s_last.y] === this.g[this.s_last.x][this.s_last.y]) {
        break;
      }

      this.openSet.shift();

      const gOld = this.g[s.x][s.y];

      if (gOld > this.rhs[s.x][s.y]) {
        this.g[s.x][s.y] = this.rhs[s.x][s.y];
      } else {
        this.g[s.x][s.y] = Infinity;
        this.updateVertex(s);
      }

      const neighbors = this.getNeighbors(s);
      for (const neighbor of neighbors) {
        this.updateVertex(neighbor);
      }

      this.stats.expansions++;
    }

    this.stats.replanTime = performance.now() - startTime;
    this.stats.isIncremental = true;
  }

  extractPath() {
    const path = [];
    let current = { ...this.start };

    path.push({ x: current.x, y: current.y });

    let maxSteps = 500;
    while (!this.equalNodes(current, this.goal) && maxSteps-- > 0) {
      const neighbors = this.getNeighbors(current);
      let minNode = null;
      let minCost = Infinity;

      for (const neighbor of neighbors) {
        const cost = this.edgeCost(current, neighbor) + this.g[neighbor.x][neighbor.y];
        if (cost < minCost) {
          minCost = cost;
          minNode = neighbor;
        }
      }

      if (minNode === null || minCost === Infinity) {
        return null;
      }

      current = minNode;
      path.push({ x: current.x, y: current.y });
    }

    return path;
  }

  updateGraph(changedEdges) {
    const startTime = performance.now();

    this.k_m += this.heuristic(this.s_last, this.start);
    this.s_last = { ...this.start };

    for (const edge of changedEdges) {
      const { x, y, newCost } = edge;

      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        this.grid[x][y] = newCost > 0 ? 1 : 0;
        this.updateVertex({ x, y });

        const neighbors = this.getNeighbors({ x, y });
        for (const neighbor of neighbors) {
          this.updateVertex(neighbor);
        }
      }
    }

    this.computeShortestPath();
    this.stats.replanTime = performance.now() - startTime;
  }

  insertIntoOpenSet(node, key) {
    let i = 0;
    while (i < this.openSet.length && this.keys[this.openSet[i].x][this.openSet[i].y].k1 <= key.k1) {
      i++;
    }
    this.openSet.splice(i, 0, { ...node });
  }

  removeFromOpenSet(node) {
    const index = this.openSet.findIndex(n => n.x === node.x && n.y === node.y);
    if (index !== -1) {
      this.openSet.splice(index, 1);
    }
  }

  equalNodes(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  getStats() {
    return {
      expansions: this.stats.expansions,
      replanTime: this.stats.replanTime,
      isIncremental: this.stats.isIncremental
    };
  }
}

export function createDStarLite(width, height) {
  return new DStarLite(width, height);
}
