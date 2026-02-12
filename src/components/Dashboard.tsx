import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, FileImageOutlined, FilePdfOutlined, FileTextOutlined, PlusOutlined, SaveOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Button, Card, Dropdown, Popconfirm, Space, Spin, Tooltip, message } from 'antd';
import { useEffect, useState } from 'react';
import { Layout as GridLayout, Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useAuth } from '../contexts/AuthContext';
import { SavedChart, getSavedChartById } from '../lib/charts';
import { Dashboard as DashboardType, addChartToDashboard, deleteDashboard, getDashboardById, getDashboardCharts, removeChartFromDashboard, updateChartPosition, updateDashboard } from '../lib/dashboards';
import { exportDashboardToCSV, exportDashboardToPDF, exportDashboardToPNG } from '../utils/exportUtils';
import AddChartModal from './AddChartModal';
import ChartRenderer from './ChartRenderer';
import ShareDashboardModal from './ShareDashboardModal';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardProps {
  dashboardId: string;
  onNavigate: (page: string) => void;
  onNavigateToDashboard: (dashboardId: string) => void;
}

interface DashboardChartWithConfig {
  dashboard_id: string;
  chart_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  chart?: SavedChart;
}

export default function Dashboard({ dashboardId, onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardType | null>(null);
  const [dashboardCharts, setDashboardCharts] = useState<DashboardChartWithConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [addChartModalVisible, setAddChartModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [layout, setLayout] = useState<GridLayout[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (dashboardId) {
      loadDashboard();
    }
  }, [dashboardId]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [dash, charts] = await Promise.all([getDashboardById(dashboardId), getDashboardCharts(dashboardId)]);

      if (!dash) {
        message.error('Dashboard not found');
        onNavigate('dashboards');
        return;
      }

      setDashboard(dash);

      // Load chart configurations
      const chartsWithConfig = await Promise.all(
        charts.map(async (chart) => {
          try {
            const chartConfig = await getSavedChartById(chart.chart_id);
            return { ...chart, chart: chartConfig || undefined };
          } catch (error) {
            console.error(`Error loading chart ${chart.chart_id}:`, error);
            return { ...chart, chart: undefined };
          }
        })
      );

      setDashboardCharts(chartsWithConfig);

      // Build grid layout from dashboard charts
      const gridLayout = chartsWithConfig.map((chart) => ({
        i: chart.chart_id,
        x: chart.position_x,
        y: chart.position_y,
        w: chart.width,
        h: chart.height,
      }));

      setLayout(gridLayout);
    } catch (error: any) {
      console.error('Error loading dashboard:', error);
      message.error('Failed to load dashboard');
      onNavigate('dashboards');
    } finally {
      setLoading(false);
    }
  };

  const handleLayoutChange = (newLayout: GridLayout[]) => {
    if (editMode) {
      setLayout(newLayout);
    }
  };

  const handleSaveLayout = async () => {
    if (!dashboard) return;

    setSaving(true);
    try {
      // Update each chart position
      for (const layoutItem of layout) {
        await updateChartPosition(dashboardId, layoutItem.i, {
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
        });
      }

      // Wait for ClickHouse mutations to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Update dashboard updated_at timestamp
      await updateDashboard(dashboardId);

      message.success('Layout saved successfully');
      setEditMode(false);
      await loadDashboard();
    } catch (error: any) {
      console.error('Error saving layout:', error);
      message.error('Failed to save layout');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    setEditMode(false);
    await loadDashboard(); // Reload to discard changes
  };

  const handleAddCharts = async (chartIds: string[]) => {
    if (!dashboard) return;

    try {
      // Find next available position
      let maxY = 0;
      layout.forEach((item) => {
        const bottom = item.y + item.h;
        if (bottom > maxY) maxY = bottom;
      });

      // Add each chart
      for (let i = 0; i < chartIds.length; i++) {
        const chartId = chartIds[i];
        const position = {
          x: (i * 6) % 12, // Start new row every 2 charts
          y: maxY + Math.floor((i * 6) / 12) * 4,
          w: 6,
          h: 4,
        };

        await addChartToDashboard(dashboardId, chartId, position);
      }

      // Wait for ClickHouse mutations to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success(`Added ${chartIds.length} chart(s) to dashboard`);
      await loadDashboard();
    } catch (error: any) {
      console.error('Error adding charts:', error);
      message.error('Failed to add charts');
    }
  };

  const handleRemoveChart = async (chartId: string) => {
    try {
      await removeChartFromDashboard(dashboardId, chartId);

      // Wait for ClickHouse mutation to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success('Chart removed from dashboard');
      await loadDashboard();
    } catch (error: any) {
      console.error('Error removing chart:', error);
      message.error('Failed to remove chart');
    }
  };

  const handleDeleteDashboard = async () => {
    try {
      await deleteDashboard(dashboardId);

      // Wait for ClickHouse mutation to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success('Dashboard deleted');
      onNavigate('dashboards');
    } catch (error: any) {
      console.error('Error deleting dashboard:', error);
      message.error('Failed to delete dashboard');
    }
  };

  const handleExportToPDF = async () => {
    if (!dashboard) return;

    try {
      const dashboardElement = document.getElementById('dashboard-container');
      if (!dashboardElement) {
        message.error('Dashboard container not found');
        return;
      }

      await exportDashboardToPDF(dashboardElement, dashboard.name);
    } catch (error: any) {
      console.error('Error exporting dashboard to PDF:', error);
      message.error(`Failed to export PDF: ${error.message}`);
    }
  };

  const handleExportToPNG = async () => {
    if (!dashboard) return;

    try {
      const dashboardElement = document.getElementById('dashboard-container');
      if (!dashboardElement) {
        message.error('Dashboard container not found');
        return;
      }

      await exportDashboardToPNG(dashboardElement, dashboard.name);
    } catch (error: any) {
      console.error('Error exporting dashboard to PNG:', error);
      message.error(`Failed to export PNG: ${error.message}`);
    }
  };

  const handleExportToCSV = async () => {
    if (!dashboard) return;

    try {
      message.loading({ content: 'Extracting data from charts...', key: 'csv-export', duration: 0 });

      // Import ClickHouse functions dynamically
      const { getEventTrend, getEventTrendWithBreakdown } = await import('../lib/clickhouse');
      const { getFunnelData, getFunnelDataWithBreakdown } = await import('../lib/clickhouse');
      const { getAbsoluteDateRange } = await import('../lib/dateRanges');

      const chartsData: Array<{ name: string; data: any[]; headers?: string[] }> = [];

      // Process each chart
      for (const dashChart of dashboardCharts) {
        if (!dashChart.chart) {
          continue;
        }

        try {
          const chartConfig = JSON.parse(dashChart.chart.config);
          const chartCategory = dashChart.chart.chart_category;

          let chartData: any[] = [];
          let headers: string[] = [];

          if (chartCategory === 'insights') {
            // Extract Insights chart data
            const { dataSources, dateRangeConfig, granularity, breakdownProperties } = chartConfig;

            if (!dateRangeConfig || !dataSources || dataSources.length === 0) {
              continue;
            }

            // Convert date range to absolute dates
            const [startDate, endDate] = getAbsoluteDateRange(dateRangeConfig);
            const startDateStr = startDate.format('YYYY-MM-DD');
            const endDateStr = endDate.format('YYYY-MM-DD');

            const hasBreakdown = breakdownProperties && breakdownProperties.length > 0;

            if (hasBreakdown) {
              // Get breakdown data (one event at a time)
              const eventName = dataSources[0].eventNames[0]; // First event only for breakdown
              const breakdownData = await getEventTrendWithBreakdown(
                dataSources[0].tableName,
                eventName,
                startDateStr,
                endDateStr,
                granularity || 'daily',
                breakdownProperties,
                dataSources[0].filters || []
              );

              // Flatten breakdown data for CSV
              breakdownData.forEach((breakdown) => {
                breakdown.data.forEach((point: any) => {
                  chartData.push({
                    segment: breakdown.segmentName,
                    date: point.date,
                    count: point.count,
                  });
                });
              });

              headers = ['segment', 'date', 'count'];
            } else {
              // Get regular trend data (one event at a time)
              for (const dataSource of dataSources) {
                for (const eventName of dataSource.eventNames) {
                  const trendData = await getEventTrend(
                    dataSource.tableName,
                    eventName,
                    startDateStr,
                    endDateStr,
                    granularity || 'daily',
                    dataSource.filters || []
                  );

                  trendData.forEach((point: any) => {
                    chartData.push({
                      table: dataSource.tableName,
                      event: eventName,
                      date: point.date,
                      count: point.count,
                    });
                  });
                }
              }

              headers = ['table', 'event', 'date', 'count'];
            }
          } else if (chartCategory === 'funnels') {
            // Extract Funnel chart data
            const { funnelSteps, dateRangeConfig, breakdownProperties, metricConfig } = chartConfig;

            if (!dateRangeConfig || !funnelSteps || funnelSteps.length === 0) {
              continue;
            }

            // Convert date range to absolute dates
            const [startDate, endDate] = getAbsoluteDateRange(dateRangeConfig);
            const startDateStr = startDate.format('YYYY-MM-DD');
            const endDateStr = endDate.format('YYYY-MM-DD');

            // NEW: Extract metric config with backwards compatibility
            const metric = metricConfig || { type: 'total' };

            // NEW: Get metric label for CSV header
            const getMetricLabel = (type: string, property?: string): string => {
              switch (type) {
                case 'total':
                  return 'conversions';
                case 'unique_users':
                  return 'unique_users';
                case 'sum':
                  return `sum_of_${property || 'property'}`;
                case 'average':
                  return `avg_${property || 'property'}`;
                case 'min':
                  return `min_${property || 'property'}`;
                case 'max':
                  return `max_${property || 'property'}`;
                default:
                  return 'count';
              }
            };
            const metricColumnName = getMetricLabel(metric.type, metric.property);

            const hasBreakdown = breakdownProperties && breakdownProperties.length > 0;

            if (hasBreakdown) {
              // Get breakdown funnel data (no tableName parameter!)
              const funnelBreakdowns = await getFunnelDataWithBreakdown(
                funnelSteps,
                startDateStr,
                endDateStr,
                breakdownProperties,
                undefined, // timeWindow
                metric // NEW: Pass metric config
              );

              // Flatten funnel breakdown data
              funnelBreakdowns.forEach((breakdown) => {
                breakdown.steps.forEach((step: any) => {
                  chartData.push({
                    segment: breakdown.segmentName,
                    step_number: step.stepNumber,
                    step_name: step.stepName,
                    [metricColumnName]: step.count, // NEW: Use metric label
                    conversion_rate: step.conversionRate,
                  });
                });
              });

              headers = ['segment', 'step_number', 'step_name', metricColumnName, 'conversion_rate'];
            } else {
              // Get regular funnel data (no tableName parameter!)
              const funnelData = await getFunnelData(
                funnelSteps,
                startDateStr,
                endDateStr,
                undefined, // timeWindow
                metric // NEW: Pass metric config
              );

              funnelData.forEach((step: any) => {
                chartData.push({
                  step_number: step.stepNumber,
                  step_name: step.stepName,
                  [metricColumnName]: step.count, // NEW: Use metric label
                  conversion_rate: step.conversionRate,
                });
              });

              headers = ['step_number', 'step_name', metricColumnName, 'conversion_rate'];
            }
          }

          if (chartData.length > 0) {
            chartsData.push({
              name: dashChart.chart.name,
              data: chartData,
              headers: headers,
            });
          }
        } catch (error) {
          console.error(`Error extracting data from chart ${dashChart.chart.name}:`, error);
          // Continue with other charts
        }
      }

      if (chartsData.length === 0) {
        message.warning({ content: 'No data available to export', key: 'csv-export' });
        return;
      }

      console.log('Calling exportDashboardToCSV with', chartsData.length, 'charts');
      await exportDashboardToCSV(dashboard.name, chartsData);

      // Dismiss the loading message and show success
      message.success({ content: 'CSV exported successfully', key: 'csv-export', duration: 2 });
    } catch (error: any) {
      console.error('Error exporting dashboard to CSV:', error);
      message.error({ content: `Failed to export CSV: ${error.message}`, key: 'csv-export' });
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={{ padding: 24 }}>
        <p>Dashboard not found.</p>
        <Button onClick={() => onNavigate('dashboards')}>Back to Dashboards</Button>
      </div>
    );
  }

  const isOwner = user?.id === dashboard.created_by;

  return (
    <div style={{ padding: 24, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space style={{ marginBottom: 16 }}>
          <Tooltip title="Back to Dashboards">
            <Button icon={<ArrowLeftOutlined />} onClick={() => onNavigate('dashboards')} />
          </Tooltip>
        </Space>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 28 }}>
              {dashboard.name}
              {editMode && <span style={{ color: '#9D6CFF', marginLeft: 12, fontSize: 18 }}>(Edit Mode)</span>}
            </h1>
            {dashboard.description && <p style={{ color: '#888', marginBottom: 0 }}>{dashboard.description}</p>}
          </div>

          <Space>
            {editMode ? (
              <>
                <Button icon={<PlusOutlined />} type="primary" onClick={() => setAddChartModalVisible(true)}>
                  Add Chart
                </Button>
                <Button onClick={handleCancelEdit}>Cancel</Button>
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveLayout}>
                  Save Layout
                </Button>
              </>
            ) : (
              <>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'pdf',
                        label: 'Export as PDF',
                        icon: <FilePdfOutlined />,
                        onClick: handleExportToPDF,
                      },
                      {
                        key: 'png',
                        label: 'Export as PNG',
                        icon: <FileImageOutlined />,
                        onClick: handleExportToPNG,
                      },
                      {
                        key: 'csv',
                        label: 'Export as CSV',
                        icon: <FileTextOutlined />,
                        onClick: handleExportToCSV,
                      },
                    ],
                  }}
                  placement="bottomRight"
                >
                  <Tooltip title="Export Dashboard">
                    <Button icon={<DownloadOutlined />} />
                  </Tooltip>
                </Dropdown>
                {isOwner && (
                  <Tooltip title="Edit">
                    <Button icon={<EditOutlined />} onClick={() => setEditMode(true)} />
                  </Tooltip>
                )}
                {isOwner && (
                  <Tooltip title="Share">
                    <Button icon={<ShareAltOutlined />} onClick={() => setShareModalVisible(true)} />
                  </Tooltip>
                )}
                {isOwner && (
                  <Popconfirm
                    title="Delete dashboard?"
                    description="This action cannot be undone."
                    onConfirm={handleDeleteDashboard}
                    okText="Delete"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="Delete">
                      <Button danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                )}
              </>
            )}
          </Space>
        </div>
      </div>

      {/* Dashboard Grid */}
      {dashboardCharts.length === 0 ? (
        <div
          style={{
            padding: 80,
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
          }}
        >
          <h2>This dashboard is empty</h2>
          <p style={{ color: '#888', marginBottom: 24 }}>Add some charts to get started!</p>
          {isOwner && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddChartModalVisible(true)}>
              Add Charts
            </Button>
          )}
        </div>
      ) : (
        <div id="dashboard-container">
          <ResponsiveGridLayout
            className="layout"
            layouts={{ lg: layout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={80}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
          >
            {dashboardCharts.map((dashChart) => (
              <div key={dashChart.chart_id} id={`chart-${dashChart.chart_id}`}>
                <Card
                style={{
                  height: '100%',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  overflow: 'auto',
                }}
                bodyStyle={{ padding: 16, height: '100%' }}
                title={
                  <div className={editMode ? 'drag-handle' : ''} style={{ cursor: editMode ? 'move' : 'default' }}>
                    {dashChart.chart?.name || 'Chart'}
                  </div>
                }
                extra={
                  <Space>
                    {!editMode && dashChart.chart && (
                      <Tooltip title="View in original page">
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => {
                            if (dashChart.chart) {
                              const page = dashChart.chart.chart_category;
                              sessionStorage.setItem('chartToLoad', JSON.stringify(dashChart.chart));
                              onNavigate(page);
                            }
                          }}
                        />
                      </Tooltip>
                    )}
                    {editMode && (
                      <Tooltip title="Remove Chart">
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveChart(dashChart.chart_id)}
                        />
                      </Tooltip>
                    )}
                  </Space>
                }
              >
                {dashChart.chart ? (
                  <>
                    <ChartRenderer
                      chartId={dashChart.chart_id}
                      chartName={dashChart.chart.name}
                      chartCategory={dashChart.chart.chart_category as 'insights' | 'funnels'}
                      chartConfig={dashChart.chart.config}
                      height={dashChart.height * 80 - 80} // Calculate height based on grid height (rowHeight * height - padding)
                    />
                  </>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: '#ff4d4f',
                    }}
                  >
                    Chart not found
                  </div>
                )}
              </Card>
            </div>
          ))}
          </ResponsiveGridLayout>
        </div>
      )}

      {/* Add Chart Modal */}
      <AddChartModal
        visible={addChartModalVisible}
        onClose={() => setAddChartModalVisible(false)}
        onChartsSelected={handleAddCharts}
      />

      {/* Share Dashboard Modal */}
      {dashboard && (
        <ShareDashboardModal
          visible={shareModalVisible}
          dashboard={dashboard}
          onClose={() => setShareModalVisible(false)}
        />
      )}
    </div>
  );
}
