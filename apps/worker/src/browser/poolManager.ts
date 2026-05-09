import { chromium, Browser } from 'playwright';

// Stealth args to make browser undetectable by reCAPTCHA
const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--window-size=1280,720',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

export interface PoolConfig {
  maxInstances: number;
  headless: boolean;
}

export class BrowserPoolManager {
  private pool: Browser[] = [];
  private available: Browser[] = [];
  private waiting: Array<(browser: Browser) => void> = [];
  private initialized = false;

  constructor(private config: PoolConfig) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    for (let i = 0; i < this.config.maxInstances; i++) {
      const browser = await this.launchBrowser();
      this.pool.push(browser);
      this.available.push(browser);
    }

    this.initialized = true;
    console.log(`Browser pool initialized with ${this.config.maxInstances} instances`);
  }

  async acquire(): Promise<Browser> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.available.length > 0) {
      return this.available.pop()!;
    }

    // Wait for a browser to become available
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  async release(browser: Browser): Promise<void> {
    // Check browser health
    if (!browser.isConnected()) {
      const index = this.pool.indexOf(browser);
      if (index !== -1) {
        const newBrowser = await this.launchBrowser();
        this.pool[index] = newBrowser;
        browser = newBrowser;
      }
    }

    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve(browser);
    } else {
      this.available.push(browser);
    }
  }

  async shutdown(): Promise<void> {
    for (const browser of this.pool) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors during shutdown
      }
    }
    this.pool = [];
    this.available = [];
    this.initialized = false;
    console.log('Browser pool shut down');
  }

  getStats() {
    return {
      total: this.pool.length,
      available: this.available.length,
      inUse: this.pool.length - this.available.length,
      waiting: this.waiting.length,
    };
  }

  private async launchBrowser(): Promise<Browser> {
    return chromium.launch({
      headless: this.config.headless,
      args: STEALTH_ARGS,
    });
  }
}
