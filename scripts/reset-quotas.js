// Script admin : remet à zéro tous les compteurs de quota
// Usage : node scripts/reset-quotas.js [--ip] [--users]
//   sans flag → tout (users + ip + invités)
//   --users   → quotas utilisateurs seulement
//   --ip      → quotas IP seulement (free + invités)

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));

const args = process.argv.slice(2);
const onlyIp    = args.includes('--ip')    && !args.includes('--users');
const onlyUsers = args.includes('--users') && !args.includes('--ip');
const both      = !onlyIp && !onlyUsers;

console.log('▶ Réinitialisation des quotas');

if (both || onlyUsers) {
  const r = db.prepare('DELETE FROM daily_requests').run();
  console.log(`  • daily_requests       : ${r.changes} ligne(s)`);
}
if (both || onlyIp) {
  const r1 = db.prepare('DELETE FROM ip_daily_requests').run();
  const r2 = db.prepare('DELETE FROM guest_requests').run();
  console.log(`  • ip_daily_requests    : ${r1.changes} ligne(s)`);
  console.log(`  • guest_requests       : ${r2.changes} ligne(s)`);
}

console.log('✓ Réinitialisation terminée');
