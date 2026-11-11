'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const v8 = require('v8');
const { AsyncLocalStorage } = require('async_hooks');

const slotStorage = new AsyncLocalStorage();
const pressureHooks = new Set();

let _cachedLimitBytes = null;
let _lastGcAt = 0;

function readCgroupMemoryLimitBytes() {
    if (process.env.MEMORY_LIMIT_MB) {
        const mb = Number(process.env.MEMORY_LIMIT_MB);
        if (Number.isFinite(mb) && mb >= 64) return mb * 1024 * 1024;
    }

    const candidates = [
        '/sys/fs/cgroup/memory.max',
        '/sys/fs/cgroup/memory/memory.limit_in_bytes',
    ];
    for (const file of candidates) {
        try {
            if (!fs.existsSync(file)) continue;
            const raw = fs.readFileSync(file, 'utf8').trim();
            if (!raw || raw === 'max') continue;
            const bytes = Number(raw);
            // Ignore kernel "unlimited" sentinel values (~2^63 or multi-TB)
            if (Number.isFinite(bytes) && bytes >= 64 * 1024 * 1024 && bytes < 1024 * 1024 * 1024 * 1024) {
                return bytes;
            }
        } catch { /* ignore */ }
    }

    if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.DYNO) {
        return 512 * 1024 * 1024;
    }
    return os.totalmem();
}

function getMemoryLimitBytes() {
    if (_cachedLimitBytes === null) {
        _cachedLimitBytes = readCgroupMemoryLimitBytes();
    }
    return _cachedLimitBytes;
}

function isLowMemoryHost() {
    return getMemoryLimitBytes() <= 768 * 1024 * 1024;
}

function getMaxMediaMB() {
    const envMb = Number(process.env.MAX_MEDIA_MB);
    if (Number.isFinite(envMb) && envMb >= 5) return envMb;
    return isLowMemoryHost() ? 30 : 48;
}

function getMaxMediaBytes() {
    return getMaxMediaMB() * 1024 * 1024;
}

function getMaxImageBytes() {
    return (isLowMemoryHost() ? 10 : 16) * 1024 * 1024;
}

function getMemoryStats() {
    const mem = process.memoryUsage();
    const heapLimitBytes = v8.getHeapStatistics().heap_size_limit || 0;
    const containerLimitBytes = getMemoryLimitBytes();
    const toMB = b => Number((b / (1024 * 1024)).toFixed(1));
    const rssMB = toMB(mem.rss);
    const containerLimitMB = toMB(containerLimitBytes);
    const usedPct = containerLimitMB > 0
        ? Number(((rssMB / containerLimitMB) * 100).toFixed(1))
        : 0;
    return {
        rssMB,
        heapUsedMB: toMB(mem.heapUsed),
        heapTotalMB: toMB(mem.heapTotal),
        externalMB: toMB(mem.external || 0),
        arrayBuffersMB: toMB(mem.arrayBuffers || 0),
        heapLimitMB: toMB(heapLimitBytes),
        containerLimitMB,
        usedPct,
    };
}

function configureSharpLowMem(sharpMod) {
    try {
        let s = sharpMod;
        if (!s) {
            const resolved = require.resolve('sharp');
            if (!require.cache[resolved]) return false;
            s = require.cache[resolved].exports;
        }
        if (typeof s?.cache === 'function') s.cache(false);
        if (typeof s?.concurrency === 'function') s.concurrency(1);
        return true;
    } catch {
        return false;
    }
}

// Re-entrant FIFO async semaphore so heavy media jobs never stack in parallel on 512 MB RAM
let _activeMedia = 0;
const _mediaQueue = [];

function getMaxConcurrentMedia() {
    const envVal = Number(process.env.MAX_CONCURRENT_MEDIA);
    if (Number.isFinite(envVal) && envVal >= 1) return Math.floor(envVal);
    return isLowMemoryHost() ? 1 : 2;
}

function withMediaSlot(fn) {
    if (slotStorage.getStore() === true) {
        return Promise.resolve().then(fn);
    }

    const limit = getMaxConcurrentMedia();
    const acquire = () => {
        if (_activeMedia < limit) {
            _activeMedia++;
            return Promise.resolve();
        }
        return new Promise(resolve => _mediaQueue.push(resolve));
    };

    return acquire().then(async () => {
        try {
            return await slotStorage.run(true, fn);
        } finally {
            _activeMedia = Math.max(0, _activeMedia - 1);
            if (_mediaQueue.length > 0 && _activeMedia < getMaxConcurrentMedia()) {
                const next = _mediaQueue.shift();
                _activeMedia++;
                next();
            }
            maybeFreeMemory();
        }
    });
}

function getMediaSlotState() {
    return { active: _activeMedia, queued: _mediaQueue.length, limit: getMaxConcurrentMedia() };
}

function setBounded(map, key, value, maxSize) {
    if (!map || maxSize < 1) return;
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    while (map.size > maxSize) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
    }
}

