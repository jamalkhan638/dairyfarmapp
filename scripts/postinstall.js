// Runs after `npm install`.
// Always builds the shared rules (the app and the server both use them).
// Generates the server's database client too, except on Expo's app build servers (EAS), which only build the app.
const { execSync } = require('child_process');
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('npm run build -w packages/shared');
if (!process.env.EAS_BUILD) run('npm run prisma:generate -w apps/api');
