import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatDate, formatPrice, orderStatuses, shortOrderId, statusLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { AdminOrder, OrderStatus } from '../lib/types';

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as OrderStatus | '';
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        setError(error?.message ?? null);
        setOrders((data as AdminOrder[]) ?? []);
      });
  }, []);

  const updateStatus = async (id: string, next: OrderStatus) => {
    const { error } = await supabase.from('orders').update({ status: next }).eq('id', id);
    if (error) return setError(error.message);
    setOrders((list) => list?.map((o) => (o.id === id ? { ...o, status: next } : o)) ?? null);
  };

  if (!orders) return <p className="muted">Loading orders…</p>;

  const q = query.trim().toLowerCase();
  const visible = orders.filter(
    (o) =>
      (!status || o.status === status) &&
      (!q || [o.id, o.customer_name, o.phone, o.delivery_address].some((v) => v.toLowerCase().includes(q))),
  );

  return (
    <div className="admin-page">
      <h1>Orders</h1>
      {error && <p className="error">{error}</p>}

      <div className="filter-row">
        <input type="search" placeholder="Search by order #, name, phone or address" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="orders-search" />
        <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})} data-testid="orders-status-filter">
          <option value="">All statuses</option>
          {orderStatuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
      </div>

      <div className="card table-card">
        {visible.length === 0 ? <p className="muted">No orders match.</p> : (
          <table className="table" data-testid="orders-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} data-testid="admin-order-row">
                  <td><Link to={`/admin/orders/${o.id}`}>#{shortOrderId(o.id)}</Link><div className="muted small">{formatDate(o.created_at)}</div></td>
                  <td><Link to={`/admin/customers/${o.user_id}`}>{o.customer_name}</Link><div className="muted small">{o.phone}</div></td>
                  <td>{o.order_items.reduce((n, i) => n + i.quantity, 0)}</td>
                  <td className="num">{formatPrice(o.total)}</td>
                  <td>
                    <select className={`status-select status-${o.status}`} value={o.status} onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)} aria-label={`Status for order ${shortOrderId(o.id)}`} data-testid="order-status-select">
                      {orderStatuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small">{visible.length} of {orders.length} orders</p>
    </div>
  );
}
