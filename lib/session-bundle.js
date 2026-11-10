'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SESSION_PREFIX = 'TALHA-MD~';
const MAX_BASE64_LENGTH = 52000;

function sanitizeFileName(name) {
    const base = path.basename(String(name || '')).trim();
    if (!base || base === '.' || base === '..') return null;
    if (!/^[a-zA-Z0-9._@-]+$/.test(base)) return null;
    if (!base.endsWith('.json')) return null;
    return base;
}

function getNumericKeyId(fileName, prefix) {
    const m = fileName.slice(prefix.length).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

function collectBundleFiles(sessionDir, { maxPreKeys = 60, maxSessions = 40, maxSenderKeys = 30 } = {}) {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return null;

    const allFiles = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const selected = {};

    selected['creds.json'] = fs.readFileSync(credsPath, 'utf8');

    const appStateFiles = allFiles.filter(f =>
        f.startsWith('app-state-sync-key-') || f.startsWith('app-state-sync-version-')
    );
    for (const f of appStateFiles) {
        selected[f] = fs.readFileSync(path.join(sessionDir, f), 'utf8');
    }

    const preKeys = allFiles
        .filter(f => f.startsWith('pre-key-'))
        .sort((a, b) => getNumericKeyId(b, 'pre-key-') - getNumericKeyId(a, 'pre-key-'))
        .slice(0, maxPreKeys);
    for (const f of preKeys) {
        selected[f] = fs.readFileSync(path.join(sessionDir, f), 'utf8');
    }

    if (maxSessions > 0) {
        const sessions = allFiles
            .filter(f => f.startsWith('session-'))
            .map(f => ({
                name: f,
                mtime: (() => { try { return fs.statSync(path.join(sessionDir, f)).mtimeMs; } catch { return 0; } })(),
            }))
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, maxSessions);
        for (const s of sessions) {
            selected[s.name] = fs.readFileSync(path.join(sessionDir, s.name), 'utf8');
        }
    }

    if (maxSenderKeys > 0) {
        const senderKeys = allFiles
            .filter(f => f.startsWith('sender-key-') && !f.startsWith('sender-key-memory-'))
            .slice(0, maxSenderKeys);
        for (const f of senderKeys) {
            selected[f] = fs.readFileSync(path.join(sessionDir, f), 'utf8');
        }
    }

    return selected;
}

function encodeSessionBundle(sessionDir, opts = {}) {
    const tries = [
        opts,
        { maxPreKeys: 35, maxSessions: 15, maxSenderKeys: 15 },
        { maxPreKeys: 20, maxSessions: 0, maxSenderKeys: 0 },
        { maxPreKeys: 0, maxSessions: 0, maxSenderKeys: 0 },
    ];

    for (const cfg of tries) {
        const files = collectBundleFiles(sessionDir, cfg);
        if (!files) return null;
        const payload = JSON.stringify({
            v: 2,
            createdAt: Date.now(),
            files,
        });
        const compressed = zlib.gzipSync(Buffer.from(payload, 'utf8'), { level: 9 });
        const b64 = compressed.toString('base64');
        if (b64.length <= MAX_BASE64_LENGTH || cfg.maxPreKeys === 0) {
            return `${SESSION_PREFIX}${b64}`;
        }
    }
    return null;
}

function decodeSessionBundle(sessionId) {
    const raw = String(sessionId || '').trim();
    if (!raw) throw new Error('Empty SESSION_ID');

    let b64 = raw;
    if (raw.includes('~')) {
        const parts = raw.split('~');
        b64 = parts.slice(1).join('~');
    }
    const cleanB64 = b64.replace(/\.{3}/g, '').replace(/\s+/g, '').trim();
    if (!cleanB64) throw new Error('SESSION_ID payload is empty');

    const buf = Buffer.from(cleanB64, 'base64');
    let text;
    try {
        text = zlib.gunzipSync(buf).toString('utf8');
    } catch {
        text = buf.toString('utf8');
    }

    const parsed = JSON.parse(text);
    if (parsed && parsed.v === 2 && parsed.files && typeof parsed.files === 'object') {
        const cleanFiles = {};
        for (const [k, v] of Object.entries(parsed.files)) {
            const safeName = sanitizeFileName(k);
            if (!safeName) continue;
            cleanFiles[safeName] = typeof v === 'string' ? v : JSON.stringify(v);
        }
        if (!cleanFiles['creds.json']) {
            throw new Error('Bundle v2 is missing creds.json');
        }
        JSON.parse(cleanFiles['creds.json']);
        return { version: 2, files: cleanFiles };
    }

    if (parsed && typeof parsed === 'object') {
        return {
            version: 1,
            files: { 'creds.json': JSON.stringify(parsed) },
        };
    }

    throw new Error('Invalid session JSON format');
}

