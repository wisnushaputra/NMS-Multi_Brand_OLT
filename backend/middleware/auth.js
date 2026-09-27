import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'nms-secret-key-2026';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query?.token;

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: Token autentikasi tidak ditemukan' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: 'Sesi kedaluwarsa atau token tidak valid' });
    }
    req.user = user;
    next();
  });
}

/**
 * Role-Based Access Control (RBAC) Middleware
 * Normalizes 'administrator' as 'superadmin'.
 * Superadmin always has full access.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Autentikasi diperlukan sebelum mengakses resource ini' });
    }

    const currentRole = (req.user.role === 'administrator' || req.user.role === 'superadmin')
      ? 'superadmin'
      : req.user.role;

    // Superadmin has full bypass
    if (currentRole === 'superadmin') {
      return next();
    }

    const normalizedAllowed = allowedRoles.map(r => (r === 'administrator' ? 'superadmin' : r));

    if (!normalizedAllowed.includes(currentRole)) {
      return res.status(403).json({
        error: `Akses ditolak (403 Forbidden): Peran '${req.user.role}' tidak memiliki izin untuk tindakan ini.`
      });
    }

    next();
  };
}

