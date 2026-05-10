import { useState, useEffect } from 'react';
import { auth, setUnauthorizedHandler } from './api.js';
import Login from './Login.jsx';
import Inventory from './Inventory.jsx';
import AdminArea from './AdminArea.jsx';
import ResetPassword from './ResetPassword.jsx';
import { SynthBackground } from './background.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [view, setView] = useState('inventory');

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setView('inventory');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { needs_bootstrap } = await auth.bootstrap();
        if (needs_bootstrap) {
          setNeedsBootstrap(true);
          setLoading(false);
          return;
        }
      } catch (e) {
        setBootError('Could not reach server: ' + e.message);
        setLoading(false);
        return;
      }

      try {
        const me = await auth.me();
        setUser(me);
      } catch (e) {
        if (e.status !== 401) {
          setBootError('Could not load session: ' + e.message);
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    })();
  }, []);

  const handleAuth = (u) => {
    setUser(u);
    setNeedsBootstrap(false);
  };

  const handleLogout = () => {
    setUser(null);
    setView('inventory');
  };

  if (window.location.pathname === '/reset-password') {
    return <ResetPassword onBackToLogin={() => { window.location.href = '/'; }} />;
  }

  if (loading) {
    return (
      <>
        <SynthBackground />
        <div className="loading-screen">
          <div className="loading-text">LOADING STASH</div>
        </div>
      </>
    );
  }

  if (bootError) {
    return (
      <>
        <SynthBackground />
        <div className="loading-screen">
          <div style={{ textAlign: 'center', padding: 24, maxWidth: 360 }}>
            <div className="loading-text" style={{ color: '#ff006e' }}>SERVER ERROR</div>
            <div style={{
              marginTop: 12, color: 'rgba(255,255,255,0.7)',
              fontSize: 13, fontFamily: 'Outfit'
            }}>
              {bootError}
            </div>
            <button
              className="btn-secondary"
              style={{ marginTop: 20 }}
              onClick={() => window.location.reload()}
            >RETRY</button>
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <Login
        mode={needsBootstrap ? 'bootstrap' : 'login'}
        onAuth={handleAuth}
      />
    );
  }

  if (view === 'admin' && user.is_admin) {
    return (
      <>
        <SynthBackground />
        <AdminArea user={user} onBack={() => setView('inventory')} />
      </>
    );
  }

  return (
    <Inventory
      user={user}
      onLogout={handleLogout}
      onNavigate={(v) => setView(v)}
    />
  );
}
