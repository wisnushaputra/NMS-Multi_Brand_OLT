import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Wifi, Server, LayoutDashboard, Network, Sliders,
  ShieldCheck, FileText, Settings, UserCheck, Plus, RefreshCw,
  Sun, Moon, LogOut, ArrowRight, CornerDownLeft
} from 'lucide-react';

export default function CommandPalette({
  isOpen,
  onClose,
  onus = [],
  devices = [],
  onSelectONU,
  onSelectDevice,
  onNavigate,
  onOpenProvisionModal,
  onRefresh,
  theme,
  onToggleTheme,
  onLogout
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Quick navigation menu commands
  const navigationCommands = useMemo(() => [
    {
      id: 'nav-overview',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Dashboard Overview',
      subtitle: 'Ringkasan metrik NOC, status OLT & alarm aktif',
      icon: <LayoutDashboard size={15} />,
      action: () => { onNavigate('overview'); onClose(); }
    },
    {
      id: 'nav-topology',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Topologi Jaringan & ODF Blade',
      subtitle: 'Matriks SFP port 1:128 GPON & status LED',
      icon: <Network size={15} />,
      action: () => { onNavigate('topology'); onClose(); }
    },
    {
      id: 'nav-provisioning',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Provisi & Data Grid ONU',
      subtitle: 'Tabel high-density seluruh pelanggan FTTH',
      icon: <Wifi size={15} />,
      action: () => { onNavigate('provisioning'); onClose(); }
    },
    {
      id: 'nav-devices',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Manajemen Perangkat OLT',
      subtitle: 'ZTE, Huawei, Fiberhome multi-vendor',
      icon: <Server size={15} />,
      action: () => { onNavigate('devices'); onClose(); }
    },
    {
      id: 'nav-profiles',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Service Profiles',
      subtitle: 'Paket bandwidth QoS & VLAN template',
      icon: <Sliders size={15} />,
      action: () => { onNavigate('profiles'); onClose(); }
    },
    {
      id: 'nav-integrations',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Integrasi Sistem',
      subtitle: 'ACS TR-069, Bot Notifikasi, Webhook',
      icon: <Settings size={15} />,
      action: () => { onNavigate('integrations'); onClose(); }
    },
    {
      id: 'nav-logs',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Audit Logs',
      subtitle: 'Catatan aktivitas teknisi & konfigurasi OLT',
      icon: <FileText size={15} />,
      action: () => { onNavigate('logs'); onClose(); }
    },
    {
      id: 'nav-users',
      type: 'action',
      category: 'Navigasi Menu',
      title: 'Buka Manajemen Pengguna (RBAC)',
      subtitle: 'Hak akses Superadmin, NOC, Teknisi, Helpdesk',
      icon: <UserCheck size={15} />,
      action: () => { onNavigate('users'); onClose(); }
    },
    {
      id: 'action-provision-new',
      type: 'action',
      category: 'Aksi Sistem',
      title: 'Provisi ONU Baru',
      subtitle: 'Buka wizard registrasi modem optik baru',
      icon: <Plus size={15} color="var(--primary)" />,
      action: () => { onOpenProvisionModal(); onClose(); }
    },
    {
      id: 'action-refresh',
      type: 'action',
      category: 'Aksi Sistem',
      title: 'Muat Ulang Data NMS',
      subtitle: 'Segarkan data perangkat, pelanggan, dan metrik',
      icon: <RefreshCw size={15} />,
      action: () => { if (onRefresh) onRefresh(); onClose(); }
    },
    {
      id: 'action-theme',
      type: 'action',
      category: 'Aksi Sistem',
      title: theme === 'light' ? 'Beralih ke Dark Mode' : 'Beralih ke Light Mode',
      subtitle: 'Ubah tema antarmuka NMS',
      icon: theme === 'light' ? <Moon size={15} /> : <Sun size={15} />,
      action: () => { if (onToggleTheme) onToggleTheme(); onClose(); }
    },
    {
      id: 'action-logout',
      type: 'action',
      category: 'Aksi Sistem',
      title: 'Keluar dari Sesi (Logout)',
      subtitle: 'Akhiri sesi otentikasi akun',
      icon: <LogOut size={15} color="#fb7185" />,
      action: () => { if (onLogout) onLogout(); onClose(); }
    }
  ], [onNavigate, onOpenProvisionModal, onRefresh, theme, onToggleTheme, onLogout, onClose]);

  // Filtered results based on search query
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();

    // Matching ONUs (limit to top 15 results for performance)
    const matchingOnus = onus.filter((onu) => {
      if (!q) return false;
      const snMatch = (onu.serial_number || '').toLowerCase().includes(q);
      const nameMatch = (onu.onu_name || '').toLowerCase().includes(q);
      const pppoeMatch = (onu.pppoe_username || '').toLowerCase().includes(q);
      const devMatch = (onu.device_name || '').toLowerCase().includes(q);
      const vlanMatch = String(onu.vlan_id || '').includes(q);
      const portMatch = `${onu.card_slot || 1}/${onu.pon_port_id}`.includes(q);
      return snMatch || nameMatch || pppoeMatch || devMatch || vlanMatch || portMatch;
    }).slice(0, 15).map((onu) => ({
      id: `onu-${onu.onu_id}`,
      type: 'onu',
      category: 'Pelanggan ONU',
      onu,
      title: onu.serial_number,
      subtitle: `${onu.onu_name ? `${onu.onu_name} • ` : ''}${onu.device_name || 'OLT'} Port 1/${onu.card_slot || 1}/${onu.pon_port_id}${onu.onu_index ? `:${onu.onu_index}` : ''} • VLAN ${onu.vlan_id || '—'}`,
      status: onu.status,
      rxPower: onu.rx_power,
      action: () => {
        if (onSelectONU) onSelectONU(onu);
        onClose();
      }
    }));

    // Matching Devices (OLT)
    const matchingDevices = devices.filter((dev) => {
      if (!q) return false;
      const nameMatch = (dev.name || '').toLowerCase().includes(q);
      const vendorMatch = (dev.vendor || '').toLowerCase().includes(q);
      const ipMatch = (dev.ip_address || '').toLowerCase().includes(q);
      return nameMatch || vendorMatch || ipMatch;
    }).map((dev) => ({
      id: `dev-${dev.device_id}`,
      type: 'device',
      category: 'Perangkat OLT',
      device: dev,
      title: dev.name,
      subtitle: `${dev.vendor} • ${dev.ip_address}:${dev.ssh_port || 22} • ${dev.pon_ports_count || 16} Port GPON`,
      status: dev.status,
      action: () => {
        if (onSelectDevice) onSelectDevice(dev);
        onClose();
      }
    }));

    // Matching Navigation & Actions
    const matchingNav = navigationCommands.filter((cmd) => {
      if (!q) return true; // Show navigation items when query is empty
      const titleMatch = cmd.title.toLowerCase().includes(q);
      const subMatch = cmd.subtitle.toLowerCase().includes(q);
      return titleMatch || subMatch;
    });

    return [...matchingOnus, ...matchingDevices, ...matchingNav];
  }, [query, onus, devices, navigationCommands, onSelectONU, onSelectDevice, onClose]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults.length]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('.is-selected');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (searchResults.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % (searchResults.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        searchResults[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="command-palette-input-wrap">
          <Search size={18} color="var(--primary)" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Cari Serial Number, Nama, PPPoE, OLT, atau ketik perintah..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="kbd-shortcut" onClick={onClose} style={{ cursor: 'pointer' }}>
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="command-palette-results">
          {searchResults.length === 0 ? (
            <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Search size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.35 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Tidak ada hasil untuk "{query}"
              </div>
              <div style={{ fontSize: '0.74rem', marginTop: '0.2rem' }}>
                Periksa kembali Serial Number atau kata kunci pencarian Anda.
              </div>
            </div>
          ) : (
            (() => {
              let lastCategory = null;
              return searchResults.map((item, index) => {
                const showCategory = item.category !== lastCategory;
                lastCategory = item.category;
                const isSelected = index === selectedIndex;

                return (
                  <React.Fragment key={item.id}>
                    {showCategory && (
                      <div className="command-palette-group-title">
                        {item.category}
                      </div>
                    )}

                    <div
                      className={`command-palette-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="command-palette-item-left">
                        <div className="command-palette-item-icon">
                          {item.type === 'onu' ? (
                            <Wifi size={14} color={item.status === 'Online' ? 'var(--success)' : 'var(--danger)'} />
                          ) : item.type === 'device' ? (
                            <Server size={14} color={item.status === 'Online' ? 'var(--success)' : 'var(--text-muted)'} />
                          ) : (
                            item.icon
                          )}
                        </div>

                        <div className="command-palette-item-content">
                          <div className="command-palette-item-title" style={item.type === 'onu' ? { fontFamily: 'JetBrains Mono, monospace' } : {}}>
                            {item.title}
                          </div>
                          <div className="command-palette-item-sub">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="command-palette-item-right">
                        {item.type === 'onu' && item.rxPower != null && item.status === 'Online' && (
                          <span
                            className={`rx-power-chip ${item.rxPower >= -24 ? 'rx-good' : item.rxPower >= -27 ? 'rx-fair' : 'rx-critical'}`}
                            style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}
                          >
                            {item.rxPower} dBm
                          </span>
                        )}

                        {item.status && (
                          <span
                            className={`status-badge ${item.status === 'Online' ? 'status-online' : 'status-offline'}`}
                            style={{ fontSize: '0.64rem', padding: '0.1rem 0.4rem' }}
                          >
                            {item.status}
                          </span>
                        )}

                        {isSelected && (
                          <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                            <CornerDownLeft size={13} />
                          </span>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              });
            })()
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="command-palette-footer">
          <div className="command-palette-footer-keys">
            <div className="command-palette-footer-key">
              <kbd className="kbd-shortcut">↑</kbd>
              <kbd className="kbd-shortcut">↓</kbd>
              <span>navigasi</span>
            </div>
            <div className="command-palette-footer-key">
              <kbd className="kbd-shortcut">↵</kbd>
              <span>pilih</span>
            </div>
            <div className="command-palette-footer-key">
              <kbd className="kbd-shortcut">ESC</kbd>
              <span>tutup</span>
            </div>
          </div>

          <div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem' }}>
              {searchResults.length} hasil
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
