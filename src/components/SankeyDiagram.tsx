import { Card } from 'antd';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { scaleOrdinal } from 'd3-scale';
import { schemeCategory10 } from 'd3-scale-chromatic';
import { select } from 'd3-selection';
import React, { useEffect, useRef } from 'react';
import { PathEdge, PathNode } from '../lib/path-queries';

interface SankeyDiagramProps {
  nodes: PathNode[];
  edges: PathEdge[];
  width?: number;
  height?: number;
}

const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  nodes,
  edges,
  width = 1000,
  height = 600,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0 || edges.length === 0) return;

    // Clear previous content
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    // Build nodes and links with proper step tracking to avoid cycles
    const nodeMap = new Map<string, number>();
    const sankeyNodes: any[] = [];
    const sankeyLinks: any[] = [];

    // Track which events appear at which steps
    const eventStepMap = new Map<string, Set<number>>();

    // First pass: identify all unique (event, step) combinations
    edges.forEach(edge => {
      // Extract step from edge naming if needed, or track separately
      if (!eventStepMap.has(edge.source)) {
        eventStepMap.set(edge.source, new Set());
      }
      if (!eventStepMap.has(edge.target)) {
        eventStepMap.set(edge.target, new Set());
      }
    });

    // Create nodes and links - position-aware to prevent cycles
    edges.forEach((edge) => {
      const sourceKey = edge.source; // e.g., "API_TIME_TAKEN_pos1"
      const targetKey = edge.target; // e.g., "page_loaded_pos2"
      
      // Extract display names (remove position suffix)
      const sourceDisplayName = sourceKey.replace(/_pos\d+$/, '');
      const targetDisplayName = targetKey.replace(/_pos\d+$/, '');

      // Skip self-loops (same event to itself)
      if (sourceKey === targetKey) return;

      // Create source node if doesn't exist
      if (!nodeMap.has(sourceKey)) {
        nodeMap.set(sourceKey, sankeyNodes.length);
        sankeyNodes.push({
          name: sourceKey,
          displayName: sourceDisplayName,
        });
      }

      // Create target node if doesn't exist
      if (!nodeMap.has(targetKey)) {
        nodeMap.set(targetKey, sankeyNodes.length);
        sankeyNodes.push({
          name: targetKey,
          displayName: targetDisplayName,
        });
      }

      // Add link
      sankeyLinks.push({
        source: nodeMap.get(sourceKey)!,
        target: nodeMap.get(targetKey)!,
        value: edge.count,
        sourceName: sourceDisplayName,
        targetName: targetDisplayName,
      });
    });

    // If no valid links, show empty state
    if (sankeyLinks.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#999')
        .style('font-size', '14px')
        .text('No valid paths to display. Paths contain only self-loops.');
      return;
    }

    // Create sankey layout
    const sankeyGenerator = sankey()
      .nodeWidth(15)
      .nodePadding(10)
      .extent([[1, 1], [width - 1, height - 6]]);

    let graph;
    try {
      graph = sankeyGenerator({
        nodes: sankeyNodes.map(d => Object.assign({}, d)),
        links: sankeyLinks.map(d => Object.assign({}, d)),
      });
    } catch (error) {
      console.error('Sankey layout error:', error);
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ff4d4f')
        .style('font-size', '14px')
        .text('Unable to render flow diagram. Try using Tree or Table view.');
      return;
    }

    // Color scale
    const color = scaleOrdinal(schemeCategory10);

    // Add links
    const link = svg.append('g')
      .attr('class', 'links')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.2)
      .selectAll('path')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d: any) => color(d.source.name))
      .attr('stroke-width', (d: any) => Math.max(1, d.width || 1));

    // Add link titles (tooltips)
    link.append('title')
      .text((d: any) => `${d.source.name} → ${d.target.name}\n${d.value.toLocaleString()} users`);

    // Add nodes
    const node = svg.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graph.nodes)
      .enter()
      .append('g');

    node.append('rect')
      .attr('x', (d: any) => d.x0)
      .attr('y', (d: any) => d.y0)
      .attr('height', (d: any) => d.y1 - d.y0)
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('fill', (d: any) => color(d.name))
      .attr('stroke', '#000')
      .attr('stroke-width', 0.5);

    // Add node titles (tooltips)
    node.append('title')
      .text((d: any) => {
        const matchingNode = nodes.find(n => n.event === d.name);
        return `${d.displayName || d.name}\n${matchingNode?.count.toLocaleString() || '0'} users (${matchingNode?.percentage || '0'}%)`;
      });

    // Add node labels
    node.append('text')
      .attr('x', (d: any) => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
      .attr('y', (d: any) => (d.y1 + d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: any) => d.x0 < width / 2 ? 'start' : 'end')
      .text((d: any) => d.displayName || d.name)
      .style('font-size', '12px')
      .style('font-weight', '500')
      .style('fill', '#e0e0e0');

    // Add user count labels
    node.append('text')
      .attr('x', (d: any) => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
      .attr('y', (d: any) => (d.y1 + d.y0) / 2 + 15)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d: any) => d.x0 < width / 2 ? 'start' : 'end')
      .text((d: any) => {
        const matchingNode = nodes.find(n => n.event === d.name);
        return matchingNode ? `${matchingNode.count.toLocaleString()} (${matchingNode.percentage}%)` : '';
      })
      .style('font-size', '10px')
      .style('fill', '#999');

  }, [nodes, edges, width, height]);

  if (nodes.length === 0 || edges.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
          No path data available. Configure and calculate paths to see the flow diagram.
        </div>
      </Card>
    );
  }

  return (
    <Card title="User Path Flow" style={{ marginBottom: 24 }}>
      <div style={{ overflowX: 'auto' }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: 'block', margin: '0 auto' }}
        />
      </div>
    </Card>
  );
};

export default SankeyDiagram;

