import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './components/Login';
import Overview from './components/Overview';
import DeviceManager from './components/DeviceManager';
import ONUProvisioner from './components/ONUProvisioner';
import ServiceProfiles from './components/ServiceProfiles';
import TopologyView from './components/TopologyView';
import AuditLogsView from './components/AuditLogsView';
import IntegrationsView from './components/IntegrationsView';
import UserManager from './components/UserManager';
import CommandPalette from './components/CommandPalette';
import {
  getDevices,
  getONUs,
  getProfiles,
  getAuditLogs,
  getToken,
  getStoredUser,
  getMeApi,
  clearAuthSession
} from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('nms_theme') || 'dark';
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [devices, setDevices] = useState([]);
  const [onus, setOnus] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [provisioningSearchTerm, setProvisioningSearchTerm] = useState('');

  // Global Ctrl + K / Cmd + K keyboard shortcut listener
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Sync theme with DOM and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nms_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Check auth session on startup
  useEffect(() => {
    const verifySession = async () => {
      const token = getToken();
      if (!token) {
        setIsAuthChecking(false);
        return;
      }

      try {
        const data = await getMeApi();
        setCurrentUser(data.user);
      } catch (err) {
        console.warn('Session verification failed:', err.message);
        clearAuthSession();
        setCurrentUser(null);
      } finally {
        setIsAuthChecking(false);
      }
    };

    verifySession();

    // Listen to 401 unauthorized events from api.js
    const handleUnauthorized = () => {
      setCurrentUser(null);
    };

    window.addEventListener('nms:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('nms:unauthorized', handleUnauthorized);
    };
  }, []);

  // Fetch dashboard data when authenticated
  useEffect(() => {
    if (currentUser) {
      fetchAllData();

      // Real-time Server-Sent Events (SSE) stream listener
      const token = getToken();
      if (token) {
        const sse = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);

        sse.addEventListener('POLLER_CYCLE_DONE', () => {
          fetchAllData();
        });

        sse.addEventListener('INCIDENT_ALARM', () => {
          fetchAllData();
        });

        sse.addEventListener('DEVICE_STATUS_CHANGED', () => {
          fetchAllData();
        });

        sse.addEventListener('ONU_RECOVERED', () => {
          fetchAllData();
        });

        return () => {
          sse.close();
        };
      }
    }
  }, [currentUser]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setActiveTab('overview');
  };

  const handleLogout = () => {
    clearAuthSession();
    setCurrentUser(null);
    setDevices([]);
    setOnus([]);
    setProfiles([]);
    setLogs([]);
  };

  const fetchAllData = async () => {
    try {
      const [devs, onuData, profs, logData] = await Promise.all([
        getDevices(),
        getONUs(),
        getProfiles(),
        getAuditLogs()
      ]);
      setDevices(devs);
      setOnus(onuData);
      setProfiles(profs);
      setLogs(logData);
    } catch (err) {
      console.error('Error fetching NMS data:', err);
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Dashboard Overview NMS';
      case 'devices': return 'Manajemen Perangkat OLT Multi-Vendor';
      case 'provisioning': return 'Provisi & Registrasi ONU';
      case 'profiles': return 'Manajemen Service Profile';
      case 'topology': return 'Visualisasi Topologi Jaringan';
      case 'users': return 'Manajemen Pengguna & Hak Akses (RBAC)';
      case 'logs': return 'System Audit Logs';
      case 'integrations': return 'Integrasi Eksternal & Setelan';
      default: return 'Network Management System';
    }
  };

  if (isAuthChecking) {
    return (
      <div className="noc-login-screen">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem', color: '#a1a1aa' }}>
          <div className="spin-animate" style={{ width: '28px', height: '28px', border: '2px solid #27272a', borderTopColor: '#3b82f6', borderRadius: '50%' }} />
          <div style={{ fontSize: '0.8rem', color: '#71717a' }}>Memuat sesi NMS...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        currentUser={currentUser}
      />

      <div className="main-content">
        <Header
          activeTabName={getTabTitle()}
          onRefresh={fetchAllData}
          currentUser={currentUser}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        <main className="page-body">
          {activeTab === 'overview' && (
            <Overview
              devices={devices}
              onus={onus}
              logs={logs}
              currentUser={currentUser}
              setActiveTab={setActiveTab}
              onOpenProvisionModal={() => {
                setActiveTab('provisioning');
                setShowProvisionModal(true);
              }}
            />
          )}

          {activeTab === 'devices' && (
            <DeviceManager devices={devices} onRefresh={fetchAllData} currentUser={currentUser} />
          )}

          {activeTab === 'provisioning' && (
            <ONUProvisioner
              devices={devices}
              profiles={profiles}
              onRefresh={fetchAllData}
              showModal={showProvisionModal}
              onCloseModal={() => setShowProvisionModal(false)}
              currentUser={currentUser}
              initialSearchTerm={provisioningSearchTerm}
            />
          )}

          {activeTab === 'profiles' && (
            <ServiceProfiles profiles={profiles} onRefresh={fetchAllData} currentUser={currentUser} />
          )}

          {activeTab === 'topology' && (
            <TopologyView currentUser={currentUser} />
          )}

          {activeTab === 'users' && (
            <UserManager currentUser={currentUser} />
          )}

          {activeTab === 'logs' && (
            <AuditLogsView currentUser={currentUser} />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsView currentUser={currentUser} />
          )}
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onus={onus}
        devices={devices}
        onSelectONU={(onu) => {
          setProvisioningSearchTerm(onu.serial_number);
          setActiveTab('provisioning');
        }}
        onSelectDevice={(device) => {
          setActiveTab('topology');
        }}
        onNavigate={(tab) => {
          setActiveTab(tab);
        }}
        onOpenProvisionModal={() => {
          setActiveTab('provisioning');
          setShowProvisionModal(true);
        }}
        onRefresh={fetchAllData}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />
    </div>
  );
}
