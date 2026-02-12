import { Input, Modal, Radio, message } from 'antd';
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { saveChart, updateChart } from '../lib/charts';

const { TextArea } = Input;

interface SaveChartModalProps {
  visible: boolean;
  onClose: () => void;
  chartCategory: 'insights' | 'funnels';
  config: object;
  existingChart?: {
    id: string;
    name: string;
    description: string;
    chart_type: string;
    permission?: string; // 'view' | 'edit' for shared charts, undefined for owned charts
  };
}

const SaveChartModal: React.FC<SaveChartModalProps> = ({
  visible,
  onClose,
  chartCategory,
  config,
  existingChart,
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saveMode, setSaveMode] = useState<'update' | 'new'>('update');
  
  // Determine if user can update the chart
  const canUpdate = existingChart && (
    !existingChart.permission || // No permission means user owns it
    existingChart.permission === 'edit' // Or user has edit permission
  );
  
  // Sync state when existingChart changes or modal opens
  React.useEffect(() => {
    if (visible) {
      if (existingChart) {
        setName(existingChart.name || '');
        setDescription(existingChart.description || '');
        // If user can't update (view-only shared chart), default to 'new'
        setSaveMode(canUpdate ? 'update' : 'new');
      } else {
        setName('');
        setDescription('');
        setSaveMode('update');
      }
    }
  }, [visible, existingChart, canUpdate]);
  
  // Auto-detect chart type based on category
  const chartType = chartCategory === 'insights' ? 'line' : 'horizontal-bar';

  const handleSave = async () => {
    // For update mode, use existing chart name if field is disabled
    const chartName = (existingChart && saveMode === 'update') ? existingChart.name : name;
    
    if (!chartName.trim()) {
      message.error('Please enter a chart name');
      return;
    }

    if (!user) {
      message.error('You must be logged in to save charts');
      return;
    }

    setLoading(true);
    try {
      if (existingChart && saveMode === 'update') {
        // Update existing chart
        await updateChart(existingChart.id, {
          name: chartName.trim(),
          description: description.trim(),
          chart_type: chartType,
          config: config,
        });
        message.success('Chart updated successfully!');
      } else {
        // Save new chart (either no existing chart or user chose "save as new")
        await saveChart(
          chartName.trim(),
          description.trim(),
          chartType,
          chartCategory,
          config,
          user.id
        );
        message.success(existingChart && saveMode === 'new' 
          ? 'New chart saved successfully!' 
          : 'Chart saved successfully!');
      }

      // Reset form
      setName('');
      setDescription('');
      setSaveMode('update');
      onClose();
    } catch (error: any) {
      console.error('Error saving chart:', error);
      message.error(`Failed to save chart: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to initial state
    if (existingChart) {
      setName(existingChart.name || '');
      setDescription(existingChart.description || '');
      setSaveMode('update');
    } else {
      setName('');
      setDescription('');
      setSaveMode('update');
    }
    onClose();
  };

  return (
    <Modal
      title={existingChart ? 'Save Chart' : 'Save Chart'}
      open={visible}
      onOk={handleSave}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText={existingChart && saveMode === 'update' ? 'Update' : 'Save'}
      cancelText="Cancel"
      width={600}
    >
      {existingChart && (
        <div style={{ 
          marginBottom: 20, 
          padding: 12, 
          background: 'rgba(24, 144, 255, 0.1)', 
          borderRadius: 8,
          border: '1px solid rgba(24, 144, 255, 0.3)'
        }}>
          <div style={{ marginBottom: 12, color: '#e8e8e8' }}>
            <strong>You are {canUpdate ? 'editing' : 'viewing'}:</strong> {existingChart.name}
            {existingChart.permission === 'view' && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#faad14' }}>
                (View-only: You can only save as a new chart)
              </div>
            )}
          </div>
          {canUpdate ? (
            <Radio.Group 
              value={saveMode} 
              onChange={(e) => setSaveMode(e.target.value)}
              style={{ width: '100%' }}
            >
              <Radio value="update" style={{ display: 'block', marginBottom: 8 }}>
                Update existing chart
              </Radio>
              <Radio value="new" style={{ display: 'block' }}>
                Save as new chart
              </Radio>
            </Radio.Group>
          ) : (
            <div style={{ color: '#8c8c8c', fontSize: 13, marginTop: 8 }}>
              You have view-only access. Enter a new name to save your own copy.
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: '#e8e8e8',
          }}
        >
          Chart Name <span style={{ color: '#ff4d4f' }}>*</span>
        </label>
        <Input
          placeholder="e.g., Daily App Opens - Last 30 Days"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          disabled={existingChart && saveMode === 'update'}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            display: 'block',
            marginBottom: 8,
            fontWeight: 500,
            color: '#e8e8e8',
          }}
        >
          Description
        </label>
        <TextArea
          placeholder="Optional description of this chart"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: 8,
          fontSize: 12,
          color: '#8c8c8c',
        }}
      >
        <strong>What will be saved:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>Chart type: <strong>{chartType === 'line' ? 'Line Chart' : 'Funnel Bar Chart'}</strong> (auto-detected)</li>
          <li>Chart configuration (data sources, date range, filters)</li>
          <li>{chartCategory === 'insights' ? 'Insights settings (granularity, breakdown)' : 'Funnel settings (steps, time window)'}</li>
          <li>All filters and selections</li>
        </ul>
      </div>
    </Modal>
  );
};

export default SaveChartModal;

