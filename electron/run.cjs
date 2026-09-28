// `npm run desktop`: start Electron even from a VS Code terminal, which sets
// ELECTRON_RUN_AS_NODE and would otherwise make Electron behave like plain Node.
const { spawn } = require('node:child_process');
const electron = require('electron'); // path to the binary when run under Node
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ['.'], { stdio: 'inherit', env }).on('exit', (code) => process.exit(code ?? 0));
