-- Run after prisma db push. Password: admin123
-- Name: Admin User, color: blue
INSERT INTO users (username, password_hash, first_name, last_name, avatar_color, role, created_at, updated_at)
VALUES (
  'admin',
  '$2b$10$l3ys.Wi36ur1/yIrry7Dn.9bU4dgFLOVV7FdtgKXDFVJRpPk5YFpa',
  'Admin',
  'User',
  '#3B82F6',
  'ADMIN',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  avatar_color = VALUES(avatar_color),
  role = 'ADMIN';
