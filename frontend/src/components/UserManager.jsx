import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Shield, Key, Search, RefreshCw,
  Trash2, Edit3, CheckCircle2, AlertCircle, AlertTriangle,
  X, Lock, ShieldCheck, UserCheck, Wrench, Headphones,
  Loader2, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser
} from '../services/api';

/* ── Role Configuration & Badges ────────────────────────────────────── */
export const ROLES = {
  superadmin: {
    label: 'Super Admin',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.12)',
    border: 'rgba(129, 140, 248, 0.3)',
    icon: ShieldCheck,
    desc: 'Akses penuh ke seluruh sistem, setelan integrasi, database, dan manajemen user.'
  },
  noc_engineer: {
    label: 'NOC Engineer',
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.12)',
    border: 'rgba(96, 165, 250, 0.3)',
    icon: Shield,
    desc: 'Manajemen OLT, eksekusi CLI terminal, provisi ONU, reboot CPE, dan kontrol poller.'
  },
  field_technician: {
    label: 'Field Technician',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.3)',
    icon: Wrench,
    desc: 'Scan unconfigured ONU di lapangan, registrasi ONU baru, dan cek sinyal redaman.'
  },
  helpdesk: {
    label: 'Helpdesk / CS',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    border: 'rgba(52, 211, 153, 0.3)',
    icon: Headphones,
    desc: 'Mode Read-Only untuk memantau status koneksi internet pelanggan dan audit log.'
  }
};

export function RoleBadge({ role }) {
  const r = ROLES[role] || {
    label: role,
    color: '#a1a1aa',
    bg: 'rgba(161, 161, 170, 0.1)',
    border: 'rgba(161, 161, 170, 0.2)',
    icon: UserCheck
  };
  const Icon = r.icon;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      padding: '0.2rem 0.55rem',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 600,
      background: r.bg,
      color: r.color,
      border: `1px solid ${r.border}`
    }}>
      <Icon size={12} />
      <span>{r.label}</span>
    </span>
  );
}

