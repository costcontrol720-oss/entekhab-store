// استفاده: node hash-password.js "رمز-عبور-دلخواه"
// خروجی را در فایل .env مقابل ADMIN_PASSWORD_HASH قرار دهید.

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('لطفاً رمز عبور را به‌عنوان آرگومان وارد کنید. مثال:');
  console.error('  node hash-password.js "PEYMAN 9389208502"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nاین مقدار را در فایل .env قرار دهید:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
