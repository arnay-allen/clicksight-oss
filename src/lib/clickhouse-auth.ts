import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import config from './config';

const CLICKHOUSE_URL = config.CLICKHOUSE_URL;
const CLICKHOUSE_USER = config.CLICKHOUSE_USER;
const CLICKHOUSE_PASSWORD = config.CLICKHOUSE_PASSWORD;

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  google_id: string;
  created_at?: string;
  last_login?: string;
  status?: string;
}

interface UserInput {
  id?: string;
  email: string;
  name: string;
  avatar_url: string;
  google_id: string;
}

export async function queryClickHouse(query: string): Promise<any> {
  try {
    const response = await axios.post(
      CLICKHOUSE_URL,
      query,
      {
        auth: {
          username: CLICKHOUSE_USER,
          password: CLICKHOUSE_PASSWORD,
        },
        params: {
          default_format: 'JSON',
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('ClickHouse query error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.exception || error.message);
  }
}

/**
 * Get user by email (returns latest by last_login)
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const escapedEmail = email.replace(/'/g, "''");
  const query = `
    SELECT id, email, name, avatar_url, google_id, created_at, last_login, status
    FROM clicksight.users
    WHERE email = '${escapedEmail}' AND status = 'active'
    ORDER BY last_login DESC
    LIMIT 1
  `;

  const result = await queryClickHouse(query);

  if (result.data && result.data.length > 0) {
    return result.data[0];
  }

  return null;
}

/**
 * Insert or update user (upsert)
 * Schema: ReplacingMergeTree(created_at) ORDER BY (id)
 * - created_at is version column (never updated)
 * - id is in ORDER BY (never updated)
 * - Everything else CAN be updated with ALTER UPDATE
 */
export async function insertOrUpdateUser(userInput: UserInput): Promise<User> {
  const escapedEmail = userInput.email.replace(/'/g, "''");
  const escapedName = userInput.name.replace(/'/g, "''");
  const escapedAvatarUrl = (userInput.avatar_url || '').replace(/'/g, "''");
  const escapedGoogleId = userInput.google_id.replace(/'/g, "''");

  if (userInput.id) {
    // Existing user - UPDATE works! (last_login not in ORDER BY or version column)
    const updateQuery = `
      ALTER TABLE clicksight.users 
      UPDATE 
        name = '${escapedName}',
        avatar_url = '${escapedAvatarUrl}',
        google_id = '${escapedGoogleId}',
        last_login = now()
      WHERE id = '${userInput.id}'
    `;
    
    await queryClickHouse(updateQuery);
  } else {
    // New user - INSERT
    const userId = uuidv4();
    const insertQuery = `
      INSERT INTO clicksight.users 
      (id, email, name, avatar_url, google_id, created_at, last_login, status)
      VALUES (
        '${userId}',
        '${escapedEmail}',
        '${escapedName}',
        '${escapedAvatarUrl}',
        '${escapedGoogleId}',
        now(),
        now(),
        'active'
      )
    `;
    
    await queryClickHouse(insertQuery);
    
    // Wait a moment for ClickHouse to process the insert
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Fetch and return user (with retry logic)
  let retries = 3;
  let user = null;
  
  while (retries > 0 && !user) {
    user = await getUserByEmail(userInput.email);
    if (!user) {
      retries--;
      if (retries > 0) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
  
  if (!user) {
    throw new Error('Failed to create/update user - user not found after insert');
  }

  return user;
}

/**
 * Get all active users (for sharing functionality)
 */
export async function getAllActiveUsers(): Promise<User[]> {
  const query = `
    SELECT id, email, name, avatar_url
    FROM clicksight.users
    WHERE status = 'active'
    ORDER BY name ASC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