export default function UserManager({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchUsersList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsers();
      if (res && res.data) {
        setUsers(res.data);
      }
    } catch (err) {
      showToast(err.message || 'Gagal memuat daftar pengguna', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsersList();
  }, [fetchUsersList]);

  // Filtered users
  const filteredUsers = users.filter(u => {
    const matchSearch = u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    superadmin: users.filter(u => u.role === 'superadmin').length,
    noc: users.filter(u => u.role === 'noc_engineer').length,
    tech: users.filter(u => u.role === 'field_technician').length,
    helpdesk: users.filter(u => u.role === 'helpdesk').length
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          background: toast.type === 'error' ? '#7f1d1d' : '#064e3b',
          border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#10b981'}`,
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1.25rem',
          color: '#f4f4f5',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
          {toast.type === 'error' ? <AlertCircle size={16} color="#ef4444" /> : <CheckCircle2 size={16} color="#10b981" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
            Manajemen Pengguna
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowMatrix(!showMatrix)}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }}
          >
            <Info size={14} />
            <span>{showMatrix ? 'Tutup Matriks RBAC' : 'Hak Akses'}</span>
            {showMatrix ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            <UserPlus size={14} />
            <span>Tambah Pengguna</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        marginBottom: '1.25rem'
      }}>
        <div style={{ padding: '0.75rem 1rem', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Super Admin</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '0.2rem' }}>
            {stats.superadmin}
          </div>
        </div>

        <div style={{ padding: '0.75rem 1rem', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>NOC Engineers</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '0.2rem' }}>
            {stats.noc}
          </div>
        </div>

        <div style={{ padding: '0.75rem 1rem', borderRight: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Field Technicians</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '0.2rem' }}>
            {stats.tech}
          </div>
        </div>

        <div style={{ padding: '0.75rem 1rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Helpdesk / CS</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono, monospace', marginTop: '0.2rem' }}>
            {stats.helpdesk}
          </div>
        </div>
      </div>

      {/* RBAC Matrix Guide Card (Collapsible) */}
      {showMatrix && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={16} color="var(--primary)" />
            <span>Matriks Pembagian Wewenang & Hak Akses (RBAC)</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.5rem' }}>Modul / Fitur</th>
                  <th style={{ padding: '0.5rem' }}>Super Admin</th>
                  <th style={{ padding: '0.5rem' }}>NOC Engineer</th>
                  <th style={{ padding: '0.5rem' }}>Field Technician</th>
                  <th style={{ padding: '0.5rem' }}>Helpdesk / CS</th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-secondary)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>Dashboard & Monitoring</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Full</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Full</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Full</td>
                  <td style={{ padding: '0.5rem', color: '#60a5fa' }}>👁️ Read-Only</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>Manajemen Perangkat OLT</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ CRUD Full</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ CRUD Full</td>
                  <td style={{ padding: '0.5rem', color: '#71717a' }}>❌ Dibatasi</td>
                  <td style={{ padding: '0.5rem', color: '#60a5fa' }}>👁️ Read-Only</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>CLI Terminal Runner</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Eksekusi Bebas</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Eksekusi Bebas</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Terkunci</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Terkunci</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>Provisi ONU Baru</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Scan & Provisi</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Scan & Provisi</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Scan & Provisi</td>
                  <td style={{ padding: '0.5rem', color: '#71717a' }}>❌ Dibatasi</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>Hapus ONU Pelanggan</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Diizinkan</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Diizinkan</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>Setelan Integrasi (GenieACS/Bot)</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Full Setting</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-main)' }}>Manajemen Pengguna</td>
                  <td style={{ padding: '0.5rem', color: '#34d399' }}>✅ Full CRUD</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                  <td style={{ padding: '0.5rem', color: '#ef4444' }}>❌ Dilarang</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: '0.6rem 1rem',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '320px' }}>
          <Search size={15} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Cari username..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-main)',
              fontSize: '0.825rem',
              width: '100%'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Filter Peran:</span>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              padding: '0.3rem 0.6rem'
            }}
          >
            <option value="ALL">Semua Peran ({users.length})</option>
            <option value="superadmin">Super Admin</option>
            <option value="noc_engineer">NOC Engineer</option>
            <option value="field_technician">Field Technician</option>
            <option value="helpdesk">Helpdesk / CS</option>
          </select>

          <button
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.5rem' }}
            onClick={fetchUsersList}
            title="Muat Ulang"
          >
            <RefreshCw size={14} className={loading ? 'spin-animate' : ''} />
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>User ID</th>
              <th style={{ padding: '0.75rem 1rem' }}>Username</th>
              <th style={{ padding: '0.75rem 1rem' }}>Peran (Role)</th>
              <th style={{ padding: '0.75rem 1rem' }}>Deskripsi Wewenang</th>
              <th style={{ padding: '0.75rem 1rem' }}>Terdaftar Pada</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  <Loader2 size={20} className="spin-animate" style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Memuat data pengguna...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  Tidak ada pengguna yang cocok dengan kriteria pencarian.
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => {
                const isSelf = currentUser && user.user_id === currentUser.user_id;
                const roleMeta = ROLES[user.role] || ROLES.superadmin;

                return (
                  <tr key={user.user_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      #{user.user_id}
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: 'var(--text-secondary)'
                        }}>
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {user.username}
                            {isSelf && (
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', padding: '1px 5px', borderRadius: '3px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                                (Anda)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <RoleBadge role={user.role} />
                    </td>

                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.75rem', maxWidth: '300px' }}>
                      {roleMeta.desc}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          title="Edit Peran & Reset Password"
                          onClick={() => setEditUser(user)}
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>

                        <button
                          className="btn btn-secondary"
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            color: isSelf ? 'var(--text-muted)' : '#ef4444',
                            opacity: isSelf ? 0.4 : 1,
                            cursor: isSelf ? 'not-allowed' : 'pointer'
                          }}
                          disabled={isSelf}
                          title={isSelf ? 'Tidak dapat menghapus akun sendiri' : 'Hapus Pengguna'}
                          onClick={() => !isSelf && setDeleteTarget(user)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Tambah Pengguna ───────────────────────────────────── */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(msg) => {
            setShowAddModal(false);
            showToast(msg, 'success');
            fetchUsersList();
          }}
        />
      )}

      {/* ── Modal: Edit Pengguna / Reset Password ────────────────────── */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={(msg) => {
            setEditUser(null);
            showToast(msg, 'success');
            fetchUsersList();
          }}
        />
      )}

      {/* ── Modal: Konfirmasi Hapus Pengguna ─────────────────────────── */}
      {deleteTarget && (
        <DeleteUserModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={(msg) => {
            setDeleteTarget(null);
            showToast(msg, 'success');
            fetchUsersList();
          }}
        />
      )}
    </div>
  );
}

