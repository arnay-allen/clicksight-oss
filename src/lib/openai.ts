import axios from 'axios';
import { schemaAdapter } from './schema-adapter';

// Get OpenAI API key from environment
const OPENAI_API_KEY = (window as any)._env_?.VITE_OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;

// Hardcoded configuration
const OPENAI_CONFIG = {
  model: 'gpt-4o', // Latest GPT-4 Optimized model
  temperature: 0.2, // Low temperature for consistent, factual responses
  max_tokens: 2000, // Sufficient for SQL queries and analysis
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
};

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call OpenAI API for SQL query generation or results analysis
 */
export async function callOpenAI(
  messages: OpenAIMessage[]
): Promise<{ response: string; usage: OpenAIResponse['usage'] }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please set VITE_OPENAI_API_KEY environment variable.');
  }

  try {
    const response = await axios.post<OpenAIResponse>(
      'https://api.openai.com/v1/chat/completions',
      {
        model: OPENAI_CONFIG.model,
        messages,
        temperature: OPENAI_CONFIG.temperature,
        max_tokens: OPENAI_CONFIG.max_tokens,
        top_p: OPENAI_CONFIG.top_p,
        frequency_penalty: OPENAI_CONFIG.frequency_penalty,
        presence_penalty: OPENAI_CONFIG.presence_penalty,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    return {
      response: response.data.choices[0].message.content,
      usage: response.data.usage,
    };
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Invalid OpenAI API key');
    } else if (error.response?.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    } else if (error.response?.status === 500) {
      throw new Error('OpenAI API error. Please try again.');
    } else {
      throw new Error(`Failed to call OpenAI API: ${error.message}`);
    }
  }
}

/**
 * Get schema information for AI context
 */
export function getSchemaInfoForAI(): string {
  const table = schemaAdapter.getTable();
  const eventNameCol = schemaAdapter.getColumn('event_name');
  const dateCol = schemaAdapter.getColumn('date');
  const timestampCol = schemaAdapter.getColumn('timestamp');
  const userIdentifier = schemaAdapter.getUserIdentifier();

  return `
**Table Name:** ${table}

**Key Columns:**
- ${eventNameCol} (String) - Event name/type
- ${dateCol} (Date) - Event date (IST timezone)
- ${timestampCol} (DateTime) - Event timestamp

**User Identifier Expression:**
\`\`\`sql
${userIdentifier}
\`\`\`

**Common Query Patterns:**
- Use PREWHERE for filtering on ${dateCol} (faster than WHERE)
- Use ${dateCol} for date range filtering
- Use ${eventNameCol} for event filtering
- Group by ${userIdentifier} for user-level aggregations
- Use count(DISTINCT ${userIdentifier}) for unique user counts

**Example Query:**
\`\`\`sql
SELECT
  ${eventNameCol},
  count(*) as event_count,
  count(DISTINCT ${userIdentifier}) as unique_users
FROM ${table}
PREWHERE ${dateCol} >= today() - 7
GROUP BY ${eventNameCol}
ORDER BY event_count DESC
LIMIT 10;
\`\`\`
`;
}

/**
 * Generate SQL query from natural language question
 */
export async function generateSQLQuery(
  userQuestion: string,
  schemaInfo: string
): Promise<{ query: string; explanation: string; usage: OpenAIResponse['usage'] }> {
  const systemPrompt = `You are an expert ClickHouse SQL query generator for an analytics platform.

**Database Schema:**
${schemaInfo}

**Your Task:**
1. Generate a valid ClickHouse SQL query based on the user's question
2. Use the correct table name and column names from the schema
3. Follow ClickHouse SQL syntax (not standard SQL)
4. Optimize for performance (use PREWHERE, proper indexing)
5. Include appropriate LIMIT clauses (default: 100 rows)
6. Add helpful comments in the SQL
7. Use the user identifier expression provided in the schema (don't hardcode it)

**Response Format:**
Return your response in this exact format:

\`\`\`sql
-- Your SQL query here with comments
SELECT ...
\`\`\`

**Explanation:**
Brief explanation of what the query does and any important notes.`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuestion },
  ];

  const { response, usage } = await callOpenAI(messages);

  // Extract SQL query from response (between ```sql and ```)
  const sqlMatch = response.match(/```sql\n([\s\S]*?)\n```/);
  const query = sqlMatch ? sqlMatch[1].trim() : response;

  // Extract explanation (text after the SQL block)
  const parts = response.split('```');
  let explanation = '';
  if (parts.length >= 3) {
    // Get text after the SQL block
    explanation = parts.slice(2).join('```').trim();
    // Remove "**Explanation:**" prefix if present
    explanation = explanation.replace(/^\*\*Explanation:\*\*\s*/i, '');
  }
  if (!explanation) {
    explanation = 'No explanation provided.';
  }

  return { query, explanation, usage };
}

/**
 * Analyze query results and provide insights
 */
export async function analyzeQueryResults(
  query: string,
  results: any[],
  userQuestion?: string
): Promise<{ analysis: string; usage: OpenAIResponse['usage'] }> {
  // Limit results to first 50 rows for analysis (to avoid token limits)
  const limitedResults = results.slice(0, 50);
  const resultsJson = JSON.stringify(limitedResults, null, 2);

  const systemPrompt = `You are an expert data analyst specializing in ClickHouse analytics.

**Your Task:**
Analyze the query results and provide actionable insights based on the user's question.

**Analysis Guidelines:**
1. Identify key trends and patterns
2. Highlight notable data points (outliers, peaks, anomalies)
3. Provide business recommendations based on the data
4. Suggest follow-up queries or analyses
5. Keep the analysis concise and actionable (3-5 bullet points)

**Response Format:**
- Use bullet points for clarity
- Focus on insights, not just describing the data
- Be specific with numbers and percentages
- Suggest actionable next steps`;

  const userPrompt = userQuestion
    ? `**User's Question:** ${userQuestion}

**SQL Query:**
\`\`\`sql
${query}
\`\`\`

**Query Results (first 50 rows):**
\`\`\`json
${resultsJson}
\`\`\``
    : `**SQL Query:**
\`\`\`sql
${query}
\`\`\`

**Query Results (first 50 rows):**
\`\`\`json
${resultsJson}
\`\`\`

Analyze these results and provide key insights.`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const { response, usage } = await callOpenAI(messages);

  return { analysis: response, usage };
}
