import React, { useState } from 'react';
import {
  Layers, Plus, Trash2, Edit3, X, CheckCircle2, AlertCircle,
  AlertTriangle, Tag, Wifi, Code2, Eye
} from 'lucide-react';
import { createProfile, updateProfile, deleteProfile } from '../services/api';

/* ── Toast System (shared pattern from DeviceManager) ───────────────── */
function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.6rem', pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} style={{ pointerEvents: 'all' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
            {t.type === 'success' && <CheckCircle2 size={16} />}
            {t.type === 'error' && <AlertCircle size={16} />}
            {t.type === 'warning' && <AlertTriangle size={16} />}
            <span style={{ fontSize: '0.875rem' }}>{t.message}</span>
          </div>
          <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4500);
  };
  const remove = (id) => setToasts((p) => p.filter((t) => t.id !== id));
  return { toasts, toast: { success: (m) => add(m, 'success'), error: (m) => add(m, 'error'), warning: (m) => add(m, 'warning') }, remove };
}

/* ── Empty profile form ─────────────────────────────────────────────── */
const emptyForm = {
  name: '',
  vlan_id: 100,
  vlan_profile: 'PPPoE',
  vlan_template: 'vlan {vlan} tag',
  wan_config_template: 'IP_MODE=PPPoE;NAT=ENABLE;MTU=1492',
  pppoe_username_template: '{user}@isp.net',
  pppoe_password_template: 'pass{rand4}'
};

/* ── Profile Form Modal (Add / Edit) ────────────────────────────────── */
function ProfileFormModal({ mode, initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || emptyForm);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const isEdit = mode === 'edit';

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, vlan_id: parseInt(form.vlan_id), vlan_profile: (form.vlan_profile || '').trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const previewUsername = form.pppoe_username_template
    .replace('{user}', 'pelanggan01')
    .replace('{rand4}', Math.floor(1000 + Math.random() * 9000));
  const previewPassword = form.pppoe_password_template
    .replace('{rand4}', Math.floor(1000 + Math.random() * 9000))
    .replace('{user}', 'pelanggan01');

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Layers size={20} color="#c084fc" />
            <h3 style={{ fontWeight: 700 }}>{isEdit ? 'Edit Service Profile' : 'Buat Service Profile Baru'}</h3>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name + VLAN + VLAN Profile */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 1.3fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label>Nama Service Profile</label>
              <input type="text" className="form-input" required value={form.name}
                onChange={(e) => set('name', e.target.value)} placeholder="Home-Standard-50M" />
            </div>
            <div className="form-group">
              <label>VLAN ID</label>
              <input type="number" className="form-input" required min="1" max="4094"
                value={form.vlan_id} onChange={(e) => set('vlan_id', e.target.value)} />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Tag size={13} color="#c084fc" /> VLAN Profile (OLT)
              </label>
              <input type="text" className="form-input" value={form.vlan_profile || ''}
                onChange={(e) => set('vlan_profile', e.target.value)} placeholder="PPPoE / PASSPICO"
                style={{ fontFamily: 'JetBrains Mono, monospace' }} />
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '-0.5rem', marginBottom: '0.85rem', lineHeight: 1.4 }}>
            💡 <strong>VLAN Profile:</strong> Digunakan pada perintah OMCI OLT <code>wan-ip 1 mode pppoe ... vlan-profile {form.vlan_profile || 'PPPoE'} host 1</code>.
          </div>

          {/* Templates */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Code2 size={13} color="#60a5fa" /> Template CLI VLAN
            </label>
            <input type="text" className="form-input" required value={form.vlan_template}
              onChange={(e) => set('vlan_template', e.target.value)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }} />
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Variabel: {'{vlan}'} = VLAN ID</div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Wifi size={13} color="#34d399" /> Template WAN Config
            </label>
            <input type="text" className="form-input" required value={form.wan_config_template}
              onChange={(e) => set('wan_config_template', e.target.value)}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }} />
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Contoh: IP_MODE=PPPoE;NAT=ENABLE;MTU=1492</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Template Username PPPoE</label>
              <input type="text" className="form-input" required value={form.pppoe_username_template}
                onChange={(e) => set('pppoe_username_template', e.target.value)}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }} />
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Variabel: {'{user}'}, {'{vlan}'}</div>
            </div>
            <div className="form-group">
              <label>Template Password PPPoE</label>
              <input type="text" className="form-input" required value={form.pppoe_password_template}
                onChange={(e) => set('pppoe_password_template', e.target.value)}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }} />
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Variabel: {'{rand4}'} = 4 digit acak</div>
            </div>
          </div>

          {/* Preview section */}
          <div
            style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem', cursor: 'pointer' }}
            onClick={() => setPreviewOpen(!previewOpen)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Eye size={13} /> Preview Hasil Template
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{previewOpen ? 'Tutup ▲' : 'Lihat ▼'}</span>
            </div>
            {previewOpen && (
              <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(15,23,42,0.6)', borderRadius: '5px' }}>
                  <span style={{ color: '#9ca3af' }}>Contoh Username:</span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: '#34d399' }}>{previewUsername}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(15,23,42,0.6)', borderRadius: '5px' }}>
                  <span style={{ color: '#9ca3af' }}>Contoh Password:</span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: '#fbbf24' }}>{previewPassword}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(15,23,42,0.6)', borderRadius: '5px' }}>
                  <span style={{ color: '#9ca3af' }}>VLAN CLI:</span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: '#60a5fa' }}>{form.vlan_template.replace('{vlan}', form.vlan_id)}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Buat Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Confirm Delete Modal ────────────────────────────────────────────── */
