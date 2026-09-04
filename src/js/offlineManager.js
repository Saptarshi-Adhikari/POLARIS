export class OfflineManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.requestQueue = [];
        
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }
    
    handleOffline() {
        this.isOnline = false;
        console.warn('[OfflineManager] Network disconnected - using offline mode');
        this.showOfflineIndicator();
    }
    
    handleOnline() {
        this.isOnline = true;
        console.info('[OfflineManager] Network reconnected');
        this.hideOfflineIndicator();
        this.flushQueue();
    }
    
    async queueRequest(requestFn) {
        if (this.isOnline) {
            return await requestFn();
        } else {
            // Queue for later retry
            return new Promise((resolve) => {
                this.requestQueue.push({ requestFn, resolve });
            });
        }
    }
    
    async flushQueue() {
        while (this.requestQueue.length > 0) {
            const { requestFn, resolve } = this.requestQueue.shift();
            try {
                const result = await requestFn();
                resolve(result);
            } catch (err) {
                console.error('[OfflineManager] Queued request failed:', err);
            }
        }
    }
    
    showOfflineIndicator() {
        let indicator = document.getElementById('offline-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'offline-indicator';
            indicator.textContent = '⚠ OFFLINE MODE';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #f59e0b;
                color: white;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: bold;
                z-index: 10000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(indicator);
        }
        indicator.style.display = 'block';
    }
    
    hideOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
}

// Export singleton
export const offlineManager = new OfflineManager();
