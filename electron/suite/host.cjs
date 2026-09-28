// Distributed unchanged to the three Creative repositories by suite:sync.
// This is a launch bridge, not BRINK Core, a filesystem API or license authority.
const { app, ipcMain } = require('electron');
const { randomUUID } = require('node:crypto');
const { listen } = require('./transport.cjs');

function registerCreativeHost({ tools, getWindow, createWindow, trustedURL }) {
    const ready = new WeakSet();
    const pending = new Map();
    app.on('web-contents-created', (_event, contents) => {
        contents.on('did-start-loading', () => ready.delete(contents));
        contents.on('render-process-gone', () => {
            ready.delete(contents);
            for (const entry of pending.values()) if (entry.sender === contents) entry.finish({ ok: false, code: 'launch_failed' });
        });
    });
    let queue = Promise.resolve(), cleanup;
    const trusted = event => {
        const window = getWindow();
        return window && !window.isDestroyed() && event.sender === window.webContents
            && event.senderFrame === window.webContents.mainFrame && trustedURL(event.senderFrame.url);
    };
    const core=require('./core-bridge.cjs').createCoreBridge({tools,trusted,getWindow});
    ipcMain.on('brink-suite:ready', event => { if (trusted(event)) ready.add(event.sender); });
    ipcMain.on('brink-suite:result', (event, id, result) => {
        if (!trusted(event)) return;
        const entry = pending.get(id);
        if (!entry || entry.sender !== event.sender) return;
        const code = ['busy', 'cancelled', 'launch_failed'].includes(result?.code) ? result.code : 'launch_failed';
        entry.finish(result?.ok === true ? { ok: true } : { ok: false, code });
    });
    async function launch(context) {
        try { await core.authorize(context.tool,true); } catch { return {ok:false,code:'creative_license_required'}; }
        let window = getWindow();
        if (!window || window.isDestroyed()) { await createWindow(); window = getWindow(); }
        if (!window || window.isDestroyed()) return { ok: false, code: 'launch_failed' };
        const contents = window.webContents;
        const deadline = Date.now() + 15000;
        while (!ready.has(contents)) {
            if (contents.isDestroyed() || Date.now() > deadline) return { ok: false, code: 'launch_failed' };
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (window.isMinimized()) window.restore();
        window.show(); window.focus();
        return new Promise(resolve => {
            const id = randomUUID();
            const finish = result => { clearTimeout(timer); pending.delete(id); resolve(result); };
            const timer = setTimeout(() => finish({ ok: false, code: 'launch_failed' }), 15000);
            pending.set(id, { sender: contents, finish });
            contents.send('brink-suite:launch', { id, context });
        });
    }
    const start = async () => {
        cleanup = await listen({ appRoot: app.getAppPath(), profile: process.env.BRINK_SUITE_PROFILE || '', tools,
            launch(context) {
                // Five buttons can address the same process; never race a document save.
                const next = queue.then(() => launch(context));
                queue = next.catch(() => {});
                return next;
            }
        });
    };
    app.on('will-quit', () => { void cleanup?.(); });
    return { start, core };
}
module.exports = { registerCreativeHost };
