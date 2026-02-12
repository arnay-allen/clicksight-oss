import { CodeOutlined, DashboardOutlined, DatabaseOutlined, DoubleLeftOutlined, DoubleRightOutlined, FolderOpenOutlined, FunnelPlotOutlined, LineChartOutlined, LogoutOutlined, NodeIndexOutlined, RiseOutlined, RocketOutlined, TableOutlined, UnorderedListOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, ConfigProvider, Dropdown, Layout, Menu, Space, Spin, theme } from 'antd';
import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import './App.css';
import { useAuth } from './contexts/AuthContext';

const Welcome = lazy(() => import('./components/Welcome'));
const Events = lazy(() => import('./components/Events'));
const PropertyExplorer = lazy(() => import('./components/PropertyExplorer'));
const Insights = lazy(() => import('./components/Insights'));
const Funnels = lazy(() => import('./components/Funnels'));
const Retention = lazy(() => import('./components/Retention'));
const Cohorts = lazy(() => import('./components/Cohorts'));
const UserPaths = lazy(() => import('./components/UserPaths'));
const Playground = lazy(() => import('./components/Playground'));
const SavedChartsPage = lazy(() => import('./components/SavedChartsPage'));
const DashboardsPage = lazy(() => import('./components/DashboardsPage'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const Login = lazy(() => import('./components/Login'));

const { Sider, Content } = Layout;

type MenuItem = {
  key: string;
  icon: ReactNode;
  label: string;
};

// Base menu items (always visible)
const baseMenuItems: MenuItem[] = [
  {
    key: 'events',
    icon: <UnorderedListOutlined />,
    label: 'Events',
  },
  {
    key: 'property-explorer',
    icon: <DatabaseOutlined />,
    label: 'Property Explorer',
  },
  {
    key: 'insights',
    icon: <LineChartOutlined />,
    label: 'Insights',
  },
  {
    key: 'funnels',
    icon: <FunnelPlotOutlined />,
    label: 'Funnels',
  },
  {
    key: 'retention',
    icon: <RiseOutlined />,
    label: 'Retention',
  },
  {
    key: 'cohorts',
    icon: <TableOutlined />,
    label: 'Cohorts',
  },
  {
    key: 'user-paths',
    icon: <NodeIndexOutlined />,
    label: 'User Paths',
  },
  {
    key: 'playground',
    icon: <CodeOutlined />,
    label: 'Playground',
  },
  {
    key: 'saved-charts',
    icon: <FolderOpenOutlined />,
    label: 'Saved Charts',
  },
  {
    key: 'dashboards',
    icon: <DashboardOutlined />,
    label: 'Dashboards',
  },
];

// Menu items
const menuItems: MenuItem[] = baseMenuItems;

function App() {
  const { user, loading, logout } = useAuth();
  const [selectedMenu, setSelectedMenu] = useState('welcome');
  const [collapsed, setCollapsed] = useState(true);
  const [currentDashboardId, setCurrentDashboardId] = useState<string | null>(null);

  const themeConfig = useMemo(
    () => ({
      algorithm: theme.darkAlgorithm,
      token: {
        colorPrimary: '#9D6CFF',
        borderRadius: 8,
        fontSize: 14,
      },
    }),
    [],
  );

  const fullScreenLoader = (message?: string) => (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}
    >
      <Space direction="vertical" align="center" size="large">
        <Spin size="large" />
        {message && <div style={{ color: '#888' }}>{message}</div>}
      </Space>
    </div>
  );

  const handleNavigate = (key: string) => {
    // Prevent setting the same menu item (avoid unnecessary re-renders)
    if (key !== selectedMenu) {
      setSelectedMenu(key);
      setCurrentDashboardId(null);
    }
  };

  const handleNavigateToDashboard = (dashboardId: string) => {
    setCurrentDashboardId(dashboardId);
    setSelectedMenu('dashboard-view');
  };

  const renderContent = () => {
    switch (selectedMenu) {
      case 'welcome':
        return <Welcome onNavigate={handleNavigate} />;
      case 'events':
        return <Events />;
      case 'property-explorer':
        return <PropertyExplorer />;
      case 'insights':
        return <Insights onNavigate={handleNavigate} />;
      case 'funnels':
        return <Funnels onNavigate={handleNavigate} />;
      case 'retention':
        return <Retention />;
      case 'cohorts':
        return <Cohorts />;
      case 'user-paths':
        return <UserPaths />;
      case 'playground':
        return <Playground />;
      case 'saved-charts':
        return <SavedChartsPage onNavigate={handleNavigate} />;
      case 'dashboards':
        return <DashboardsPage onNavigate={handleNavigate} onNavigateToDashboard={handleNavigateToDashboard} />;
      case 'dashboard-view':
        return currentDashboardId ? (
          <Dashboard 
            dashboardId={currentDashboardId} 
            onNavigate={handleNavigate} 
            onNavigateToDashboard={handleNavigateToDashboard}
          />
        ) : (
          <DashboardsPage onNavigate={handleNavigate} onNavigateToDashboard={handleNavigateToDashboard} />
        );
      default:
        return <Welcome onNavigate={handleNavigate} />;
    }
  };

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <ConfigProvider theme={themeConfig}>
        {fullScreenLoader('Loading...')}
      </ConfigProvider>
    );
  }

  // Show login page if user is not authenticated
  if (!user) {
    return (
      <ConfigProvider theme={themeConfig}>
        <Suspense fallback={fullScreenLoader('Preparing login experience...')}>
          <Login />
        </Suspense>
      </ConfigProvider>
    );
  }

  // User menu items
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: user.name,
      disabled: true,
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: logout,
    },
  ];

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          breakpoint="lg"
          collapsedWidth="80"
          collapsed={collapsed}
          trigger={null}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Logo/Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 64,
                padding: '0 16px',
                color: '#fff',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onClick={() => setSelectedMenu('welcome')}
              >
                <RocketOutlined style={{ fontSize: '24px', color: '#9D6CFF' }} />
                {!collapsed && <span>ClickSight</span>}
              </div>
            </div>

            {/* Menu Items */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Menu
                theme="dark"
                mode="inline"
                selectedKeys={selectedMenu === 'welcome' ? [] : [selectedMenu]}
                items={menuItems}
                onClick={({ key }) => {
                  if (key !== selectedMenu) {
                    setSelectedMenu(key);
                    setCurrentDashboardId(null);
                  }
                }}
              />
            </div>

            {/* Collapse Button */}
            <div
              style={{
                padding: '8px 16px',
              }}
            >
              <Button
                type="text"
                icon={collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                block
                style={{
                  height: '32px',
                  color: '#888',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                }}
              >
                {!collapsed && <span style={{ marginLeft: '8px' }}>Collapse</span>}
              </Button>
            </div>

            {/* User Profile Section */}
            <div
              style={{
                padding: '16px',
              }}
            >
              <Dropdown menu={{ items: userMenuItems }} placement="topRight">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '8px',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Avatar src={user.avatar_url} icon={!user.avatar_url && <UserOutlined />} size={32} />
                  {!collapsed && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: '#fff',
                          fontWeight: 500,
                          fontSize: 14,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {user.name}
                      </div>
                      <div
                        style={{
                          color: '#888',
                          fontSize: 12,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {user.email}
                      </div>
                    </div>
                  )}
                </div>
              </Dropdown>
            </div>
          </div>
        </Sider>
        <Layout style={{ marginLeft: collapsed ? '80px' : '200px', transition: 'margin-left 0.2s' }}>
          <Content style={{ margin: 0 }}>
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 'calc(100vh - 64px)',
                    background: '#0f0f0f',
                  }}
                >
                  <Spin size="large" tip="Loading module..." />
                </div>
              }
            >
              {renderContent()}
            </Suspense>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;

