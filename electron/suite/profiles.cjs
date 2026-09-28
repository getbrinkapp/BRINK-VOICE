// Shared by BRINK and the native editors. Only saved work is portable; never
// copy Electron sessions, account tokens, license state, caches or executables.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const GROUPS = Object.freeze({
    'ISO-PIXEL-VECTOR': { fallback: 'BRINK Graphic Picture Editor Dev', parts: ['workspace'] },
    CINE: { fallback: 'BRINK Videoeditor', parts: ['CoreDocuments'] },
    VOICE: { fallback: 'VOICE', parts: ['Recordings', 'Transcripts', 'library.json'] }
});
const PORTABLE = '.creative';
const BUSY = 'Bitte alle Creative-Anwendungen speichern und vollständig schließen. Während einer Sicherung oder Wiederherstellung können sie nicht gestartet werden.';

function inside(file, root) {
    const relative = path.relative(path.resolve(root), path.resolve(file));
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function plain(file, optional = false) {
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw Error('Nicht unterstützte Verknüpfung oder Spezialdatei: ' + path.basename(file));
    return stat;
}
function read(file, optional = false) {
    const stat = plain(file, optional);
    if (!stat) return null;
    if (!stat.isFile() || stat.size > 64 * 1024) throw Error('Ungültige Creative-Konfiguration.');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function workspace(coreProfile, documents) {
    const value = read(path.join(coreProfile, 'workspace-location.json'), true);
    if (value && (typeof value.path !== 'string' || !path.isAbsolute(value.path) || path.parse(value.path).root === value.path)) throw Error('Ungültiger BRINK-Speicherort.');
    return value?.path || path.join(documents, 'brink');
}
function portableManifest(root) {
    plain(path.join(root, PORTABLE), true);
    const manifest = read(path.join(root, PORTABLE, 'manifest.json'), true);
    if (!manifest) return null;
    if (manifest.version !== 1 || !Array.isArray(manifest.groups) || new Set(manifest.groups).size !== manifest.groups.length || manifest.groups.some(group => !Object.hasOwn(GROUPS, group))) throw Error('Ungültige Creative-Sicherung.');
    return manifest;
}
function restoredProfile(root, group) {
    if (!Object.hasOwn(GROUPS, group)) throw Error('Unbekannte Creative-Anwendung.');
    if (!portableManifest(root)?.groups.includes(group)) return '';
    for (const relative of [PORTABLE, PORTABLE + '/profiles', PORTABLE + '/profiles/' + group]) {
        if (!plain(path.join(root, relative))?.isDirectory()) throw Error('Creative-Arbeitsdaten fehlen.');
    }
    return path.join(root, PORTABLE, 'profiles', group);
}
function savedProfiles(root, appData) {
    return Object.fromEntries(Object.entries(GROUPS).map(([group, info]) => [group, restoredProfile(root, group) || path.join(appData, info.fallback)]));
}
function alive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Ungültige Creative-Prozesssperre.');
    try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; if (error.code === 'EPERM') return true; throw error; }
}
function active(file) {
    const value = read(file, true);
    if (!value) return false;
    if (alive(value.pid)) return true;
    fs.unlinkSync(file);
    return false;
}
function runtime(coreProfile) {
    const directory = path.join(coreProfile, 'creative-runtime');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!plain(directory).isDirectory()) throw Error('Ungültiger Creative-Speicherort.');
    return directory;
}
function gate(coreProfile, fn) {
    const directory = runtime(coreProfile), file = path.join(directory, 'gate.json');
    if (active(file)) throw Error(BUSY);
    // Exclusive creation also handles the race between the existence check and open.
    let handle;
    try { handle = fs.openSync(file, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') throw Error(BUSY); throw error; }
    try { fs.writeFileSync(handle, JSON.stringify({ pid: process.pid })); return fn(directory); }
    finally { fs.closeSync(handle); fs.unlinkSync(file); }
}
function beginSession(coreProfile, group, profile) {
    if (!Object.hasOwn(GROUPS, group)) throw Error('Unbekannte Creative-Anwendung.');
    const file = gate(coreProfile, directory => {
        if (active(path.join(directory, 'maintenance.json'))) throw Error(BUSY);
        const destination = path.join(directory, `session-${randomUUID()}.json`);
        fs.writeFileSync(destination, JSON.stringify({ pid: process.pid, group, profile }), { flag: 'wx', mode: 0o600 });
        return destination;
    });
    return () => { try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
}
function beginMaintenance(coreProfile) {
    const file = gate(coreProfile, directory => {
        const destination = path.join(directory, 'maintenance.json');
        if (active(destination)) throw Error(BUSY);
        for (const name of fs.readdirSync(directory)) if (/^session-[a-f0-9-]+\.json$/.test(name) && active(path.join(directory, name))) throw Error(BUSY);
        fs.writeFileSync(destination, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
        return destination;
    });
    return () => { try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
}
function assertAvailable(coreProfile) {
    if (active(path.join(coreProfile, 'creative-runtime', 'maintenance.json'))) throw Error(BUSY);
}
function configureApplication(app, group, fallback, env = process.env) {
    const coreProfile = env.BRINK_CORE_PROFILE || path.join(app.getPath('appData'), 'brink');
    const restored = env.BRINK_SUITE_PROFILE ? '' : restoredProfile(workspace(coreProfile, app.getPath('documents')), group);
    const profile = env.BRINK_SUITE_PROFILE || restored || fallback;
    if (restored) env.BRINK_SUITE_PROFILE = restored;
    app.setPath('userData', profile);
    let release;
    try { release = beginSession(coreProfile, group, profile); }
    catch (error) {
        // A deliberate maintenance lock is a user-facing pause, not an uncaught
        // startup exception. It never discards work in an already running editor.
        require('electron').dialog.showErrorBox('BRINK – Creative Workspace', error.message);
        app.exit(0);
        return profile;
    }
    process.once('exit', release);
    return profile;
}
module.exports = { GROUPS, PORTABLE, BUSY, inside, plain, read, workspace, portableManifest, restoredProfile, savedProfiles, beginSession, beginMaintenance, assertAvailable, configureApplication };
