import React from 'react';
import {
  LayoutDashboard, Server, Network, Layers, GitBranch,
  FileText, Settings, LogOut, Radio, Users, Activity,
  ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { RoleBadge } from './UserManager';

export default function Sidebar({
  activeTab,
  setActiveTab,
  onLogout,
  currentUser,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile
}) {
  const userRole = (currentUser?.role === 'administrator' || currentUser?.role === 'superadmin')
    ? 'superadmin'
    : (currentUser?.role || 'helpdesk');

  const menuSections = [
    {
      title: 'Monitoring',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['superadmin', 'noc_engineer', 'field_technician', 'helpdesk'] },
        { id: 'topology', label: 'Topologi Jaringan', icon: GitBranch, roles: ['superadmin', 'noc_engineer', 'helpdesk'] },
        { id: 'logs', label: 'Audit Log', icon: FileText, roles: ['superadmin', 'noc_engineer', 'helpdesk'] },
      ]
    },
    {
      title: 'Operasi FTTH',
      items: [
        { id: 'provisioning', label: 'Provisi ONU', icon: Network, roles: ['superadmin', 'noc_engineer', 'field_technician', 'helpdesk'] },
        { id: 'devices', label: 'Perangkat OLT', icon: Server, roles: ['superadmin', 'noc_engineer', 'helpdesk'] },
        { id: 'profiles', label: 'Service Profile', icon: Layers, roles: ['superadmin', 'noc_engineer'] },
      ]
    },
    {
      title: 'Konfigurasi Sistem',
      items: [
        { id: 'integrations', label: 'Integrasi Sistem', icon: Settings, roles: ['superadmin'] },
        { id: 'users', label: 'Manajemen Pengguna', icon: Users, roles: ['superadmin'] },
      ]
    }
  ];

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      {/* Brand Header */}
      <div className="brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div
            className="brand-icon-modern"
            onClick={onToggleCollapse}
            style={{ cursor: 'pointer' }}
            title={isCollapsed ? 'Buka Sidebar' : 'FTTH CORE NMS'}
          >
            <Activity size={18} strokeWidth={2.4} />
          </div>
          {!isCollapsed && (
            <div className="brand-text" style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="brand-title">FTTH CORE NMS</div>
              <div className="brand-subtitle">ISP OPERATIONS</div>
            </div>
          )}
        </div>

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          className="sidebar-collapse-btn desktop-only"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Buka Sidebar (Ctrl + B)' : 'Tutup Sidebar (Tampilan Penuh)'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* Mobile Close Button */}
        {onCloseMobile && (
          <button
            type="button"
            className="sidebar-mobile-close-btn mobile-only"
            onClick={onCloseMobile}
            title="Tutup Menu"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="nav-menu">
        {menuSections.map((section) => {
          const visibleItems = section.items.filter(item => item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="nav-section-wrap" style={{ marginBottom: isCollapsed ? '0.4rem' : '0.65rem' }}>
              {!isCollapsed ? (
                <div className="nav-section-title">{section.title}</div>
              ) : (
                <div className="nav-section-divider" title={section.title} />
              )}

              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <div
                    key={item.id}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveTab(item.id)}
                    title={isCollapsed ? `${item.label} (${section.title})` : item.label}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} style={{ color: isActive ? '#ffffff' : 'inherit', flexShrink: 0 }} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        {currentUser && (
          <div
            className="sidebar-user-card"
            title={`${currentUser.username} (${userRole})`}
            style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: isCollapsed ? '0.45rem 0' : '0.55rem 0.75rem',
              marginBottom: '0.65rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              gap: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-main)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                flexShrink: 0
              }}>
                {(currentUser.username || 'AD').slice(0, 2).toUpperCase()}
              </div>
              {!isCollapsed && (
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentUser.username}
                  </div>
                </div>
              )}
            </div>
            {!isCollapsed && <RoleBadge role={userRole} />}
          </div>
        )}

        {onLogout && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onLogout}
            title="Keluar Sesi"
            style={{
              width: '100%',
              marginBottom: '0.65rem',
              fontSize: '0.75rem',
              padding: isCollapsed ? '0.45rem 0' : '0.35rem 0.6rem',
              color: '#fb7185',
              justifyContent: isCollapsed ? 'center' : 'flex-start'
            }}
          >
            <LogOut size={14} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span>Keluar Sesi</span>}
          </button>
        )}

        {!isCollapsed && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.4 }}>
            OLT Multi-Vendor Layer v2.4<br />
            ZTE • Huawei • Fiberhome
          </div>
        )}
      </div>
    </aside>
  );
}
