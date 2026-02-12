import { DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, List, message, Modal, Radio, Select, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Dashboard, getDashboardShares, revokeDashboardShare, shareDashboard } from '../lib/dashboards';
import { getUsersForSharing } from '../lib/users';

interface ShareDashboardModalProps {
  visible: boolean;
  dashboard: Dashboard;
  onClose: () => void;
}

export default function ShareDashboardModal({ visible, dashboard, onClose }: ShareDashboardModalProps) {
  const { user } = useAuth();
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [sharedUsers, setSharedUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (visible && dashboard && dashboard.id && user) {
      loadData();
    }
  }, [visible, dashboard, user]);

  const loadData = async () => {
    if (!dashboard || !dashboard.id || !user) {
      console.error('loadData called without dashboard, dashboard.id, or user:', { dashboard, user });
      return;
    }

    setLoading(true);
    try {
      // Load available users and shared users in parallel
      const [users, shares] = await Promise.all([
        getUsersForSharing(user.id),
        getDashboardShares(dashboard.id),
      ]);

      // Filter out users who already have access
      const sharedUserIds = new Set(shares.map((s: any) => s.user_id || s.id));
      const available = users.filter((u) => !sharedUserIds.has(u.id));

      setAvailableUsers(available);
      setSharedUsers(shares);
      setSelectedUsers([]);
    } catch (error: any) {
      console.error('Error loading share data:', error);
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!dashboard || !user || selectedUsers.length === 0) return;

    setSharing(true);
    try {
      await shareDashboard(dashboard.id, selectedUsers, permission, user.id);

      // Wait for ClickHouse INSERT mutation to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Reload data to update the shared users list
      await loadData();
      message.success(`Dashboard shared with ${selectedUsers.length} user(s)`);
      setSelectedUsers([]);
    } catch (error: any) {
      console.error('Error sharing dashboard:', error);
      message.error(`Failed to share dashboard: ${error.message}`);
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!dashboard || !dashboard.id || !userId) {
      console.error('handleRevoke called without dashboard.id or userId:', { dashboard, userId });
      return;
    }

    try {
      await revokeDashboardShare(dashboard.id, userId);

      // Wait for ClickHouse UPDATE mutation to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success('Access revoked');

      // Reload data to refresh both lists
      await loadData();
    } catch (error: any) {
      console.error('Error revoking access:', error);
      message.error('Failed to revoke access');
    }
  };

  return (
    <Modal
      title={`Share Dashboard: ${dashboard?.name}`}
      open={visible}
      onCancel={onClose}
      width={600}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Share with new users */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Share with users:</div>
          <Select
            mode="multiple"
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="Select users to share with..."
            value={selectedUsers}
            onChange={setSelectedUsers}
            loading={loading}
            disabled={loading}
            options={availableUsers.map((u) => ({
              label: (
                <Space>
                  <Avatar size="small" src={u.avatar_url} icon={<UserOutlined />} />
                  <span>{u.name}</span>
                  <span style={{ color: '#888', fontSize: 12 }}>({u.email})</span>
                </Space>
              ),
              value: u.id,
            }))}
            filterOption={(input, option) => {
              const user = availableUsers.find((u) => u.id === option?.value);
              if (!user) return false;
              const searchText = input.toLowerCase();
              return (
                user.name.toLowerCase().includes(searchText) ||
                user.email.toLowerCase().includes(searchText)
              );
            }}
          />

          <div style={{ marginBottom: 12 }}>
            <span style={{ marginRight: 8 }}>Permission:</span>
            <Radio.Group value={permission} onChange={(e) => setPermission(e.target.value)}>
              <Radio value="view">View Only</Radio>
              <Radio value="edit">Can Edit</Radio>
            </Radio.Group>
          </div>

          <Button
            type="primary"
            onClick={handleShare}
            loading={sharing}
            disabled={selectedUsers.length === 0 || loading}
            block
          >
            Share with {selectedUsers.length > 0 ? `${selectedUsers.length} user(s)` : 'selected users'}
          </Button>
        </div>

        {/* Currently shared users */}
        {sharedUsers.length > 0 && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>Currently shared with:</div>
            <List
              dataSource={sharedUsers}
              renderItem={(sharedUser: any) => (
                <List.Item
                  key={sharedUser.user_id || sharedUser.id}
                  actions={[
                    <Button
                      key="revoke"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleRevoke(sharedUser.id || sharedUser.user_id)}
                    >
                      Revoke
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar src={sharedUser.avatar_url} icon={<UserOutlined />} />
                    }
                    title={sharedUser.name}
                    description={
                      <Space>
                        <span style={{ color: '#888' }}>{sharedUser.email}</span>
                        <Tag color={sharedUser.permission === 'edit' ? 'blue' : 'default'}>
                          {sharedUser.permission === 'edit' ? 'Can Edit' : 'View Only'}
                        </Tag>
                      </Space>
                    }
                  />
                </List.Item>
              )}
              style={{
                maxHeight: 300,
                overflow: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: 8,
              }}
            />
          </div>
        )}

        {sharedUsers.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>
            This dashboard hasn't been shared with anyone yet.
          </div>
        )}
      </Space>
    </Modal>
  );
}
