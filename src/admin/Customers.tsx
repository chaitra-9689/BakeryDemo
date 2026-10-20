import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatDate, formatPrice, isRevenue } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Customer, OrderStatus } from '../lib/types';

type OrderSummary = { user_id: string; total: number; status: OrderStatus; created_at: string };
type SortKey = 'recent' | 'spent' | 'orders' | 'name';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('user_id, total, status, created_at'),
      supabase.from('admins').select('user_id'),
    ]).then(([c, o, a]) => {
      setError(c.error?.message ?? o.error?.message ?? null);
      // Staff accounts aren't customers.
      const staff = new Set((a.data ?? []).map((r) => r.user_id as string));
      setCustomers(((c.data as Customer[]) ?? []).filter((x) => !staff.has(x.id)));
      setOrders((o.data as OrderSummary[]) ?? []);
    });
  }, []);

  const rows = useMemo(() => {
    if (!customers) return [];
    const q = query.trim().toLowerCase();
    return customers
      .map((c) => {
        const mine = orders.filter((o) => o.user_id === c.id);
        return {
          ...c,
          orderCount: mine.length,
          spent: mine.filter((o) => isRevenue(o.status)).reduce((s, o) => s + Number(o.total), 0),
          lastOrder: mine.map((o) => o.created_at).sort().at(-1) ?? null,
        };
      })
      .filter((c) => !q || [c.full_name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort === 'spent') return b.spent - a.spent;
        if (sort === 'orders') return b.orderCount - a.orderCount;
        if (sort === 'name') return (a.full_name ?? '').localeCompare(b.full_name ?? '');
        return (b.lastOrder ?? b.created_at).localeCompare(a.lastOrder ?? a.created_at);
      });
  }, [customers, orders, query, sort]);

  if (!customers) return <p className="muted">Loading customers…</p>;

  return (
    <div className="admin-page">
      <h1>Customers</h1>
      {error && <p className="error">{error}</p>}

      <div className="filter-row">
        <input type="search" placeholder="Search by name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="customers-search" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} data-testid="customers-sort">
          <option value="recent">Most recent activity</option>
          <option value="spent">Highest spend</option>
          <option value="orders">Most orders</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div className="card table-card">
        {rows.length === 0 ? <p className="muted">No customers match.</p> : (
          <table className="table" data-testid="customers-table">
            <thead>
              <tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} data-testid="customer-row">
                  <td><Link to={`/admin/customers/${c.id}`}>{c.full_name || 'Unnamed'}</Link><div className="muted small">{c.email}</div></td>
                  <td>{c.phone || <span className="muted">—</span>}</td>
                  <td className="num">{c.orderCount}</td>
                  <td className="num">{formatPrice(c.spent)}</td>
                  <td className="small">{c.lastOrder ? formatDate(c.lastOrder) : <span className="muted">Never</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small">{rows.length} of {customers.length} customers</p>
    </div>
  );
}
