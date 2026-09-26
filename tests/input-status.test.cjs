const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseLidState}=require('../electron/input-status.cjs');
test('lid diagnostics distinguish closed, open, unknown and unrelated sleep settings',()=>{assert.equal(parseLidState('"AppleClamshellState" = Yes'),true);assert.equal(parseLidState('"AppleClamshellState" = No'),false);assert.equal(parseLidState('"AppleClamshellCausesSleep" = Yes'),null);assert.equal(parseLidState(''),null);});