/* ── Modal: Tambah Pengguna ─────────────────────────────────────────── */
function AddUserModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    username: '',
    role: 'noc_engineer',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('Konfirmasi password tidak cocok');
      return;
    }
    if (form.password.length < 5) {
      setError('Password minimal 5 karakter');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await createUser({
        username: form.username.trim(),
        role: form.role,
        password: form.password
      });
      onSuccess(res.message || 'Pengguna baru berhasil ditambahkan');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <UserPlus size={18} color="var(--primary)" />
            <div style={{ fontWeight: 700 }}>Tambah Pengguna Baru</div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.2rem 0.4rem' }} onClick={onClose}><X size={15} /></button>
        </div>

        {error && (
          <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', color: '#f87171', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="contoh: teknisi_jkt"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Peran (Role) & Hak Akses</label>
            <select
              className="form-input"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="superadmin">Super Admin (Akses Penuh)</option>
              <option value="noc_engineer">NOC Engineer (OLT & Provisi)</option>
              <option value="field_technician">Field Technician (Scan & Registrasi)</option>
              <option value="helpdesk">Helpdesk / CS (Read-Only)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="form-input"
              required
              placeholder="Minimal 5 karakter"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Konfirmasi Password</label>
            <input
              type="password"
              className="form-input"
              required
              placeholder="Ulangi password"
              value={form.confirmPassword}
              onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="spin-animate" /> : <UserPlus size={14} />}
              <span>Buat Akun</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal: Edit Pengguna / Reset Password ──────────────────────────── */
function EditUserModal({ user, onClose, onSuccess }) {
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = { role };
      if (password.trim().length > 0) {
        if (password.trim().length < 5) {
          setError('Password baru minimal 5 karakter');
          setLoading(false);
          return;
        }
        payload.password = password.trim();
      }

      const res = await updateUser(user.user_id, payload);
      onSuccess(res.message || 'Data pengguna berhasil diperbarui');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Edit3 size={18} color="var(--primary)" />
            <div>
              <div style={{ fontWeight: 700 }}>Edit Pengguna: {user.username}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ubah peran atau reset password akun ini</div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.2rem 0.4rem' }} onClick={onClose}><X size={15} /></button>
        </div>

        {error && (
          <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', color: '#f87171', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Peran (Role)</label>
            <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="superadmin">Super Admin (Akses Penuh)</option>
              <option value="noc_engineer">NOC Engineer (OLT & Provisi)</option>
              <option value="field_technician">Field Technician (Scan & Registrasi)</option>
              <option value="helpdesk">Helpdesk / CS (Read-Only)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Reset Password (Opsional)</label>
            <input
              type="password"
              className="form-input"
              placeholder="Kosongkan jika tidak ingin mengubah password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="spin-animate" /> : <Key size={14} />}
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal: Konfirmasi Hapus Pengguna ───────────────────────────────── */
function DeleteUserModal({ user, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await deleteUser(user.user_id);
      onSuccess(res.message || 'Pengguna berhasil dihapus');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <AlertTriangle size={24} color="#ef4444" />
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>Hapus Akun Pengguna?</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Apakah Anda yakin ingin menghapus akun <b style={{ color: 'var(--text-main)' }}>{user.username}</b> ({user.role})?
            Tindakan ini permanen dan tidak dapat dibatalkan.
          </div>
        </div>

        {error && (
          <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', color: '#f87171', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
          <button type="button" className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#ef4444' }} onClick={handleDelete} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin-animate" /> : <Trash2 size={14} />}
            <span>Hapus Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );
}
