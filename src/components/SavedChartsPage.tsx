import {
    ClockCircleOutlined,
    DeleteOutlined,
    FolderOpenOutlined,
    SearchOutlined,
    ShareAltOutlined
} from '@ant-design/icons';
import {
    Button,
    Empty,
    Input,
    List,
    message,
    Popconfirm,
    Select,
    Space,
    Spin,
    Tabs,
    Tag,
    Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { deleteChart, getSharedCharts, getUserCharts, SavedChart } from '../lib/charts';
import ShareChartModal from './ShareChartModal';

dayjs.extend(relativeTime);

const { TabPane } = Tabs;

interface SavedChartsPageProps {
  onNavigate: (key: string) => void;
}

type SortBy = 'name' | 'updated' | 'created';

const SavedChartsPage: React.FC<SavedChartsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [myCharts, setMyCharts] = useState<SavedChart[]>([]);
  const [sharedCharts, setSharedCharts] = useState<SavedChart[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('updated');
  const [activeTab, setActiveTab] = useState('my-charts');
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [chartToShare, setChartToShare] = useState<SavedChart | null>(null);

  useEffect(() => {
    if (user) {
      loadCharts();
    }
  }, [user]);

  const loadCharts = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [myChartsData, sharedChartsData] = await Promise.all([
        getUserCharts(user.id),
        getSharedCharts(user.id),
      ]);

      setMyCharts(myChartsData);
      setSharedCharts(sharedChartsData);
    } catch (error: any) {
      console.error('Error loading charts:', error);
      message.error(`Failed to load charts: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChart = async (chartId: string) => {
    try {
      await deleteChart(chartId);
      message.success('Chart deleted successfully');

      // Update local state immediately
      setMyCharts(prev => prev.filter(c => c.id !== chartId));
      setSharedCharts(prev => prev.filter(c => c.id !== chartId));
    } catch (error: any) {
      console.error('Error deleting chart:', error);
      message.error(`Failed to delete chart: ${error.message}`);
    }
  };

  const handleLoadChart = (chart: SavedChart) => {
    const chartCategory = chart.chart_category as 'insights' | 'funnels';
    message.info(`Loading ${chart.name}...`);
    // Store chart in sessionStorage and navigate
    sessionStorage.setItem('chartToLoad', JSON.stringify(chart));
    onNavigate(chartCategory);
  };

  const handleShareClick = (chart: SavedChart) => {
    setChartToShare(chart);
    setShareModalVisible(true);
  };

  const handleShareModalClose = () => {
    setShareModalVisible(false);
    setChartToShare(null);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'insights':
        return '#1890FF';
      case 'funnels':
        return '#13C2C2';
      default:
        return '#666';
    }
  };

  // Filter and sort logic
  const filterAndSortCharts = (charts: SavedChart[]) => {
    let filtered = [...charts];

    // Apply search filter
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(
        (chart) =>
          chart.name.toLowerCase().includes(search) ||
          chart.description.toLowerCase().includes(search)
      );
    }

    // Apply category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter((chart) => chart.chart_category === filterCategory);
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
  const renderListItem = (chart: SavedChart, isShared: boolean = false) => (
    <List.Item
      key={chart.id}
      style={{
        padding: '16px 20px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: 8,
        borderRadius: 8,
        transition: 'all 0.3s ease',
        cursor: 'pointer',
      }}
      onClick={() => handleLoadChart(chart)}
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
                handleShareClick(chart);
              }}
            />
          </Tooltip>
        ),
        !isShared && (
          <Popconfirm
            key="delete"
            title="Delete chart?"
            description="This action cannot be undone."
            onConfirm={(e) => {
              e?.stopPropagation();
              handleDeleteChart(chart.id);
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
            <span style={{ fontWeight: 600 }}>{chart.name || 'Untitled Chart'}</span>
            <Tag color={getCategoryColor(chart.chart_category)} style={{ marginLeft: 8 }}>
              {chart.chart_category.charAt(0).toUpperCase() + chart.chart_category.slice(1)}
            </Tag>
            {isShared && <Tag color="orange">Shared</Tag>}
            {isShared && chart.permission && (
              <Tag color={chart.permission === 'edit' ? 'blue' : 'green'}>
                {chart.permission === 'edit' ? 'Can Edit' : 'View Only'}
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
              {chart.description || 'No description'}
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>
              <ClockCircleOutlined /> Updated {dayjs(chart.updated_at).fromNow()} • Created{' '}
              {dayjs(chart.created_at).format('MMM D, YYYY')}
              {chart.created_by_name && ` • Created by ${chart.created_by_name}`}
            </div>
          </div>
        }
      />
    </List.Item>
  );

  const renderContent = () => {
    const charts = activeTab === 'my-charts' ? myCharts : sharedCharts;
    const filteredCharts = filterAndSortCharts(charts);
    const isShared = activeTab === 'shared-charts';

    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#888' }}>Loading charts...</div>
        </div>
      );
    }

    if (filteredCharts.length === 0) {
      return (
        <Empty
          image={<FolderOpenOutlined style={{ fontSize: 64, color: '#666' }} />}
          description={
            <Space direction="vertical">
              <span style={{ color: '#888' }}>
                {searchText || filterCategory !== 'all'
                  ? 'No charts match your filters'
                  : isShared
                  ? 'No charts have been shared with you'
                  : 'No saved charts yet'}
              </span>
              {!searchText && filterCategory === 'all' && !isShared && (
                <Button type="primary" onClick={() => onNavigate('insights')}>
                  Create Your First Chart
                </Button>
              )}
            </Space>
          }
          style={{ padding: '60px 0' }}
        />
      );
    }

    return (
      <List
        dataSource={filteredCharts}
        renderItem={(chart) => renderListItem(chart, isShared)}
        style={{ background: 'transparent' }}
      />
    );
  };

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8 }}>
          <FolderOpenOutlined style={{ marginRight: 12, color: '#9D6CFF' }} />
          Saved Charts
        </h1>
        <p style={{ color: '#888', margin: 0 }}>
          Browse, manage, and load your saved analytics charts
        </p>
      </div>

      {/* Filters and Controls */}
      <div style={{ marginBottom: 24 }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="Search charts..."
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Space>
            <Select
              value={filterCategory}
              onChange={setFilterCategory}
              style={{ width: 150 }}
              options={[
                { label: 'All Categories', value: 'all' },
                { label: 'Insights', value: 'insights' },
                { label: 'Funnels', value: 'funnels' },
              ]}
            />
            <Select
              value={sortBy}
              onChange={setSortBy}
              style={{ width: 150 }}
              options={[
                { label: 'Last Modified', value: 'updated' },
                { label: 'Name (A-Z)', value: 'name' },
                { label: 'Created Date', value: 'created' },
              ]}
            />
          </Space>
        </Space>
      </div>

      {/* Tabs for My Charts / Shared with Me */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="large"
        style={{ marginBottom: 24 }}
      >
        <TabPane
          tab={`My Charts (${myCharts.length})`}
          key="my-charts"
        />
        <TabPane
          tab={`Shared with Me (${sharedCharts.length})`}
          key="shared-charts"
        />
      </Tabs>

      {/* Content */}
      {renderContent()}

      {/* Share Modal */}
      <ShareChartModal
        visible={shareModalVisible}
        chart={chartToShare}
        onClose={handleShareModalClose}
      />
    </div>
  );
};

export default SavedChartsPage;
