import { DeleteOutlined, ShareAltOutlined, UserOutlined } from '@ant-design/icons';
import {
    Avatar,
    Button,
    Divider,
    List,
    message,
    Modal,
    Radio,
    Select,
    Space,
    Spin,
    Tag,
    Typography,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getChartShares, revokeChartShare, SavedChart, shareChart } from '../lib/charts';
import { getUsersForSharing } from '../lib/users';

const { Text } = Typography;

interface ShareChartModalProps {
  visible: boolean;
  chart: SavedChart | null;
  onClose: () => void;
}

interface UserOption {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
}

interface SharedUser extends UserOption {
  permission: 'view' | 'edit';
  shared_by_user_id: string;
}

const ShareChartModal: React.FC<ShareChartModalProps> = ({ visible, chart, onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (visible && chart && chart.id) {
      loadData();
    }
  }, [visible, chart?.id]);

  const loadData = async () => {
    if (!chart || !chart.id || !user) {
      console.error('Missing required data:', { chart: !!chart, chartId: chart?.id, user: !!user });
      return;
    }

    setLoading(true);
    try {
      const [users, shares] = await Promise.all([
        getUsersForSharing(user.id),
        getChartShares(chart.id),
      ]);

      // Filter out already shared users (current user already excluded by getUsersForSharing)
      const sharedUserIds = shares.map((s: any) => s.id);
      const filteredUsers = users.filter(
        (u: any) => !sharedUserIds.includes(u.id)
      );

      setAvailableUsers(filteredUsers);
      setSharedUsers(shares);
    } catch (error: any) {
      console.error('Error loading share data:', error);
      message.error(`Failed to load data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!chart || !user || selectedUsers.length === 0) return;

    setSharing(true);
    try {
      await shareChart(chart.id, selectedUsers, permission, user.id);
      
      // Wait for ClickHouse INSERT mutation to propagate
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reload data to update the shared users list
      await loadData();
      
      message.success(`Chart shared with ${selectedUsers.length} user(s)`);
      setSelectedUsers([]);
    } catch (error: any) {
      console.error('Error sharing chart:', error);
      message.error(`Failed to share chart: ${error.message}`);
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (userId: string, userName: string) => {
    if (!chart) return;

    if (!userId) {
      console.error('handleRevoke called with undefined userId:', { userId, userName });
      message.error('Cannot revoke access: User ID is missing');
      return;
    }

    try {
      // Revoke access in database
      await revokeChartShare(chart.id, userId);
      
      // Wait briefly for ClickHouse ALTER UPDATE mutation to propagate
      // ClickHouse mutations are asynchronous and may not be immediately visible
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reload data to refresh both shared users list and available users list
      // loadData() handles its own loading state
      await loadData();
      
      // Show success message only after data is reloaded
      message.success(`Access revoked for ${userName}`);
    } catch (error: any) {
      console.error('Error revoking access:', error);
      message.error(`Failed to revoke access: ${error.message}`);
      // Ensure loading state is reset on error (loadData might not have been called)
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedUsers([]);
    setPermission('view');
    onClose();
  };

  // Don't render anything if chart is not properly set
  if (!chart || !chart.id) {
    return null;
  }

  return (
    <Modal
      title={
        <Space>
          <ShareAltOutlined />
          <span>Share Chart</span>
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      style={{ top: 20 }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div>
          {/* Chart Info */}
          <div
            style={{
              padding: 16,
              background: 'rgba(157, 108, 255, 0.1)',
              borderRadius: 8,
              marginBottom: 24,
            }}
          >
            <Text strong style={{ fontSize: 16 }}>
              {chart.name}
            </Text>
            {chart.description && (
              <div style={{ marginTop: 4, color: '#888' }}>{chart.description}</div>
            )}
          </div>

          {/* Share with new users */}
          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Share with Users
            </Text>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Select
                mode="multiple"
                placeholder="Select users to share with..."
                style={{ width: '100%' }}
                value={selectedUsers}
                onChange={setSelectedUsers}
                optionFilterProp="label"
                showSearch
                options={availableUsers.map((u) => ({
                  value: u.id,
                  label: `${u.name} (${u.email})`,
                }))}
                maxTagCount="responsive"
              />

              <Radio.Group value={permission} onChange={(e) => setPermission(e.target.value)}>
                <Radio value="view">
                  <Space direction="vertical" size={0}>
                    <Text strong>View Only</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Can view and load the chart
                    </Text>
                  </Space>
                </Radio>
                <Radio value="edit" style={{ marginTop: 8 }}>
                  <Space direction="vertical" size={0}>
                    <Text strong>Can Edit</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Can view, load, and modify the chart
                    </Text>
                  </Space>
                </Radio>
              </Radio.Group>

              <Button
                type="primary"
                icon={<ShareAltOutlined />}
                onClick={handleShare}
                loading={sharing}
                disabled={selectedUsers.length === 0}
                block
              >
                Share Chart
              </Button>
            </Space>
          </div>

          {/* Currently shared users */}
          {sharedUsers.length > 0 && (
            <>
              <Divider />
              <div>
                <Text strong style={{ display: 'block', marginBottom: 12 }}>
                  Shared With ({sharedUsers.length})
                </Text>
                <List
                  dataSource={sharedUsers}
                  renderItem={(sharedUser) => (
                    <List.Item
                      key={sharedUser.id}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                      actions={[
                        <Button
                          key="revoke"
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleRevoke(sharedUser.id, sharedUser.name)}
                        >
                          Revoke
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={
                          sharedUser.avatar_url ? (
                            <Avatar src={sharedUser.avatar_url} />
                          ) : (
                            <Avatar icon={<UserOutlined />} style={{ background: '#9D6CFF' }} />
                          )
                        }
                        title={
                          <Space>
                            {sharedUser.name}
                            <Tag color={sharedUser.permission === 'edit' ? 'orange' : 'blue'}>
                              {sharedUser.permission === 'edit' ? 'Can Edit' : 'View Only'}
                            </Tag>
                          </Space>
                        }
                        description={sharedUser.email}
                      />
                    </List.Item>
                  )}
                  style={{ maxHeight: 300, overflow: 'auto' }}
                />
              </div>
            </>
          )}

          {/* Empty state */}
          {sharedUsers.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: 24,
                color: '#888',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 8,
              }}
            >
              <ShareAltOutlined style={{ fontSize: 32, marginBottom: 8 }} />
              <div>This chart is not shared with anyone yet</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ShareChartModal;

