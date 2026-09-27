import React, { useState } from 'react';
import { Server, Eye, EyeOff, AlertCircle, Loader2, Sun, Moon } from 'lucide-react';
import { loginApi, setAuthSession } from '../services/api';

export default function Login({ onLoginSuccess, theme, onToggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [realm, setRealm] = useState('local');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!username.trim() || !password.trim()) {
      setErrorMessage('Username dan password wajib diisi.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await loginApi(username.trim(), password);
      setAuthSession(data.token, data.user);
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Login gagal. Kredensial tidak valid.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillDemo = (e) => {
    e.preventDefault();
    setUsername('admin');
    setPassword('admin123');
    setErrorMessage('');
  };

  return (
    <div className="noc-login-screen">
      <div className="noc-login-panel">
        {/* Brand / NOC Console Header */}
        <div className="noc-header">
          <div className="noc-brand">
            <div className="brand-icon-modern" style={{ width: '32px', height: '32px' }}>
              <Server size={18} />
            </div>
            <div>
              <div className="noc-title">FTTH CORE NMS</div>
              <div className="noc-subtitle">Network Operations Center</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="noc-version-tag">v2.4.0</span>
            {onToggleTheme && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onToggleTheme}
                title={theme === 'light' ? 'Beralih ke Dark Mode' : 'Beralih ke Light Mode (White Mode)'}
                style={{ padding: '0.2rem 0.45rem' }}
              >
                {theme === 'light' ? <Moon size={12} /> : <Sun size={12} />}
              </button>
            )}
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="noc-alert-error">
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="noc-form">
          <div className="noc-field">
            <label htmlFor="noc-username">Username</label>
            <input
              id="noc-username"
              type="text"
              className="noc-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username akun NOC"
              disabled={isLoading}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="noc-field">
            <label htmlFor="noc-password">Password</label>
            <div className="noc-password-input">
              <input
                id="noc-password"
                type={showPassword ? 'text' : 'password'}
                className="noc-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="noc-pw-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="noc-field">
            <label htmlFor="noc-realm">Realm Autentikasi</label>
            <select
              id="noc-realm"
              className="noc-input noc-select"
              value={realm}
              onChange={(e) => setRealm(e.target.value)}
              disabled={isLoading}
            >
              <option value="local">NMS Local Database (Admin)</option>
              <option value="tacacs">TACACS+ / RADIUS (ISP Central)</option>
            </select>
          </div>

          <button
            type="submit"
            className="noc-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="spin-animate" />
                <span>Mengautentikasi...</span>
              </>
            ) : (
              <span>Masuk ke Sistem</span>
            )}
          </button>
        </form>

        {/* Footer info & demo quick-fill */}
        <div className="noc-footer">
          <div>Authorized Access Only • System Monitored</div>
          <div className="noc-demo-row">
            Default akun: <code>admin</code> / <code>admin123</code> (
            <a href="#fill" onClick={handleFillDemo}>Isi otomatis</a>)
          </div>
        </div>
      </div>
    </div>
  );
}
