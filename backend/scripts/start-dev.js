
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting development server...');

const child = spawn('npx', ['tsx', 'watch', 'src/server.ts'], {
  cwd: join(__dirname, '..'),
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  child.kill();
  process.exit(0);
});


