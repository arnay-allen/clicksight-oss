import { ClearOutlined, FileTextOutlined, HistoryOutlined, PlayCircleOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Drawer, Input, message, Space, Tabs, Tooltip, Typography } from 'antd';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { format } from 'sql-formatter';
import { useAuth } from '../contexts/AuthContext';
import { logQueryExecution, parseClickHouseError } from '../lib/audit-logger';
import { executeCustomQuery, type CustomQueryResult } from '../lib/clickhouse';
import { analyzeQueryResults } from '../lib/openai';
import { getExampleQueries, validateQuery } from '../lib/sql-validator';
const SqlEditor = lazy(() => import('./SqlEditor'));
const QueryResults = lazy(() => import('./QueryResults'));

const { TabPane } = Tabs;
const { TextArea } = Input;
const { Text, Paragraph } = Typography;

const QUERY_HISTORY_KEY = 'clicksight_query_history';
const MAX_HISTORY_SIZE = 10;

const Playground: React.FC = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CustomQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('editor');

  // AI state - only for results analysis
  const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState<{
    analysis: string;
    usage?: any;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load query history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(QUERY_HISTORY_KEY);
      if (stored) {
        setQueryHistory(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load query history:', err);
    }
  }, []);

  // Save query to history
  const saveToHistory = (sql: string) => {
    const trimmed = sql.trim();
    if (!trimmed) return;

    const newHistory = [trimmed, ...queryHistory.filter(q => q !== trimmed)].slice(0, MAX_HISTORY_SIZE);
    setQueryHistory(newHistory);

    try {
      localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(newHistory));
    } catch (err) {
      console.error('Failed to save query history:', err);
    }
  };

  // Execute query
  const executeQuery = async () => {
    if (!query.trim()) {
      message.warning('Please enter a query');
      return;
    }

    // Validate query
    const validation = validateQuery(query);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid query');
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    let queryResult: CustomQueryResult | undefined;
    let queryStatus: 'success' | 'failure' | 'timeout' = 'success';
    let errorDetails: { code?: number; type?: string; message: string } | undefined;

    try {
      queryResult = await executeCustomQuery(validation.sanitizedQuery || query);
      setResult(queryResult);
      saveToHistory(query);
      setActiveTab('results');
      message.success(`Query executed successfully. ${queryResult.rows} rows returned.`);
    } catch (err: any) {
      queryStatus = 'failure';
      const errorMessage = err.message || 'Query execution failed';
      errorDetails = parseClickHouseError(errorMessage);

      // Check if it's a timeout
      if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('max_execution_time')) {
        queryStatus = 'timeout';
      }

      setError(errorMessage);
      message.error('Query execution failed');
    } finally {
      setLoading(false);

      // Log to audit table (async, don't block UI)
      if (user) {
        logQueryExecution({
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          queryText: query,
          sanitizedQuery: validation.sanitizedQuery || query,
          status: queryStatus,
          errorMessage: errorDetails?.message,
          errorCode: errorDetails?.code,
          errorType: errorDetails?.type,
          result: queryResult,
          maxRowsLimit: 10000,
          timeoutSeconds: 120,
          userAgent: navigator.userAgent,
        }).catch(err => {
          // Silently log audit failure
          console.warn('Audit logging failed:', err);
        });
      }
    }
  };

  // Format query
  const formatQuery = () => {
    try {
      const formatted = format(query, {
        language: 'sql',
        tabWidth: 2,
        keywordCase: 'upper',
      });
      setQuery(formatted);
      message.success('Query formatted');
    } catch (err: any) {
      message.error('Failed to format query: ' + err.message);
    }
  };

  // Clear editor
  const clearEditor = () => {
    setQuery('');
    setResult(null);
    setError(null);
  };

  // Load example query
  const loadExample = (exampleQuery: string) => {
    setQuery(exampleQuery);
    setError(null);
    setResult(null);
    setActiveTab('editor');
  };

  // Load from history
  const loadFromHistory = (historicalQuery: string) => {
    setQuery(historicalQuery);
    setError(null);
    setResult(null);
    setActiveTab('editor');
  };

  // AI Results Analysis
  const handleAskAI = async () => {
    if (!result || result.rows === 0) {
      message.warning('No results to analyze. Execute a query first.');
      return;
    }

    setAiLoading(true);
    try {
      const analysisResult = await analyzeQueryResults(
        query,
        result.data,
        aiQuestion || undefined
      );
      setAiResponse(analysisResult);
      setAiAnalysisOpen(true);
      message.success('Analysis complete!');
    } catch (error: any) {
      message.error(error.message || 'Failed to analyze results');
      console.error('AI analysis error:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const examples = getExampleQueries();

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>SQL Playground</h1>
        <p style={{ color: '#888', marginTop: 8 }}>
          Write and execute custom SQL queries against ClickHouse. Only SELECT queries are allowed (Max 1MB, 2 min timeout).
        </p>
      </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24 }}>
          {/* Main Editor Area */}
          <div>
            <Card bordered={false} style={{ backgroundColor: '#1f1f1f', marginBottom: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <Space>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={executeQuery}
                    loading={loading}
                    size="large"
                  >
                    Execute Query
                  </Button>
                  <Button icon={<FileTextOutlined />} onClick={formatQuery} disabled={!query.trim()}>
                    Format
                  </Button>
                  <Button icon={<ClearOutlined />} onClick={clearEditor} disabled={!query.trim()}>
                    Clear
                  </Button>
                </Space>
              </div>

              <Suspense
                fallback={
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '450px',
                      background: '#111',
                      borderRadius: 8,
                    }}
                  >
                    Loading editor...
                  </div>
                }
              >
                <SqlEditor value={query} onChange={setQuery} height="450px" />
              </Suspense>

              {error && (
                <Alert
                  message="Query Error"
                  description={error}
                  type="error"
                  showIcon
                  closable
                  onClose={() => setError(null)}
                  style={{ marginTop: 16 }}
                />
              )}
            </Card>

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              tabBarExtraContent={
                result && result.rows > 0 && (
                  <Button
                    icon={<RobotOutlined />}
                    onClick={() => setAiAnalysisOpen(true)}
                    style={{ marginRight: 16 }}
                  >
                    Ask AI
                  </Button>
                )
              }
            >
              <TabPane tab="Results" key="results">
                {result ? (
                  <Suspense
                    fallback={
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 200,
                          background: '#1f1f1f',
                          borderRadius: 8,
                        }}
                      >
                        Loading results...
                      </div>
                    }
                  >
                    <QueryResults result={result} loading={loading} />
                  </Suspense>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: 60,
                      color: '#888',
                      backgroundColor: '#1f1f1f',
                      borderRadius: 8,
                    }}
                  >
                    <PlayCircleOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
                    <div>Execute a query to see results</div>
                  </div>
                )}
              </TabPane>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div>
            <Tabs defaultActiveKey="examples">
              <TabPane
              tab={
                <span>
                  <FileTextOutlined /> Examples
                </span>
              }
              key="examples"
            >
              <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                {examples.map((example, index) => (
                  <Card
                    key={index}
                    size="small"
                    hoverable
                    onClick={() => loadExample(example.query)}
                    style={{
                      marginBottom: 12,
                      backgroundColor: '#1f1f1f',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      {example.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {example.description}
                    </div>
                  </Card>
                ))}
              </div>
            </TabPane>

            <TabPane
              tab={
                <span>
                  <HistoryOutlined /> History
                </span>
              }
              key="history"
            >
              <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                {queryHistory.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: 40,
                    color: '#666'
                  }}>
                    <HistoryOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }} />
                    <div>No query history yet</div>
                    <div style={{ fontSize: 12, marginTop: 8 }}>
                      Your last 10 queries will appear here
                    </div>
                  </div>
                ) : (
                  queryHistory.map((historicalQuery, index) => (
                    <Tooltip
                      key={index}
                      title="Click to load this query"
                      placement="left"
                    >
                      <Card
                        size="small"
                        hoverable
                        onClick={() => loadFromHistory(historicalQuery)}
                        style={{
                          marginBottom: 12,
                          backgroundColor: '#1f1f1f',
                          cursor: 'pointer',
                        }}
                      >
                        <pre style={{
                          margin: 0,
                          fontSize: 11,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 100,
                          overflow: 'hidden',
                          fontFamily: 'Monaco, Consolas, monospace',
                        }}>
                          {historicalQuery.length > 200
                            ? historicalQuery.substring(0, 200) + '...'
                            : historicalQuery
                          }
                        </pre>
                      </Card>
                    </Tooltip>
                  ))
                )}
              </div>
            </TabPane>
          </Tabs>
        </div>
      </div>

      {/* AI Results Analysis Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined />
            <span>Ask AI About Results</span>
          </Space>
        }
        placement="right"
        width={600}
        open={aiAnalysisOpen}
        onClose={() => setAiAnalysisOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Query Context */}
          {result && (
            <Card size="small" title="Query Context">
              <Space direction="vertical" style={{ width: '100%', fontSize: 12 }}>
                <div>
                  <Text type="secondary">Rows returned:</Text> <Text strong>{result.rows.toLocaleString()}</Text>
                </div>
                <div>
                  <Text type="secondary">Query:</Text>
                  <pre style={{
                    background: '#141414',
                    padding: 8,
                    borderRadius: 4,
                    overflow: 'auto',
                    marginTop: 4,
                    fontSize: 11,
                    maxHeight: 100,
                    color: '#ffffff',
                    border: '1px solid #434343',
                  }}>
                    {query.length > 200 ? query.substring(0, 200) + '...' : query}
                  </pre>
                </div>
              </Space>
            </Card>
          )}

          {/* Example Questions */}
          <Card size="small" title="Example Questions">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="link"
                size="small"
                onClick={() => setAiQuestion('What are the key insights from this data?')}
              >
                What are the key insights?
              </Button>
              <Button
                type="link"
                size="small"
                onClick={() => setAiQuestion('What trends or patterns do you see?')}
              >
                What trends do you see?
              </Button>
              <Button
                type="link"
                size="small"
                onClick={() => setAiQuestion('Are there any anomalies or outliers?')}
              >
                Any anomalies or outliers?
              </Button>
              <Button
                type="link"
                size="small"
                onClick={() => setAiQuestion('What should I investigate further?')}
              >
                What should I investigate?
              </Button>
            </Space>
          </Card>

          {/* Question Input */}
          <div>
            <Text strong>Your Question:</Text>
            <TextArea
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Ask AI about the query results... (e.g., 'What trends do you see?' or 'Summarize the key findings')"
              rows={4}
              style={{ marginTop: 8 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleAskAI}
              loading={aiLoading}
              style={{ marginTop: 8 }}
              block
            >
              Ask AI
            </Button>
          </div>

          {/* AI Response */}
          {aiLoading && (
            <Card loading={true}>
              <Paragraph>Analyzing results...</Paragraph>
            </Card>
          )}

          {aiResponse && !aiLoading && (
            <Card title="AI Insights">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {aiResponse.analysis}
                </div>
                {aiResponse.usage && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Tokens used: {aiResponse.usage.total_tokens}
                    </Text>
                  </div>
                )}
              </Space>
            </Card>
          )}
        </Space>
      </Drawer>
    </div>
  );
};

export default Playground;
