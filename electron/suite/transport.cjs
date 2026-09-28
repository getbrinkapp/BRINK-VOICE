// Local-only workspace launch protocol. No media, paths, code or credentials cross it.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const VERSION = 1;
const MAX_BYTES = 4096;

function address(appRoot, profile = '') {
    const key = crypto.createHash('sha256').update(path.resolve(appRoot) + '\0' + profile).digest('hex').slice(0, 24);
    const owner = process.getuid?.() ?? crypto.createHash('sha256').update(os.homedir()).digest('hex').slice(0, 12);
    // macOS socket paths have a short length limit; its per-user TMPDIR is too long.
    const directory = path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', `brink-suite-${owner}`);
    return { directory, registry: path.join(directory, `${key}.json`), socket: process.platform === 'win32' ? `\\\\.\\pipe\\brink-suite-${owner}-${key}` : path.join(directory, `${key}.sock`) };
}

async function privateDirectory(directory) {
    await fs.mkdir(directory, { mode: 0o700, recursive: true });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw Error('Unsafe launch directory');
}

function validRequest(request, tools) {
    return request && typeof request === 'object' && !Array.isArray(request)
        && Object.keys(request).every(key => ['tool', 'intent', 'projectId', 'documentId', 'assetId'].includes(key))
        && tools.includes(request.tool) && ['open', 'create'].includes(request.intent)
        && ['projectId', 'documentId', 'assetId'].every(key => request[key] === null || (typeof request[key]==='string' && /^[a-zA-Z0-9-]{1,128}$/.test(request[key])))
        && (!(request.documentId || request.assetId) || Boolean(request.projectId));
}

async function connect(appRoot, message, { profile = '', timeout = 20000 } = {}) {
    const location = address(appRoot, profile);
    await privateDirectory(location.directory);
    const stat = await fs.lstat(location.registry);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES || (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o077)))) throw Error('Unsafe launch registry');
    const registry = JSON.parse(await fs.readFile(location.registry, 'utf8'));
    if (registry.version !== VERSION || typeof registry.token !== 'string' || !/^[a-f0-9]{64}$/.test(registry.token)) throw Error('Unsupported launch protocol');
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(location.socket);
        let bytes = '';
        const timer = setTimeout(() => socket.destroy(Error('Launch timed out')), timeout);
        socket.on('connect', () => socket.write(JSON.stringify({ ...message, version: VERSION, token: registry.token }) + '\n'));
        socket.on('data', chunk => {
            bytes += chunk.toString();
            if (Buffer.byteLength(bytes) > MAX_BYTES) return socket.destroy(Error('Oversized reply'));
            if (!bytes.includes('\n')) return;
            try { resolve(JSON.parse(bytes.split('\n')[0])); socket.end(); }
            catch { socket.destroy(Error('Invalid reply')); }
        });
        socket.on('error', reject);
        socket.on('close', () => { clearTimeout(timer); reject(Error('Launch connection closed')); });
    });
}

async function listen({ appRoot, profile = '', tools, launch }) {
    const location = address(appRoot, profile);
    await privateDirectory(location.directory);
    // Caller owns Electron's single-instance lock for this application/profile.
    if (process.platform !== 'win32') await fs.unlink(location.socket).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const token = crypto.randomBytes(32).toString('hex');
    const sockets = new Set();
    const server = net.createServer(socket => {
        sockets.add(socket); socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {}); socket.setTimeout(25000, () => socket.destroy());
        let bytes = '', handled = false;
        socket.on('data', async chunk => {
            if (handled) return;
            bytes += chunk.toString();
            if (Buffer.byteLength(bytes) > MAX_BYTES) { handled = true; socket.destroy(); return; }
            if (!bytes.includes('\n')) return;
            handled = true;
            let result = { ok: false, code: 'invalid_request' };
            try {
                const packet = JSON.parse(bytes.split('\n')[0]);
                if (packet.version !== VERSION || packet.token !== token) result = { ok: false, code: 'untrusted_sender' };
                else if (packet.type === 'ping') result = { ok: true, version: VERSION, pid: process.pid, tools };
                else if (packet.type === 'launch' && validRequest(packet.context, tools)) result = await launch(packet.context);
            } catch { result = { ok: false, code: 'launch_failed' }; }
            if (!socket.destroyed) socket.end(JSON.stringify(result) + '\n');
        });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(location.socket, resolve); });
    server.on('error', () => {});
    if (process.platform !== 'win32') await fs.chmod(location.socket, 0o600);
    const temporary = location.registry + '.' + token.slice(0, 16);
    await fs.writeFile(temporary, JSON.stringify({ version: VERSION, token }), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, location.registry);
    return async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
        try {
            if (JSON.parse(await fs.readFile(location.registry, 'utf8')).token === token) await fs.unlink(location.registry);
        } catch {}
    };
}

module.exports = { VERSION, address, privateDirectory, validRequest, connect, listen };
