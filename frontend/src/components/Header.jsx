import React from 'react';
import {
  LogOut, ChevronRight, Sun, Moon, Search,
  Menu, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { RoleBadge } from './UserManager';

export default function Header({
  activeTabName,
  currentUser,
  onLogout,
  theme = 'dark',
  onToggleTheme,
  onOpenCommandPalette,
  isSidebarCollapsed = false,
  onToggleSidebarCollapse,
  onOpenMobileSidebar
}) {
  return (
    <header className="header">
      <div className="header-left">
        {/* Mobile Hamburger Drawer Trigger */}
        {onOpenMobileSidebar && (
          <button
            type="button"
            className="btn btn-ghost btn-sm header-toggle-btn mobile-only"
            onClick={onOpenMobileSidebar}
            title="Buka Menu Navigasi"
            aria-label="Open mobile navigation"
            style={{ padding: '0.3rem', marginRight: '0.4rem' }}
          >
            <Menu size={18} />
          </button>
        )}

        {/* Desktop Sidebar Collapse / Expand Toggle Button */}
        {onToggleSidebarCollapse && (
          <button
            type="button"
            className="btn btn-ghost btn-sm header-toggle-btn desktop-only"
            onClick={onToggleSidebarCollapse}
            title={isSidebarCollapsed ? 'Buka Sidebar (Expand)' : 'Tutup Sidebar (Tampilan Penuh)'}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ padding: '0.28rem 0.45rem', marginRight: '0.5rem', color: 'var(--text-secondary)' }}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        )}

        {/* Breadcrumbs */}
        <div className="header-breadcrumb">
          <span className="header-breadcrumb-root hide-on-mobile">FTTH NMS</span>
          <ChevronRight size={13} className="header-breadcrumb-sep hide-on-mobile" />
          <span className="header-breadcrumb-current">{activeTabName}</span>
        </div>
      </div>

      <div className="header-actions">
        {/* Command Palette Quick Trigger */}
        {onOpenCommandPalette && (
          <button
            className="command-palette-trigger"
            onClick={onOpenCommandPalette}
            title="Buka Command Palette (Ctrl + K / Cmd + K)"
          >
            <Search size={13} />
            <span className="hide-on-mobile" style={{ fontSize: '0.76rem' }}>Cari cepat...</span>
            <kbd className="kbd-shortcut hide-on-mobile">Ctrl K</kbd>
          </button>
        )}

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Beralih ke Dark Mode' : 'Beralih ke Light Mode (White Mode)'}
            style={{ padding: '0.26rem 0.55rem' }}
          >
            {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
            <span className="hide-on-mobile">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
        )}

        {/* User Profile Pill */}
        <div
          className="header-user-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            paddingLeft: '0.65rem',
            borderLeft: '1px solid var(--border-color)'
          }}
        >
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-main)',
              fontSize: '0.72rem',
              fontWeight: 700,
              fontFamily: 'JetBrains Mono, monospace',
              flexShrink: 0
            }}
          >
            {(currentUser?.username || 'AD').slice(0, 2).toUpperCase()}
          </div>
          <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {currentUser?.username || 'admin'}
            </span>
            <RoleBadge role={currentUser?.role} />
          </div>
        </div>

        {onLogout && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onLogout}
            title="Keluar dari sesi sistem"
            style={{ color: '#fb7185', padding: '0.25rem 0.45rem' }}
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </header>
  );
}
