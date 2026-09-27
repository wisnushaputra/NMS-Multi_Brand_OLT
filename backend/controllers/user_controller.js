import bcrypt from 'bcryptjs';
import { dbQuery } from '../db/index.js';
import { createAuditLog } from '../services/audit_service.js';

const VALID_ROLES = ['superadmin', 'noc_engineer', 'field_technician', 'helpdesk'];

export async function getUsers(req, res) {
  try {
    const users = await dbQuery.all(`
      SELECT user_id, username, role, created_at
      FROM users
      ORDER BY user_id ASC
    `);

    // Standardize 'administrator' to 'superadmin' for display
    const formatted = users.map(u => ({
      ...u,
      role: u.role === 'administrator' ? 'superadmin' : u.role
    }));

    res.json({
      success: true,
      data: formatted
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createUser(req, res) {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, dan role wajib diisi' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanRole = role.trim().toLowerCase();

    if (!VALID_ROLES.includes(cleanRole)) {
      return res.status(400).json({
        error: `Role '${role}' tidak valid. Pilihan yang tersedia: ${VALID_ROLES.join(', ')}`
      });
    }

    const existing = await dbQuery.get('SELECT user_id FROM users WHERE username = ?', [cleanUsername]);
    if (existing) {
      return res.status(400).json({ error: `Username '${cleanUsername}' sudah terdaftar` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbQuery.run(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `, [cleanUsername, passwordHash, cleanRole]);

    await createAuditLog({
      user: req.user,
      action: 'Tambah Pengguna Baru',
      details: {
        created_user_id: result.lastID,
        created_username: cleanUsername,
        assigned_role: cleanRole
      }
    });

    res.status(201).json({
      success: true,
      message: `Pengguna '${cleanUsername}' (${cleanRole}) berhasil dibuat`,
      data: {
        user_id: result.lastID,
        username: cleanUsername,
        role: cleanRole
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { role, password } = req.body;

    const user = await dbQuery.get('SELECT user_id, username, role FROM users WHERE user_id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }

    const updates = [];
    const params = [];

    if (role) {
      const cleanRole = role.trim().toLowerCase();
      if (!VALID_ROLES.includes(cleanRole)) {
        return res.status(400).json({
          error: `Role '${role}' tidak valid. Pilihan yang tersedia: ${VALID_ROLES.join(', ')}`
        });
      }
      updates.push('role = ?');
      params.push(cleanRole);
    }

    if (password && password.trim().length > 0) {
      const passwordHash = await bcrypt.hash(password.trim(), 10);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data pembaruan yang diberikan' });
    }

    params.push(id);
    await dbQuery.run(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, params);

    await createAuditLog({
      user: req.user,
      action: 'Update Data Pengguna',
      details: {
        target_user_id: id,
        target_username: user.username,
        updated_role: role || user.role,
        password_reset: !!password
      }
    });

    res.json({
      success: true,
      message: `Data pengguna '${user.username}' berhasil diperbarui`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.user_id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri yang sedang aktif digunakan' });
    }

    const user = await dbQuery.get('SELECT user_id, username, role FROM users WHERE user_id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    }

    await dbQuery.run('DELETE FROM users WHERE user_id = ?', [id]);

    await createAuditLog({
      user: req.user,
      action: 'Hapus Pengguna',
      details: {
        deleted_user_id: id,
        deleted_username: user.username,
        deleted_role: user.role
      }
    });

    res.json({
      success: true,
      message: `Pengguna '${user.username}' berhasil dihapus`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
