import { CredentialResponse, GoogleLogin } from '@react-oauth/google';
import { Card, Space, Typography } from 'antd';
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const { login } = useAuth();

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    try {
      await login(credentialResponse);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleError = () => {
    console.error('Google Login failed');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}
    >
      <Card
        style={{
          width: 450,
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 12,
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <div>
            <Title level={2} style={{ color: '#fff', margin: 0, marginBottom: 8 }}>
              Welcome to ClickSight
            </Title>
            <Text style={{ color: '#888', fontSize: 16 }}>
              Event Analytics & Funnel Analysis
            </Text>
          </div>

          <div style={{ padding: '20px 0' }}>
            <Text style={{ color: '#aaa', display: 'block', marginBottom: 24 }}>
              Sign in with your Google account to continue
            </Text>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={handleError}
                theme="filled_black"
                size="large"
                text="signin_with"
                shape="rectangular"
              />
            </div>
          </div>

          <div style={{ paddingTop: 12, borderTop: '1px solid #2a2a2a' }}>
            <Text style={{ color: '#666', fontSize: 12 }}>
              By signing in, you agree to our Terms of Service and Privacy Policy
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default Login;

