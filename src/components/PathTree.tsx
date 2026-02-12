import { DownOutlined } from '@ant-design/icons';
import { Card, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useState } from 'react';
import { PathSequence } from '../lib/path-queries';

const { Text } = Typography;

interface PathTreeProps {
  sequences: PathSequence[];
}

const PathTree: React.FC<PathTreeProps> = ({ sequences }) => {
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  // Build tree structure from sequences
  const buildTreeData = (): DataNode[] => {
    const root: any = {};
    
    sequences.forEach((seq) => {
      let currentLevel = root;
      
      seq.sequence.forEach((event, eventIndex) => {
        if (!currentLevel[event]) {
          currentLevel[event] = {
            children: {},
            count: 0,
            sequences: [],
          };
        }
        
        currentLevel[event].count += seq.count;
        
        if (eventIndex === seq.sequence.length - 1) {
          currentLevel[event].sequences.push(seq);
        }
        
        currentLevel = currentLevel[event].children;
      });
    });

    // Convert to Ant Design tree format
    const convertToTreeNodes = (obj: any, parentKey = ''): DataNode[] => {
      return Object.entries(obj).map(([event, data]: [string, any], index) => {
        const key = `${parentKey}-${event}-${index}`;
        const hasChildren = Object.keys(data.children).length > 0;
        
        const title = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong style={{ color: '#e0e0e0' }}>{event}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.count.toLocaleString()} users
            </Text>
            {data.sequences.length > 0 && (
              <Text type="success" style={{ fontSize: 11 }}>
                ({data.sequences.map((s: PathSequence) => `${s.percentage}%`).join(', ')})
              </Text>
            )}
          </div>
        );

        return {
          key,
          title,
          children: hasChildren ? convertToTreeNodes(data.children, key) : undefined,
        };
      });
    };

    return convertToTreeNodes(root);
  };

  const treeData = buildTreeData();

  const onExpand = (expandedKeysValue: React.Key[]) => {
    setExpandedKeys(expandedKeysValue);
  };

  if (sequences.length === 0) {
    return (
      <Card title="Path Tree View">
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
          No path data available. Configure and calculate paths to see the tree view.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Path Tree View" style={{ marginBottom: 24 }}>
      <div style={{ padding: 16 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Click to expand/collapse event paths. Numbers show user counts and conversion percentages.
        </Text>
        <Tree
          showLine
          switcherIcon={<DownOutlined />}
          defaultExpandedKeys={[]}
          expandedKeys={expandedKeys}
          onExpand={onExpand}
          treeData={treeData}
          style={{ background: 'transparent' }}
        />
      </div>
    </Card>
  );
};

export default PathTree;

