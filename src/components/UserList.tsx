import { UserOutlined } from '@ant-design/icons';
import { Avatar, Select, Space, Spin } from 'antd';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsersForSharing, User } from '../lib/users';

const { Option } = Select;

interface UserListProps {
  value?: string[];
  onChange?: (userIds: string[]) => void;
  placeholder?: string;
  mode?: 'multiple' | 'tags';
}

const UserList: React.FC<UserListProps> = ({
  value = [],
  onChange,
  placeholder = 'Select users',
  mode = 'multiple',
}) => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!currentUser) return;

      setLoading(true);
      try {
        const availableUsers = await getUsersForSharing(currentUser.id);
        setUsers(availableUsers);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [currentUser]);

  return (
    <Select
      mode={mode}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%' }}
      loading={loading}
      notFoundContent={loading ? <Spin size="small" /> : 'No users found'}
      showSearch
      filterOption={(input, option) =>
        (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
      }
    >
      {users.map((user) => (
        <Option key={user.id} value={user.id} label={`${user.name} (${user.email})`}>
          <Space>
            <Avatar
              size="small"
              src={user.avatar_url}
              icon={!user.avatar_url && <UserOutlined />}
            />
            <span>{user.name}</span>
            <span style={{ color: '#888', fontSize: 12 }}>({user.email})</span>
          </Space>
        </Option>
      ))}
    </Select>
  );
};

export default UserList;
