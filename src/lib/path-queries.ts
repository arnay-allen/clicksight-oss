import { queryClickHouse } from './clickhouse';
import { schemaAdapter } from './schema-adapter';

export interface PathConfig {
  startEvent: string;
  startEventFilters?: Array<{ property: string; value: string }>; // Filters for start event
  endEvent?: string;
  endEventFilters?: Array<{ property: string; value: string }>; // Filters for end event
  onlyShowPathsToEnd?: boolean; // Only show paths that reach end event
  startDate: string;
  endDate: string;
  maxDepth: number; // 2-10 steps
  topPaths: number; // 5, 10, 20
  segmentProperty?: string;
  segmentValue?: string;
  excludedEvents?: string[]; // Events to exclude from paths
}

export interface PathNode {
  event: string;
  count: number;
  percentage: number;
}

export interface PathEdge {
  source: string;
  target: string;
  count: number;
  percentage: number;
}

export interface PathSequence {
  sequence: string[];
  count: number;
  percentage: number;
}

export interface PathAnalysisResult {
  nodes: PathNode[];
  edges: PathEdge[];
  sequences: PathSequence[];
  totalUsers: number;
}

/**
 * Calculate user paths using event sequences
 */
export async function calculateUserPaths(
  config: PathConfig
): Promise<PathAnalysisResult> {
  const {
    startEvent,
    startEventFilters = [],
    endEvent,
    endEventFilters = [],
    onlyShowPathsToEnd = false,
    startDate,
    endDate,
    maxDepth,
    topPaths,
    segmentProperty,
    segmentValue,
    excludedEvents = [],
  } = config;

  // Build segment filter
  let segmentFilter = '';
  if (segmentProperty && segmentValue) {
    const escapedValue = segmentValue.toLowerCase().replace(/'/g, "''");
    segmentFilter = `AND lower(\`${segmentProperty}\`) = '${escapedValue}'`;
  }

  // Build start event property filters
  const startEventPropertyFilters = startEventFilters.map(filter => {
    const escapedValue = filter.value.toLowerCase().replace(/'/g, "''");
    return `AND lower(\`${filter.property}\`) = '${escapedValue}'`;
  }).join(' ');

  // Build end event property filters
  const endEventPropertyFilters = endEventFilters.map(filter => {
    const escapedValue = filter.value.toLowerCase().replace(/'/g, "''");
    return `AND lower(\`${filter.property}\`) = '${escapedValue}'`;
  }).join(' ');

  // Build excluded events filter
  const excludedEventsFilter = excludedEvents.length > 0
    ? `AND event_name NOT IN (${excludedEvents.map(e => `'${e.replace(/'/g, "''")}'`).join(',')})`
    : '';

  // Build end event filter for sequence (only if "only show paths to end" is checked)
  const endEventFilter = endEvent && onlyShowPathsToEnd
    ? `AND arrayExists(x -> x = '${endEvent}', clean_sequence)`
    : '';

  // Get schema-agnostic references
  const table = schemaAdapter.getTable();
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');
  const timestampCol = schemaAdapter.getColumn('timestamp');
  const userIdentifier = schemaAdapter.getUserIdentifier();

  const query = `
    WITH 
    -- Step 1: Get users who performed start event with filters
    start_event_users AS (
      SELECT DISTINCT ${userIdentifier} as user_identifier
      FROM ${table}
      WHERE ${dateCol} >= '${startDate}' 
        AND ${dateCol} <= '${endDate}'
        AND ${eventNameCol} = '${startEvent}'
        ${startEventPropertyFilters}
        ${segmentFilter}
    ),
    
    -- Step 1b: Filter by end event if "only show paths to end" is enabled
    relevant_users AS (
      SELECT user_identifier
      FROM start_event_users
      ${endEvent && onlyShowPathsToEnd ? `
      WHERE user_identifier IN (
        SELECT DISTINCT ${userIdentifier}
        FROM ${table}
        WHERE ${dateCol} >= '${startDate}'
          AND ${dateCol} <= '${endDate}'
          AND ${eventNameCol} = '${endEvent}'
          ${endEventPropertyFilters}
      )` : ''}
    ),
    
    -- Step 2: Get ordered events for relevant users only
    ordered_events AS (
      SELECT 
        ${userIdentifier} as user_identifier,
        ${eventNameCol} as event_name,
        ${timestampCol} as server_timestamp,
        row_number() OVER (PARTITION BY user_identifier ORDER BY ${timestampCol}) as rn,
        lagInFrame(${eventNameCol}) OVER (PARTITION BY user_identifier ORDER BY ${timestampCol}) as prev_event
      FROM ${table}
      WHERE ${dateCol} >= '${startDate}' 
        AND ${dateCol} <= '${endDate}'
        ${excludedEventsFilter}
        ${segmentFilter}
        AND ${userIdentifier} IN (SELECT user_identifier FROM relevant_users)
      ORDER BY user_identifier, server_timestamp
    ),
    
    -- Step 3: Deduplicate consecutive events BEFORE grouping (memory efficient)
    deduplicated_events AS (
      SELECT 
        user_identifier,
        event_name,
        server_timestamp
      FROM ordered_events
      WHERE (rn = 1 OR event_name != prev_event)
        AND event_name != ''
        AND event_name IS NOT NULL
    ),
    
    -- Step 4: Group into sequences (maintain order by using arraySort with tuple)
    deduplicated_sequences AS (
      SELECT 
        user_identifier,
        arrayMap(x -> x.1, arraySort(x -> x.2, groupArray((event_name, server_timestamp)))) as clean_sequence
      FROM deduplicated_events
      GROUP BY user_identifier
      HAVING length(clean_sequence) >= 2
    ),
    
    -- Step 5: Extract paths starting from start event
    paths_from_start AS (
      SELECT 
        user_identifier,
        clean_sequence,
        arrayFirstIndex(x -> x = '${startEvent}', clean_sequence) as start_index
      FROM deduplicated_sequences
      WHERE start_index > 0
    ),
    
    -- Step 6: Extract path segments (up to maxDepth steps)
    path_segments AS (
      SELECT 
        user_identifier,
        arraySlice(clean_sequence, start_index, ${maxDepth}) as sequence
      FROM paths_from_start
      WHERE length(arraySlice(clean_sequence, start_index, ${maxDepth})) >= 2
        ${endEventFilter}
    ),
    
    -- Step 7: Count path sequences
    path_counts AS (
      SELECT 
        sequence,
        count(*) as user_count
      FROM path_segments
      GROUP BY sequence
      ORDER BY user_count DESC
      LIMIT ${topPaths}
    )
    
    SELECT 
      sequence,
      user_count,
      round((user_count / (SELECT count(DISTINCT user_identifier) FROM path_segments)) * 100, 2) as percentage
    FROM path_counts
    ORDER BY user_count DESC
  `;

  try {
    const result = await queryClickHouse(query);

    const data = result.data || [];
    
    // Client-side deduplication: Remove consecutive duplicates and filter empty strings
    const cleanedData = data.map((row: any) => ({
      ...row,
      sequence: row.sequence.filter((event: string, i: number, arr: string[]) => 
        event && event.trim() !== '' && (i === 0 || event !== arr[i - 1])
      )
    })).filter((row: any) => row.sequence.length >= 2);
    
    // Calculate total users
    const totalUsers = cleanedData.reduce((sum: number, row: any) => sum + parseInt(row.user_count, 10), 0);

    // Process sequences into nodes and edges
    const nodeMap = new Map<string, number>();
    const edgeMap = new Map<string, number>();
    const sequences: PathSequence[] = [];

    cleanedData.forEach((row: any) => {
      const sequence = row.sequence as string[]; // Already deduplicated by cleanedData map
      const count = parseInt(row.user_count, 10);
      const percentage = parseFloat(row.percentage);

      // Add to sequences
      sequences.push({ sequence, count, percentage });

      // Build nodes with position-aware keys
      sequence.forEach((event: string, index: number) => {
        const nodeKey = `${event}_pos${index}`;
        nodeMap.set(nodeKey, (nodeMap.get(nodeKey) || 0) + count);
      });

      // Build edges with position-aware keys to prevent cycles
      for (let i = 0; i < sequence.length - 1; i++) {
        // Skip if source and target are the same (self-loop)
        if (sequence[i] !== sequence[i + 1]) {
          // Make edge keys unique by including position to prevent cycles
          const sourceKey = `${sequence[i]}_pos${i}`;
          const targetKey = `${sequence[i + 1]}_pos${i + 1}`;
          const edgeKey = `${sourceKey}→${targetKey}`;
          edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + count);
        }
      }
    });

    // Convert to node and edge arrays
    const nodes: PathNode[] = Array.from(nodeMap.entries()).map(([nodeKey, count]) => ({
      event: nodeKey, // Keep position-aware key for Sankey
      count,
      percentage: totalUsers > 0 ? parseFloat(((count / totalUsers) * 100).toFixed(2)) : 0,
    }));

    const edges: PathEdge[] = Array.from(edgeMap.entries()).map(([key, count]) => {
      const [sourceWithPos, targetWithPos] = key.split('→');
      // Use position-aware source count
      const sourceCount = nodeMap.get(sourceWithPos) || 1;
      return {
        source: sourceWithPos, // Keep position in edge for Sankey
        target: targetWithPos, // Keep position in edge for Sankey
        count,
        percentage: parseFloat(((count / sourceCount) * 100).toFixed(2)),
      };
    });

    return {
      nodes,
      edges,
      sequences,
      totalUsers,
    };
  } catch (error: any) {
    console.error('Path analysis error:', error);
    throw new Error(
      error.response?.data?.exception || 'Failed to calculate user paths'
    );
  }
}

/**
 * Export path data to CSV
 */
export function exportPathsToCSV(
  sequences: PathSequence[],
  startEvent: string,
  endEvent?: string
): void {
  // Build CSV header
  const maxLength = Math.max(...sequences.map(s => s.sequence.length));
  const stepHeaders = Array.from({ length: maxLength }, (_, i) => `Step ${i + 1}`);
  const headers = [...stepHeaders, 'Users', 'Percentage'];

  // Build CSV rows
  const rows = sequences.map(seq => {
    const steps = [...seq.sequence];
    // Pad with empty strings if needed
    while (steps.length < maxLength) {
      steps.push('');
    }
    return [...steps, seq.count, `${seq.percentage}%`];
  });

  // Combine into CSV string
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  const filename = `user_paths_${startEvent}${endEvent ? `_to_${endEvent}` : ''}_${new Date().toISOString().split('T')[0]}.csv`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

