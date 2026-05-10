import { useState } from 'react';
import { ArrowLeft, Users, Settings, Activity, Shield } from 'lucide-react';
import UsersTab from './admin/UsersTab.jsx';
import SettingsTab from './admin/SettingsTab.jsx';

export default function AdminArea({ user, onBack }) {
  const tabs = [
    { id: 'users', label: 'USERS', icon: Users },
    { id: 'settings', label: 'SETTINGS', icon: Settings },
    { id: 'activity', label: 'ACTIVITY', icon: Activity },
  ];
  if (user.is_superadmin) {
    tabs.push({ id: 'system', label: 'SYSTEM', icon: Shield });
  }

  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="admin-area">
      <div className="admin-header">
        <button className="admin-back" onClick={onBack} aria-label="Back to inventory">
          <ArrowLeft size={20} />
        </button>
        <h1 className="admin-title">ADMIN</h1>
      </div>

      <div className="admin-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-content">
        {activeTab === 'users' && <UsersTab currentUserId={user.id} />}
        {activeTab === 'settings' && <SettingsTab user={user} />}
        {activeTab === 'activity' && <div className="admin-placeholder">Activity tab coming soon</div>}
        {activeTab === 'system' && <div className="admin-placeholder">System tab coming soon</div>}
      </div>
    </div>
  );
}
