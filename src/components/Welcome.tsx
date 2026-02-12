import { CodeOutlined, DashboardOutlined, DatabaseOutlined, FolderOpenOutlined, FunnelPlotOutlined, LineChartOutlined, NodeIndexOutlined, RiseOutlined, RocketOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Card } from 'antd';
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import theme from '../styles/theme';

interface WelcomeProps {
  onNavigate: (key: string) => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  
  // Extract first name from full name
  const firstName = user?.name?.split(' ')[0] || 'there';
  
  // Core Analytics Features
  const coreFeatures = [
    {
      key: 'events',
      icon: <UnorderedListOutlined style={{ fontSize: '36px', color: '#9D6CFF' }} />,
      title: 'Events',
      description: 'Browse & explore real-time pixel events',
      color: '#9D6CFF'
    },
    {
      key: 'insights',
      icon: <LineChartOutlined style={{ fontSize: '36px', color: '#1890FF' }} />,
      title: 'Insights',
      description: 'Track trends & analyze event metrics',
      color: '#1890FF'
    },
    {
      key: 'funnels',
      icon: <FunnelPlotOutlined style={{ fontSize: '36px', color: '#13C2C2' }} />,
      title: 'Funnels',
      description: 'Optimize multi-step conversion flows',
      color: '#13C2C2'
    }
  ];
  
  // Advanced Analytics
  const advancedAnalytics = [
    {
      key: 'retention',
      icon: <RiseOutlined style={{ fontSize: '36px', color: '#52C41A' }} />,
      title: 'Retention',
      description: 'Analyze user retention curves',
      color: '#52C41A',
      available: true
    },
    {
      key: 'cohorts',
      icon: <DatabaseOutlined style={{ fontSize: '36px', color: '#FA8C16' }} />,
      title: 'Cohort Analysis',
      description: 'Track user cohorts over time',
      color: '#FA8C16',
      available: true
    },
    {
      key: 'user-paths',
      icon: <NodeIndexOutlined style={{ fontSize: '36px', color: '#722ED1' }} />,
      title: 'User Path Analysis',
      description: 'Visualize common user journeys',
      color: '#722ED1',
      available: true
    }
  ];
  
