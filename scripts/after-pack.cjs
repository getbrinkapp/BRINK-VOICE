const {execFileSync} = require('node:child_process');
const path = require('node:path');
// Electron ships a default camera-purpose string. Audio-only VOICE must remove it
// from the final macOS bundle as well as from its own configuration.
module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const file = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Info.plist');
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Delete :NSCameraUsageDescription', file]);
};