function ConfirmDeleteModal({ profile, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1.5rem' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Trash2 size={20} color="#fb7185" />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>Hapus Service Profile?</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Profile <strong style={{ color: 'var(--text-main)' }}>{profile.name}</strong> (VLAN {profile.vlan_id}) akan dihapus.
            ONU yang menggunakan profile ini tidak akan terpengaruh.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Batal</button>
          <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }}
            disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); }}
          >
            {loading ? 'Menghapus...' : 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Profile Card ────────────────────────────────────────────────────── */
function ProfileCard({ prof, onEdit, onDelete }) {
  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Layers size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>{prof.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '3px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Tag size={11} color="#f59e0b" />
                <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>VLAN {prof.vlan_id}</span>
              </div>
              <span style={{ color: 'var(--border-light)' }}>•</span>
              <span style={{
                fontSize: '0.72rem',
                color: '#c084fc',
                background: 'rgba(168,85,247,0.1)',
                padding: '1px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(168,85,247,0.25)',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 600
              }}>
                vlan-profile: {prof.vlan_profile || 'PPPoE'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }} onClick={() => onEdit(prof)}>
            <Edit3 size={13} />
          </button>
          <button className="btn btn-danger" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }} onClick={() => onDelete(prof)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Template Details */}
      <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.79rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>VLAN Profile (OLT)</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#c084fc', fontWeight: 600 }}>{prof.vlan_profile || 'PPPoE'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>VLAN ID</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', fontWeight: 600 }}>{prof.vlan_id}</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>VLAN CLI Template</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--primary)' }}>{prof.vlan_template}</div>
        </div>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>WAN Config</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#10b981' }}>{prof.wan_config_template}</div>
        </div>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Format PPPoE</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-main)', fontWeight: 600 }}>user: {prof.pppoe_username_template}</span>
            <span style={{ color: 'var(--border-light)' }}>·</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', fontWeight: 600 }}>pass: {prof.pppoe_password_template}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ServiceProfiles ────────────────────────────────────────────── */
export default function ServiceProfiles({ profiles, onRefresh }) {
  const [modal, setModal] = useState(null); // null | { type: 'add' } | { type: 'edit', profile } | { type: 'delete', profile }
  const { toasts, toast, remove } = useToast();

  const handleAdd = async (form) => {
    try {
      await createProfile(form);
      toast.success(`Profile "${form.name}" berhasil dibuat.`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  const handleEdit = async (form) => {
    try {
      await updateProfile(modal.profile.profile_id, form);
      toast.success(`Profile "${form.name}" berhasil diperbarui.`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProfile(modal.profile.profile_id);
      toast.success(`Profile "${modal.profile.name}" dihapus.`);
      setModal(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
      setModal(null);
    }
  };

  const openEditModal = (prof) => {
    setModal({ type: 'edit', profile: prof, initial: { ...prof } });
  };

  return (
    <div>
      <ToastContainer toasts={toasts} onRemove={remove} />

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>Service Profile</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
          <Plus size={15} /> Buat Profile
        </button>
      </div>

      {/* Profile cards */}
      <div className="grid-2">
        {profiles.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', gridColumn: '1 / -1' }}>
            <Layers size={44} color="#374151" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              Belum Ada Service Profile
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Buat profile paket layanan (VLAN, WAN mode, dan format akun PPPoE) untuk kebutuhan provisi ONU.
            </p>
            <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
              <Plus size={16} /> Buat Service Profile Sekarang
            </button>
          </div>
        ) : (
          profiles.map((prof) => (
            <ProfileCard
              key={prof.profile_id}
              prof={prof}
              onEdit={openEditModal}
              onDelete={(p) => setModal({ type: 'delete', profile: p })}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'add' && (
        <ProfileFormModal mode="add" onClose={() => setModal(null)} onSave={handleAdd} />
      )}
      {modal?.type === 'edit' && (
        <ProfileFormModal mode="edit" initial={modal.initial} onClose={() => setModal(null)} onSave={handleEdit} />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDeleteModal profile={modal.profile} onConfirm={handleDelete} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
