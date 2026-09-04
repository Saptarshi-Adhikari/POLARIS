export class PerformanceMonitor {
    constructor() {
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.fps = 0;
        this.timings = {
            physics: [],
            rendering: [],
            routePlanning: []
        };
        this.budgets = {
            physics: 1,
            rendering: 16,
            routePlanning: 50
        };
    }
    
    startFrame() {
        this.frameStart = performance.now();
    }
    
    endFrame() {
        this.frameCount++;
        const now = performance.now();
        
        // Update FPS every second
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            
            if (this.fps < 50) {
                console.warn(`[Perf] FPS dropped to ${this.fps}`);
            }
        }
    }
    
    timeFunction(name, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        
        if (!this.timings[name]) {
            this.timings[name] = [];
        }
        this.timings[name].push(duration);
        if (this.timings[name].length > 100) {
            this.timings[name].shift(); // Keep last 100 samples
        }
        
        const budget = this.budgets[name];
        if (budget && duration > budget) {
            console.warn(`[Perf] ${name} took ${duration.toFixed(2)}ms (budget: ${budget}ms)`);
        }
        
        return result;
    }
    
    getAverage(name) {
        const timings = this.timings[name];
        if (!timings || timings.length === 0) return 0;
        return timings.reduce((a, b) => a + b, 0) / timings.length;
    }
    
    getStats() {
        return {
            fps: this.fps,
            avgPhysics: this.getAverage('physics'),
            avgRendering: this.getAverage('rendering'),
            avgRoutePlanning: this.getAverage('routePlanning')
        };
    }
}

// Export singleton
export const perfMonitor = new PerformanceMonitor();
