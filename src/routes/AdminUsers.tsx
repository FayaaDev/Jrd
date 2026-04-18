import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminUsers } from '../api/portfolio';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { fmtAge } from '../lib/format';

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const usersQuery = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => fetchAdminUsers(search),
  });

  return (
    <div className="admin-page">
      <section className="page-intro card">
        <span className="section-kicker">Admin users</span>
        <h1 className="page-title">Users</h1>
        <p className="page-intro__copy">Review who has access, when they joined, and whether their ledger exists.</p>
      </section>

      <Card className="admin-toolbar-card">
        <Input
          label="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or email"
        />
      </Card>

      {usersQuery.error && (
        <Card className="settings-section">
          <p className="text-negative">{usersQuery.error instanceof Error ? usersQuery.error.message : 'Unable to load users.'}</p>
        </Card>
      )}

      <div className="table-scroll card">
        <table className="table">
          <thead>
            <tr>
              <th className="table__th">User</th>
              <th className="table__th">Role</th>
              <th className="table__th">Ledger</th>
              <th className="table__th">Created</th>
            </tr>
          </thead>
          <tbody>
            {(usersQuery.data ?? []).map((user) => (
              <tr key={user.id} className="table__row">
                <td className="table__td">
                  <div className="holding-cell">
                    <span className="holding-cell__primary">{user.name ?? user.email}</span>
                    <span className="holding-cell__meta">{user.email}</span>
                  </div>
                </td>
                <td className="table__td">{user.role}</td>
                <td className="table__td">
                  {user.hasLedger ? (
                    <Link to={`/admin/portfolios/${user.id}`}>{user.ledgerStatus ?? 'active'}</Link>
                  ) : (
                    'missing'
                  )}
                </td>
                <td className="table__td">{fmtAge(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(usersQuery.data?.length ?? 0) === 0 && (
          <p className="table__empty">{usersQuery.isPending ? 'Loading users...' : 'No users match the current search.'}</p>
        )}
      </div>
    </div>
  );
}