function isV2SessionId(sessionId) {
    try {
        return Boolean(sessionId && decodeSessionBundle(sessionId).version === 2);
    } catch {
        return false;
    }
}

function restoreSessionToDir(sessionId, sessionDir, { overwrite = false, mergeAuxiliary = false } = {}) {
    if (!sessionDir) throw new Error('sessionDir is required');
    fs.mkdirSync(sessionDir, { recursive: true });
    const credsPath = path.join(sessionDir, 'creds.json');
    const decoded = decodeSessionBundle(sessionId);

    const credsExists = fs.existsSync(credsPath);
    if (credsExists && !overwrite && !mergeAuxiliary) {
        return { restored: false, reason: 'existing_creds', version: decoded.version, fileCount: 0 };
    }

    let fileCount = 0;
    for (const [name, content] of Object.entries(decoded.files)) {
        if (credsExists && !overwrite && name === 'creds.json') continue;
        const target = path.join(sessionDir, name);
        if (mergeAuxiliary && !overwrite && fs.existsSync(target)) continue;
        fs.writeFileSync(target, content, 'utf8');
        fileCount++;
    }

    return {
        restored: fileCount > 0,
        version: decoded.version,
        fileCount,
    };
}

function countPreKeyFiles(sessionDir) {
    try {
        if (!fs.existsSync(sessionDir)) return 0;
        return fs.readdirSync(sessionDir).filter(f => f.startsWith('pre-key-') && f.endsWith('.json')).length;
    } catch {
        return 0;
    }
}

async function ensurePreKeys(sock, sessionDir, { minPreKeys = 5, uploadCount = 30, saveCreds = null, logger = console } = {}) {
    const count = countPreKeyFiles(sessionDir);
    if (count >= minPreKeys) {
        return { uploaded: false, existing: count };
    }
    if (typeof sock?.uploadPreKeys !== 'function') {
        return { uploaded: false, existing: count, reason: 'no_uploadPreKeys' };
    }
    try {
        await sock.uploadPreKeys(uploadCount);
        if (typeof saveCreds === 'function') {
            await Promise.resolve(saveCreds()).catch(() => {});
        }
        const after = countPreKeyFiles(sessionDir);
        logger?.info?.(`[Session] Uploaded ${uploadCount} fresh pre-keys (disk pre-keys: ${count} -> ${after})`)
            || console.log(`[Session] Uploaded ${uploadCount} fresh pre-keys (disk pre-keys: ${count} -> ${after})`);
        return { uploaded: true, before: count, after };
    } catch (e) {
        return { uploaded: false, existing: count, error: e.message };
    }
}

async function backupSessionToDb(sessionDir, dbMod = null) {
    try {
        const db = dbMod || require('./database');
        const bundle = encodeSessionBundle(sessionDir, { maxPreKeys: 60, maxSessions: 40, maxSenderKeys: 30 });
        if (!bundle) return false;
        let meId = '';
        try {
            const creds = JSON.parse(fs.readFileSync(path.join(sessionDir, 'creds.json'), 'utf8'));
            meId = creds?.me?.id || '';
        } catch {}
        await db.setUserSetting({
            jid: 'bot:main_session',
            key: 'session_bundle_v2',
            value: { meId, bundle, updatedAt: Date.now() },
        });
        return true;
    } catch {
        return false;
    }
}

async function restoreSessionFromDb(sessionDir, dbMod = null) {
    try {
        const db = dbMod || require('./database');
        const saved = await db.getUserSetting({ jid: 'bot:main_session', key: 'session_bundle_v2', fallback: null });
        if (!saved?.bundle) return { restored: false, reason: 'none_in_db' };

        const credsPath = path.join(sessionDir, 'creds.json');
        if (fs.existsSync(credsPath)) {
            let diskMe = '';
            try { diskMe = JSON.parse(fs.readFileSync(credsPath, 'utf8'))?.me?.id || ''; } catch {}
            if (diskMe && saved.meId && diskMe !== saved.meId) {
                return { restored: false, reason: 'me_mismatch' };
            }
            // Merge missing pre-keys / app-state keys without clobbering existing files
            return restoreSessionToDir(saved.bundle, sessionDir, { overwrite: false, mergeAuxiliary: true });
        }
        return restoreSessionToDir(saved.bundle, sessionDir, { overwrite: true });
    } catch (e) {
        return { restored: false, reason: e.message };
    }
}

module.exports = {
    SESSION_PREFIX,
    collectBundleFiles,
    encodeSessionBundle,
    decodeSessionBundle,
    isV2SessionId,
    restoreSessionToDir,
    countPreKeyFiles,
    ensurePreKeys,
    backupSessionToDb,
    restoreSessionFromDb,
};
