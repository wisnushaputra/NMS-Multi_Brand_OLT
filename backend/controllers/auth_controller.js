import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbQuery } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nms-secret-key-2026';

export async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi' });
    }

    const user = await dbQuery.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login berhasil',
      token,
      user: { user_id: user.user_id, username: user.username, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMe(req, res) {
  try {
    if (req.user) {
      return res.json({ user: req.user });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Token otentikasi tidak ditemukan' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch (err) {
    res.status(401).json({ error: 'Token tidak valid' });
  }
}
