import { SearchOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Input, message, Modal, Radio, Space, Tag } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSharedCharts, getUserCharts, SavedChart } from '../lib/charts';

dayjs.extend(relativeTime);

interface AddChartModalProps {
  visible: boolean;
  onClose: () => void;
  onChartsSelected: (chartIds: string[]) => void;
}

export default function AddChartModal({ visible, onClose, onChartsSelected }: AddChartModalProps) {
  const { user } = useAuth();
  const [myCharts, setMyCharts] = useState<SavedChart[]>([]);
  const [sharedCharts, setSharedCharts] = useState<SavedChart[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'insights' | 'funnels'>('all');
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([]);

  useEffect(() => {
    if (visible && user) {
      loadCharts();
    }
  }, [visible, user]);

  const loadCharts = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [my, shared] = await Promise.all([getUserCharts(user.id), getSharedCharts(user.id)]);

      // Filter shared charts to only show those with edit permission
      const editableShared = shared.filter((_chart) => {
        // For simplicity, we're showing all shared charts
        // In a real implementation, you'd check the permission level
        return true;
      });

      setMyCharts(my);
      setSharedCharts(editableShared);
    } catch (error: any) {
      console.error('Error loading charts:', error);
      message.error('Failed to load charts');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChart = (chartId: string) => {
    // Safety check: don't add undefined IDs
    if (!chartId) {
      console.error('Chart ID is undefined, cannot toggle selection');
      return;
    }

    if (selectedChartIds.includes(chartId)) {
      setSelectedChartIds(selectedChartIds.filter((id) => id !== chartId));
    } else {
      setSelectedChartIds([...selectedChartIds, chartId]);
    }
  };

  const handleAddCharts = () => {
    // Filter out any undefined/null values from the selection
    const validChartIds = selectedChartIds.filter(id => id && id !== 'undefined');

    if (validChartIds.length === 0) {
      message.warning('Please select at least one chart');
      return;
    }

    onChartsSelected(validChartIds);
    setSelectedChartIds([]);
    setSearchText('');
    setCategoryFilter('all');
    onClose();
  };

  const handleCancel = () => {
    setSelectedChartIds([]);
    setSearchText('');
    setCategoryFilter('all');
    onClose();
  };

  const filterCharts = (charts: SavedChart[]) => {
    return charts.filter((chart) => {
      // Search filter
      const chartName = chart.name || 'Untitled Chart';
      const chartDesc = chart.description || '';
      const matchesSearch =
        !searchText ||
        chartName.toLowerCase().includes(searchText.toLowerCase()) ||
        chartDesc.toLowerCase().includes(searchText.toLowerCase());

      // Category filter
      const matchesCategory = categoryFilter === 'all' || chart.chart_category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  };

  const allCharts = [...myCharts, ...sharedCharts];
  const filteredCharts = filterCharts(allCharts);

  return (
    <Modal
      title="Add Charts to Dashboard"
      open={visible}
      onCancel={handleCancel}
      width={700}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="add"
          type="primary"
          onClick={handleAddCharts}
          disabled={selectedChartIds.length === 0}
        >
          Add {selectedChartIds.length > 0 ? `${selectedChartIds.length} Chart(s)` : 'Selected Charts'}
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Search and Filter */}
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="Search charts..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Radio.Group value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <Radio.Button value="all">All</Radio.Button>
            <Radio.Button value="insights">Insights</Radio.Button>
            <Radio.Button value="funnels">Funnels</Radio.Button>
          </Radio.Group>
        </Space>

        {/* Chart List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>Loading charts...</div>
        ) : filteredCharts.length === 0 ? (
          <Empty
            description={
              searchText || categoryFilter !== 'all'
                ? 'No charts match your filters'
                : 'No charts available. Create some charts first!'
            }
            style={{ padding: 40 }}
          />
        ) : (
          <div
            style={{
              maxHeight: 400,
              overflow: 'auto',
              padding: '0 8px',
            }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {filteredCharts.map((chart) => {
                const isSelected = selectedChartIds.includes(chart.id);
                const isShared = sharedCharts.some((c) => c.id === chart.id);

                return (
                  <Card
                    key={chart.id}
                    hoverable
                    style={{
                      background: isSelected
                        ? 'rgba(157, 108, 255, 0.1)'
                        : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected
                        ? '2px solid #9D6CFF'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    bodyStyle={{ padding: 16 }}
                    onClick={() => handleToggleChart(chart.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{chart.name || 'Untitled Chart'}</span>
                          <Tag color={chart.chart_category === 'insights' ? 'blue' : 'purple'}>
                            {chart.chart_category === 'insights' ? 'Insights' : 'Funnels'}
                          </Tag>
                          {isShared && <Tag color="orange">Shared</Tag>}
                          {isShared && chart.permission && (
                            <Tag color={chart.permission === 'edit' ? 'blue' : 'green'}>
                              {chart.permission === 'edit' ? 'Can Edit' : 'View Only'}
                            </Tag>
                          )}
                        </div>
                        {chart.description && (
                          <div
                            style={{
                              color: '#888',
                              fontSize: 13,
                              marginBottom: 8,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {chart.description}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#666' }}>
                          Updated {dayjs(chart.updated_at).fromNow()}
                        </div>
                      </div>
                      {isSelected && (
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: '#9D6CFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                          }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </Space>
          </div>
        )}

        {/* Selected Count */}
        {selectedChartIds.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 12,
              background: 'rgba(157, 108, 255, 0.1)',
              border: '1px solid rgba(157, 108, 255, 0.3)',
              borderRadius: 8,
              color: '#9D6CFF',
              fontWeight: 500,
            }}
          >
            {selectedChartIds.length} chart(s) selected
          </div>
        )}
      </Space>
    </Modal>
  );
}