function pruneMapByTtlAndMax(map, { maxSize = 500, ttlMs = 0, tsField = 'timestamp', now = Date.now() } = {}) {
    if (!map || !(map instanceof Map)) return 0;
    let removed = 0;
    if (ttlMs > 0) {
        for (const [k, v] of map.entries()) {
            const ts = typeof v === 'number' ? v : (v && typeof v === 'object' ? (v[tsField] || 0) : 0);
            if (ts && now - ts > ttlMs) {
                map.delete(k);
                removed++;
            }
        }
    }
    while (map.size > maxSize) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
        removed++;
    }
    return removed;
}

function registerPressureCleanup(fn) {
    if (typeof fn === 'function') pressureHooks.add(fn);
    return () => pressureHooks.delete(fn);
}

function maybeFreeMemory(thresholdMB) {
    const stats = getMemoryStats();
    const triggerMB = thresholdMB || Math.min(340, Math.round(stats.containerLimitMB * 0.65));
    if (stats.rssMB < triggerMB) return false;

    configureSharpLowMem();
    const now = Date.now();
    if (now - _lastGcAt < 10000) return false;
    _lastGcAt = now;

    for (const hook of pressureHooks) {
        try { hook(stats); } catch { /* ignore */ }
    }
    if (typeof global.gc === 'function') {
        try { global.gc(); } catch { /* ignore */ }
    }
    return true;
}

async function streamUrlToTempFile(url, {
    maxBytes = getMaxMediaBytes(),
    timeoutMs = 35000,
    headers = {},
    ext = 'bin',
    prefix = 'talha_dl',
    minBytes = 1024,
} = {}) {
    const axios = require('axios');
    const cleanExt = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filePath = path.join(os.tmpdir(), `${prefix}_${uid}.${cleanExt}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    const cleanup = () => {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
    };

    try {
        const res = await axios.get(url, {
            responseType: 'stream',
            timeout: timeoutMs,
            signal: controller.signal,
            maxRedirects: 6,
            headers,
            validateStatus: s => s >= 200 && s < 400,
        });

        const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
        if (ctype.includes('text/html') || ctype.includes('application/json') || ctype.includes('text/plain')) {
            res.data?.destroy?.();
            throw new Error(`Unexpected content-type: ${ctype}`);
        }

        const contentLen = Number(res.headers?.['content-length'] || 0);
        if (contentLen > 0 && contentLen > maxBytes) {
            res.data?.destroy?.();
            throw new Error(`Media too large (${Math.round(contentLen / 1048576)}MB > ${Math.round(maxBytes / 1048576)}MB limit)`);
        }

        let totalBytes = 0;
        let checkedHeader = false;

        await new Promise((resolve, reject) => {
            const ws = fs.createWriteStream(filePath);
            let settled = false;
            const fail = (err) => {
                if (settled) return;
                settled = true;
                try { res.data?.destroy?.(); } catch {}
                try { ws.destroy(); } catch {}
                reject(err);
            };

            ws.on('error', fail);
            res.data.on('error', fail);
            res.data.on('data', (chunk) => {
                totalBytes += chunk.length;
                if (!checkedHeader) {
                    checkedHeader = true;
                    const head = chunk.slice(0, 64).toString('utf8').trim().toLowerCase();
                    if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{')) {
                        return fail(new Error('HTML/JSON error payload returned instead of media'));
                    }
                }
                if (totalBytes > maxBytes) {
                    return fail(new Error(`Media exceeds ${Math.round(maxBytes / 1048576)}MB limit`));
                }
            });

            ws.on('finish', () => {
                if (settled) return;
                settled = true;
                resolve();
            });

            res.data.pipe(ws);
        });

        if (totalBytes < minBytes) {
            throw new Error(`Downloaded media too small (${totalBytes} bytes)`);
        }

        return { filePath, size: totalBytes, contentType: ctype, cleanup };
    } catch (err) {
        cleanup();
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function cleanTempFiles(dirs = [], { maxAgeMs = 10 * 60 * 1000, prefixes = null } = {}) {
    const now = Date.now();
    let removed = 0;
    for (const dir of dirs) {
        try {
            if (!dir || !fs.existsSync(dir)) continue;
            for (const name of fs.readdirSync(dir)) {
                if (Array.isArray(prefixes) && prefixes.length && !prefixes.some(p => name.startsWith(p))) {
                    continue;
                }
                const full = path.join(dir, name);
                try {
                    const st = fs.statSync(full);
                    if (st.isFile() && (now - st.mtimeMs >= maxAgeMs)) {
                        fs.unlinkSync(full);
                        removed++;
                    }
                } catch { /* ignore locked/transient file */ }
            }
        } catch { /* ignore dir errors */ }
    }
    return removed;
}

module.exports = {
    getMemoryLimitBytes,
    isLowMemoryHost,
    getMaxMediaMB,
    getMaxMediaBytes,
    getMaxImageBytes,
    getMemoryStats,
    configureSharpLowMem,
    withMediaSlot,
    getMediaSlotState,
    setBounded,
    pruneMapByTtlAndMax,
    registerPressureCleanup,
    maybeFreeMemory,
    streamUrlToTempFile,
    cleanTempFiles,
};

