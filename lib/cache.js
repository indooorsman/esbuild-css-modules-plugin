const { readFile } = require('fs/promises');
class BuildCache {
  /**
   * @param {(...args: any[]) => void} log
   */
  constructor(log) {
    this.log = log || ((...args) => console.log(...args));
    /**
     * @type {Map<string, {result: import('esbuild').OnLoadResult; input: string}}
     */
    this.cache = new Map();
  }
  /**
   * @description key should be absolute path
   * @param {string} key
   * @returns {Promise<import('esbuild').OnLoadResult|void>}
   */
  async get(key) {
    const cachedData = this.cache.get(key);
    if (cachedData) {
      this.log(`find cache data, check if input changed(${key})...`);
      const input = await readFile(key, { encoding: 'utf8' });
      if (input === cachedData.input) {
        this.log(`input not changed, return cache(${key})`);
        return cachedData.result;
      }
      this.log(`input changed(${key})`);
      return void 0;
    }
    this.log(`cache data not found(${key})`);
    return void 0;
  }
  /**
   * @description key should be absolute path
   * @param {string} key
   * @param {import('esbuild').OnLoadResult} result
   * @param {string} originContent
   * @returns {Promise<void>}
   */
  async set(key, result, originContent) {
    const m = process.memoryUsage.rss();
    if (m / 1024 / 1024 > 250) {
      this.log('memory usage > 250M');
      this.clear();
    }
    const input = originContent || (await readFile(key, { encoding: 'utf8' }));
    this.cache.set(key, { input, result });
  }
  clear() {
    this.log('clear cache');
    this.cache.clear();
  }
}

module.exports = BuildCache;
