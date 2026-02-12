import { queryClickHouse } from './clickhouse-auth';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
}

/**
 * Get all active users except the current user (for sharing)
 */
export async function getUsersForSharing(currentUserId: string): Promise<User[]> {
  if (!currentUserId) {
    console.error('getUsersForSharing called without currentUserId');
    return [];
  }

  const query = `
    SELECT id, email, name, avatar_url
    FROM clicksight.users
    WHERE status = 'active' AND id != '${currentUserId}'
    ORDER BY name ASC
  `;

  const result = await queryClickHouse(query);
  return result.data || [];
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const query = `
    SELECT id, email, name, avatar_url
    FROM clicksight.users
    WHERE id = '${userId}' AND status = 'active'
    LIMIT 1
  `;

  const result = await queryClickHouse(query);

  if (result.data && result.data.length > 0) {
    return result.data[0];
  }

  return null;
}
