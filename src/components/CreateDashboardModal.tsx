import { Button, Form, Input, message, Modal } from 'antd';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createDashboard } from '../lib/dashboards';

interface CreateDashboardModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  onNavigateToDashboard: (dashboardId: string) => void;
}

export default function CreateDashboardModal({
  visible,
  onClose,
  onCreated,
  onNavigateToDashboard,
}: CreateDashboardModalProps) {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!user) return;

    try {
      const values = await form.validateFields();
      setCreating(true);

      const dashboardId = await createDashboard(
        values.name,
        values.description || '',
        user.id
      );

      // Wait for ClickHouse INSERT mutation to propagate
      await new Promise((resolve) => setTimeout(resolve, 300));

      message.success('Dashboard created successfully!');
      form.resetFields();
      onCreated();
      onClose();

      // Navigate to the new dashboard
      onNavigateToDashboard(dashboardId);
    } catch (error: any) {
      if (error.errorFields) {
        // Form validation error
        return;
      }
      console.error('Error creating dashboard:', error);
      message.error('Failed to create dashboard');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Create New Dashboard"
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="create"
          type="primary"
          loading={creating}
          onClick={handleCreate}
        >
          Create Dashboard
        </Button>,
      ]}
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 20 }}
      >
        <Form.Item
          name="name"
          label="Dashboard Name"
          rules={[
            { required: true, message: 'Please enter a dashboard name' },
            { max: 100, message: 'Name must be less than 100 characters' },
          ]}
        >
          <Input
            placeholder="e.g., Marketing Analytics, User Engagement, Sales Dashboard"
            autoFocus
          />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description (Optional)"
          rules={[
            { max: 500, message: 'Description must be less than 500 characters' },
          ]}
        >
          <Input.TextArea
            placeholder="Describe what this dashboard is for..."
            rows={4}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