  // Power Tools
  const powerTools = [
    {
      key: 'playground',
      icon: <CodeOutlined style={{ fontSize: '36px', color: '#13C2C2' }} />,
      title: 'Playground',
      description: 'Run custom SQL queries',
      color: '#13C2C2'
    },
    {
      key: 'property-explorer',
      icon: <DatabaseOutlined style={{ fontSize: '36px', color: '#9D6CFF' }} />,
      title: 'Property Explorer',
      description: 'Deep dive into event properties',
      color: '#9D6CFF'
    },
    {
      key: 'saved-charts',
      icon: <FolderOpenOutlined style={{ fontSize: '36px', color: '#EB2F96' }} />,
      title: 'Saved Charts',
      description: 'Access your saved analyses',
      color: '#EB2F96'
    },
    {
      key: 'dashboards',
      icon: <DashboardOutlined style={{ fontSize: '36px', color: '#2F54EB' }} />,
      title: 'Dashboards',
      description: 'Create & share dashboards',
      color: '#2F54EB'
    }
  ];


  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      background: theme.colors.background.main
    }}>
      {/* Hero Section */}
      <div style={{
        textAlign: 'center',
        marginBottom: '60px',
        maxWidth: '800px'
      }}>
        <RocketOutlined style={{
          fontSize: '72px',
          color: theme.colors.primary,
          marginBottom: '24px'
        }} />
        <h1 style={{
          fontSize: '48px',
          fontWeight: 700,
          color: theme.colors.text.primary,
          marginBottom: '16px',
          letterSpacing: '-0.5px'
        }}>
          Welcome to ClickSight, {firstName}!
        </h1>
        <p style={{
          fontSize: '20px',
          color: theme.colors.text.secondary,
          lineHeight: '1.6',
          marginBottom: '8px'
        }}>
          Your powerful event analytics platform built for ClickHouse
        </p>
        <p style={{
          fontSize: '16px',
          color: theme.colors.text.muted,
          lineHeight: '1.5'
        }}>
          Track events, analyze trends, and optimize conversion funnels with real-time insights
        </p>
      </div>

      {/* Core Analytics */}
      <div style={{ maxWidth: '1400px', width: '100%' }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: theme.colors.text.primary,
          marginBottom: '16px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Core Analytics
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '40px'
        }}>
          {coreFeatures.map(feature => (
            <Card
              key={feature.key}
              hoverable
              onClick={() => onNavigate(feature.key)}
              style={{
                background: theme.colors.background.card,
                border: `1px solid ${theme.colors.border.subtle}`,
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              bodyStyle={{
                padding: '24px',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = feature.color;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 8px 16px ${feature.color}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.colors.border.subtle;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '12px' }}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: theme.colors.text.primary,
                marginBottom: '8px'
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: '13px',
                color: theme.colors.text.secondary,
                lineHeight: '1.5',
                marginBottom: 0
              }}>
                {feature.description}
              </p>
            </Card>
          ))}
        </div>

        {/* Advanced Analytics */}
        <h2 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: theme.colors.text.primary,
          marginBottom: '16px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Advanced Analytics
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '40px'
        }}>
          {advancedAnalytics.map(feature => (
            <Card
              key={feature.key}
              hoverable={feature.available}
              onClick={() => feature.available && onNavigate(feature.key)}
              style={{
                background: theme.colors.background.card,
                border: `1px solid ${theme.colors.border.subtle}`,
                borderRadius: '12px',
                cursor: feature.available ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease',
                opacity: feature.available ? 1 : 0.6,
                position: 'relative'
              }}
              bodyStyle={{
                padding: '24px',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => {
                if (feature.available) {
                  e.currentTarget.style.borderColor = feature.color;
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = `0 8px 16px ${feature.color}33`;
                }
              }}
              onMouseLeave={(e) => {
                if (feature.available) {
                  e.currentTarget.style.borderColor = theme.colors.border.subtle;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {!feature.available && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: '#FA8C16',
                  color: '#fff',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Coming Soon
                </div>
              )}
              <div style={{ marginBottom: '12px' }}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: theme.colors.text.primary,
                marginBottom: '8px'
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: '13px',
                color: theme.colors.text.secondary,
                lineHeight: '1.5',
                marginBottom: 0
              }}>
                {feature.description}
              </p>
            </Card>
          ))}
        </div>

        {/* Power Tools */}
        <h2 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: theme.colors.text.primary,
          marginBottom: '16px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Power Tools
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '0'
        }}>
          {powerTools.map(feature => (
            <Card
              key={feature.key}
              hoverable
              onClick={() => onNavigate(feature.key)}
              style={{
                background: theme.colors.background.card,
                border: `1px solid ${theme.colors.border.subtle}`,
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              bodyStyle={{
                padding: '24px',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = feature.color;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 8px 16px ${feature.color}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.colors.border.subtle;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ marginBottom: '12px' }}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: theme.colors.text.primary,
                marginBottom: '8px'
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: '13px',
                color: theme.colors.text.secondary,
                lineHeight: '1.5',
                marginBottom: 0
              }}>
                {feature.description}
              </p>
            </Card>
          ))}
        </div>

      </div>

      {/* Quick Stats */}
      <div style={{
        marginTop: '60px',
        padding: '24px',
        background: theme.colors.background.elevated,
        border: `1px solid ${theme.colors.border.subtle}`,
        borderRadius: '12px',
        textAlign: 'center',
        maxWidth: '600px',
        width: '100%'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px'
        }}>
          <div>
            <div style={{
              fontSize: '32px',
              fontWeight: 700,
              color: theme.colors.primary,
              marginBottom: '4px'
            }}>
              100+
            </div>
            <div style={{
              fontSize: '14px',
              color: theme.colors.text.muted
            }}>
              Event Types
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '32px',
              fontWeight: 700,
              color: '#1890FF',
              marginBottom: '4px'
            }}>
              Real-time
            </div>
            <div style={{
              fontSize: '14px',
              color: theme.colors.text.muted
            }}>
              Analytics
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '32px',
              fontWeight: 700,
              color: '#13C2C2',
              marginBottom: '4px'
            }}>
              Fast
            </div>
            <div style={{
              fontSize: '14px',
              color: theme.colors.text.muted
            }}>
              Queries
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '60px',
        textAlign: 'center',
        color: theme.colors.text.muted,
        fontSize: '14px'
      }}>
        <p style={{ marginBottom: '8px' }}>
          Powered by ClickHouse • Built with React & TypeScript
        </p>
        <p style={{ marginBottom: 0 }}>
          Select a feature above to get started
        </p>
      </div>
    </div>
  );
};

export default Welcome;

