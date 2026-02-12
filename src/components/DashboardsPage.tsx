import {
    ClockCircleOutlined,
    DeleteOutlined,
    PlusOutlined,
    SearchOutlined,
    ShareAltOutlined
} from '@ant-design/icons';
import {
    Button,
    Empty,
    Input,
    List,
    Popconfirm,
    Select,
    Space,
    Tabs,
    Tag,
    Tooltip,
    message
} from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Dashboard, deleteDashboard, getSharedDashboards, getUserDashboards } from '../lib/dashboards';
import CreateDashboardModal from './CreateDashboardModal';
import ShareDashboardModal from './ShareDashboardModal';

dayjs.extend(relativeTime);

const { Search } = Input;
const { TabPane } = Tabs;

interface DashboardsPageProps {
  onNavigate: (page: string) => void;
  onNavigateToDashboard: (dashboardId: string) => void;
}

export default function DashboardsPage({ onNavigate: _onNavigate, onNavigateToDashboard }: DashboardsPageProps) {
  const { user } = useAuth();
  const [myDashboards, setMyDashboards] = useState<Dashboard[]>([]);
  const [sharedDashboards, setSharedDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'updated' | 'created'>('updated');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [dashboardToShare, setDashboardToShare] = useState<Dashboard | null>(null);
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');

  useEffect(() => {
    loadDashboards();
  }, [user]);

  const loadDashboards = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [myDash, sharedDash] = await Promise.all([
        getUserDashboards(user.id),
        getSharedDashboards(user.id),
      ]);
      setMyDashboards(myDash);
      setSharedDashboards(sharedDash);
    } catch (error: any) {
      console.error('Error loading dashboards:', error);
      message.error('Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDashboard = async (dashboardId: string) => {
    try {
      await deleteDashboard(dashboardId);

      // Wait for ClickHouse mutation to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success('Dashboard deleted');
      await loadDashboards();
    } catch (error: any) {
      console.error('Error deleting dashboard:', error);
      message.error('Failed to delete dashboard');
    }
  };

  const handleShareClick = (dashboard: Dashboard) => {
    setDashboardToShare(dashboard);
    setShareModalVisible(true);
  };

  const handleShareModalClose = () => {
    setShareModalVisible(false);
    setDashboardToShare(null);
  };

  const handleDashboardCreated = async () => {
    await loadDashboards();
  };

  const getFilteredAndSortedDashboards = (dashboards: Dashboard[]) => {
    let filtered = [...dashboards];

    // Apply search filter
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(
        (dashboard) =>
          dashboard.name.toLowerCase().includes(search) ||
          dashboard.description.toLowerCase().includes(search)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return dayjs(b.created_at).unix() - dayjs(a.created_at).unix();
        case 'updated':
        default:
          return dayjs(b.updated_at).unix() - dayjs(a.updated_at).unix();
      }
    });

    return filtered;
  };

  // List View Row Component
  const renderListItem = (dashboard: Dashboard, isShared: boolean = false) => (
    <List.Item
      key={dashboard.id}
      style={{
        padding: '16px 20px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: 8,
        borderRadius: 8,
        transition: 'all 0.3s ease',
        cursor: 'pointer',
      }}
      onClick={() => onNavigateToDashboard(dashboard.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
        e.currentTarget.style.borderColor = 'rgba(157, 108, 255, 0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      }}
      actions={[
        !isShared && (
          <Tooltip key="share" title="Share">
            <Button
              size="small"
              icon={<ShareAltOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleShareClick(dashboard);
              }}
            />
          </Tooltip>
        ),
        !isShared && (
          <Popconfirm
            key="delete"
            title="Delete dashboard?"
            description="This action cannot be undone."
            onConfirm={(e) => {
              e?.stopPropagation();
              handleDeleteDashboard(dashboard.id);
            }}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        ),
      ].filter(Boolean)}
    >
      <List.Item.Meta
        title={
          <Space>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{dashboard.name || 'Untitled Dashboard'}</span>
            {isShared && <Tag color="orange">Shared</Tag>}
            {isShared && dashboard.permission && (
              <Tag color={dashboard.permission === 'edit' ? 'blue' : 'green'}>
                {dashboard.permission === 'edit' ? 'Can Edit' : 'View Only'}
              </Tag>
            )}
          </Space>
        }
        description={
          <div>
            <div
              style={{
                color: '#888',
                marginBottom: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {dashboard.description || 'No description'}
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>
              <ClockCircleOutlined /> Updated {dayjs(dashboard.updated_at).fromNow()} • Created{' '}
              {dayjs(dashboard.created_at).format('MMM D, YYYY')}
              {dashboard.created_by_name && ` • Created by ${dashboard.created_by_name}`}
            </div>
          </div>
        }
      />
    </List.Item>
  );

  const currentDashboards =
    activeTab === 'my'
      ? getFilteredAndSortedDashboards(myDashboards)
      : getFilteredAndSortedDashboards(sharedDashboards);

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
          Dashboards
        </h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
          New Dashboard
        </Button>
      </div>

      {/* Filters and Controls */}
      <div style={{ marginBottom: 24 }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Search
            placeholder="Search dashboards..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Space>
            <Select
              value={sortBy}
              onChange={setSortBy}
              style={{ width: 150 }}
              options={[
                { label: 'Last Modified', value: 'updated' },
                { label: 'Name', value: 'name' },
                { label: 'Created Date', value: 'created' },
              ]}
            />
          </Space>
        </Space>
      </div>

      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as 'my' | 'shared')}>
        <TabPane
          tab={`My Dashboards (${myDashboards.length})`}
          key="my"
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>Loading dashboards...</div>
          ) : currentDashboards.length === 0 ? (
            <Empty
              description={
                searchText
                  ? 'No dashboards match your search'
                  : 'No dashboards yet. Create your first dashboard!'
              }
              style={{ padding: 60 }}
            >
              {!searchText && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                  Create Dashboard
                </Button>
              )}
            </Empty>
          ) : (
            <List
              dataSource={currentDashboards}
              renderItem={(dashboard) => renderListItem(dashboard, false)}
            />
          )}
        </TabPane>

        <TabPane
          tab={`Shared with Me (${sharedDashboards.length})`}
          key="shared"
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>Loading dashboards...</div>
          ) : currentDashboards.length === 0 ? (
            <Empty
              description={
                searchText
                  ? 'No dashboards match your search'
                  : 'No dashboards shared with you yet'
              }
              style={{ padding: 60 }}
            />
          ) : (
            <List
              dataSource={currentDashboards}
              renderItem={(dashboard) => renderListItem(dashboard, true)}
            />
          )}
        </TabPane>
      </Tabs>

      {/* Create Dashboard Modal */}
      <CreateDashboardModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreated={handleDashboardCreated}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      {/* Share Dashboard Modal */}
      {dashboardToShare && (
        <ShareDashboardModal
          visible={shareModalVisible}
          dashboard={dashboardToShare}
          onClose={handleShareModalClose}
        />
      )}
    </div>
  );
}
