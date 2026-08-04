import bcrypt from 'bcryptjs';

const password = process.argv[2] || 'admin123';
const hash = await bcrypt.hash(password, 10);
console.log('Password:', password);
console.log('Hash:', hash);
console.log(`
SQL:
INSERT INTO users (username, password_hash, first_name, last_name, avatar_color, role, created_at, updated_at)
VALUES ('admin', '${hash}', 'Admin', 'User', '#3B82F6', 'ADMIN', NOW(), NOW());
`);
