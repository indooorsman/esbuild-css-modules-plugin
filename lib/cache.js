const cacheHolder = { cache: new Map() };

module.exports = {
  get(key) {
    const ref = cacheHolder.cache.get(key);
    if (ref) {
      return ref.deref();
    }
  },
  set(key, data) {
    const wr = new WeakRef(data);
    cacheHolder.cache.set(key, wr);
  },
  clear() {
    cacheHolder.cache.clear();
  }
};
