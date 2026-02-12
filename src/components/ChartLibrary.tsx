import {
    DeleteOutlined,
    SearchOutlined,
    ShareAltOutlined,
} from '@ant-design/icons';
import {
    Button,
    Card,
    Drawer,
    Empty,
    Input,
    message,
    Popconfirm,
    Spin,
    Tabs,
    Tag,
    Tooltip
} from 'antd';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { deleteChart, getSharedCharts, getUserCharts, SavedChart } from '../lib/charts';
import ShareChartModal from './ShareChartModal';

const { TabPane } = Tabs;

interface ChartLibraryProps {
  visible: boolean;
  onClose: () => void;
  onLoadChart: (chart: SavedChart) => void;
  onShareChart?: (chartId: string) => void;
  onNavigate?: (page: 'insights' | 'funnels') => void;
  currentPage?: 'insights' | 'funnels';
}

const ChartLibrary: React.FC<ChartLibraryProps> = ({
  visible,
  onClose,
  onLoadChart,
  onNavigate,
  currentPage,
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [myCharts, setMyCharts] = useState<SavedChart[]>([]);
  const [sharedCharts, setSharedCharts] = useState<SavedChart[]>([]);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('my-charts');
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [chartToShare, setChartToShare] = useState<SavedChart | null>(null);

  useEffect(() => {
    if (visible && user) {
      loadCharts();
    }
  }, [visible, user]);

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

      // FIX: Update local state immediately for instant UI feedback
      setMyCharts(prev => prev.filter(c => c.id !== chartId));
      setSharedCharts(prev => prev.filter(c => c.id !== chartId));
    } catch (error: any) {
      console.error('Error deleting chart:', error);
      message.error(`Failed to delete chart: ${error.message}`);
    }
  };

  const handleLoadChart = (chart: SavedChart) => {
    // Check if we need to navigate to the correct page
    const chartCategory = chart.chart_category as 'insights' | 'funnels';

    if (currentPage && chartCategory !== currentPage) {
      // Navigate to the correct page with the chart
      if (onNavigate) {
        message.info(`Navigating to ${chartCategory} page...`);
        // Store chart in sessionStorage and navigate
        sessionStorage.setItem('chartToLoad', JSON.stringify(chart));
        onNavigate(chartCategory);
        onClose();
        setTimeout(() => {
          onLoadChart(chart);
          message.success(`Loaded chart: ${chart.name}`);
        }, 300);
      }
    } else {
      // Same page, load directly
      onLoadChart(chart);
      onClose();
      message.success(`Loaded chart: ${chart.name}`);
    }
  };

  const handleShareClick = (chart: SavedChart) => {
    setChartToShare(chart);
    setShareModalVisible(true);
  };

  const handleShareModalClose = () => {
    setShareModalVisible(false);
    setChartToShare(null);
  };

  const filterCharts = (charts: SavedChart[]) => {
    if (!searchText.trim()) return charts;
    const search = searchText.toLowerCase();
    return charts.filter(
      (chart) =>
        chart.name.toLowerCase().includes(search) ||
        chart.description.toLowerCase().includes(search)
    );
  };

  const renderChartCard = (chart: SavedChart, isShared: boolean = false) => (
    <Card
      key={chart.id}
      hoverable
      style={{
        marginBottom: 12,
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        cursor: 'pointer',
      }}
      bodyStyle={{ padding: 16 }}
      onClick={() => handleLoadChart(chart)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#e8e8e8' }}>
              {chart.name}
            </span>
          </div>

          {chart.description && (
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 12 }}>
              {chart.description}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="blue">{chart.chart_category}</Tag>
            <Tag color="default">
              {dayjs(chart.updated_at).format('MMM DD, YYYY')}
            </Tag>
            {isShared && <Tag color="green">Shared with you</Tag>}
          </div>
        </div>

        {!isShared && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
            <Tooltip title="Share">
              <Button
                icon={<ShareAltOutlined />}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShareClick(chart);
                }}
              />
            </Tooltip>

            <Popconfirm
              title="Delete this chart?"
              description="This action cannot be undone."
              onConfirm={(e) => {
                e?.stopPropagation();
                handleDeleteChart(chart.id);
              }}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <Drawer
      title="Chart Library"
      placement="right"
      open={visible}
      onClose={onClose}
      width={600}
      styles={{
        body: { padding: 24, background: '#0a0a0a' },
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="Search charts..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={`My Charts (${myCharts.length})`} key="my-charts">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
            </div>
          ) : filterCharts(myCharts).length > 0 ? (
            <div style={{ marginTop: 16 }}>
              {filterCharts(myCharts).map((chart) => renderChartCard(chart, false))}
            </div>
          ) : (
            <Empty
              description={
                searchText
                  ? 'No charts match your search'
                  : 'You haven\'t saved any charts yet'
              }
              style={{ marginTop: 40 }}
            />
          )}
        </TabPane>

        <TabPane tab={`Shared with Me (${sharedCharts.length})`} key="shared-charts">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
            </div>
          ) : filterCharts(sharedCharts).length > 0 ? (
            <div style={{ marginTop: 16 }}>
              {filterCharts(sharedCharts).map((chart) => renderChartCard(chart, true))}
            </div>
          ) : (
            <Empty
              description={
                searchText
                  ? 'No charts match your search'
                  : 'No charts have been shared with you'
              }
              style={{ marginTop: 40 }}
            />
          )}
        </TabPane>
      </Tabs>

      {/* Share Modal */}
      <ShareChartModal
        visible={shareModalVisible}
        chart={chartToShare}
        onClose={handleShareModalClose}
      />
    </Drawer>
  );
};

export default ChartLibrary;
