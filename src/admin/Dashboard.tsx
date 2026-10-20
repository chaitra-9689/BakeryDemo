import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatDate, formatPrice, isRevenue, orderStatuses, shortOrderId, statusLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { AdminOrder } from '../lib/types';

const DAYS = 14;
const dayKey = (d: Date) => d.toLocaleDateString('en-CA');

export default function Dashboard() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('admins').select('user_id', { count: 'exact', head: true }),
    ]).then(([o, p, a]) => {
      setError(o.error?.message ?? p.error?.message ?? null);
      setOrders((o.data as AdminOrder[]) ?? []);
      setCustomerCount((p.count ?? 0) - (a.count ?? 0));
    });
  }, []);

  const stats = useMemo(() => {
    if (!orders) return null;
    const paid = orders.filter((o) => isRevenue(o.status));
    const revenue = paid.reduce((s, o) => s + Number(o.total), 0);
    const open = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;

    const byStatus = orderStatuses.map((s) => ({ status: s, count: orders.filter((o) => o.status === s).length }));

    const today = new Date();
    const days = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (DAYS - 1 - i));
      return { key: dayKey(d), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), total: 0 };
    });
    for (const o of paid) {
      const day = days.find((d) => d.key === dayKey(new Date(o.created_at)));
      if (day) day.total += Number(o.total);
    }

    const products = new Map<string, { qty: number; revenue: number }>();
    for (const o of paid) {
      for (const i of o.order_items) {
        const p = products.get(i.product_name) ?? { qty: 0, revenue: 0 };
        p.qty += i.quantity;
        p.revenue += i.quantity * Number(i.unit_price);
        products.set(i.product_name, p);
      }
    }
    const topProducts = [...products.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);

    return {
      revenue,
      orderCount: orders.length,
      open,
      avg: paid.length ? revenue / paid.length : 0,
      byStatus,
      days,
      maxDay: Math.max(...days.map((d) => d.total), 1),
      topProducts,
    };
  }, [orders]);

  if (!orders || !stats) return <p className="muted">Loading dashboard…</p>;

  return (
    <div className="admin-page">
      <h1>Dashboard</h1>
      {error && <p className="error">{error}</p>}

      <div className="kpi-grid">
        <div className="card kpi" data-testid="kpi-revenue"><p className="muted small">Revenue</p><p className="kpi-value">{formatPrice(stats.revenue)}</p></div>
        <div className="card kpi" data-testid="kpi-orders"><p className="muted small">Orders</p><p className="kpi-value">{stats.orderCount}</p></div>
        <div className="card kpi" data-testid="kpi-open"><p className="muted small">Open orders</p><p className="kpi-value">{stats.open}</p></div>
        <div className="card kpi" data-testid="kpi-customers"><p className="muted small">Customers</p><p className="kpi-value">{customerCount}</p></div>
        <div className="card kpi" data-testid="kpi-aov"><p className="muted small">Avg. order value</p><p className="kpi-value">{formatPrice(stats.avg)}</p></div>
      </div>

      <div className="admin-grid">
        <div className="card">
          <h3>Revenue, last {DAYS} days</h3>
          <div className="bar-chart" data-testid="revenue-chart">
            {stats.days.map((d) => (
              <div key={d.key} className="bar-col" title={`${d.label}: ${formatPrice(d.total)}`}>
                <div className="bar" style={{ height: `${(d.total / stats.maxDay) * 100}%` }} />
                <span className="bar-label">{d.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Orders by status</h3>
          <ul className="plain-list">
            {stats.byStatus.map((s) => (
              <li key={s.status} className="summary-row">
                <Link to={`/admin/orders?status=${s.status}`}><span className={`status status-${s.status}`}>{statusLabel[s.status]}</span></Link>
                <strong data-testid={`status-count-${s.status}`}>{s.count}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="admin-grid">
        <div className="card">
          <div className="section-head"><h3>Recent orders</h3><Link to="/admin/orders" className="small">View all</Link></div>
          {orders.length === 0 ? <p className="muted">No orders yet.</p> : (
            <table className="table">
              <tbody>
                {orders.slice(0, 6).map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/orders/${o.id}`}>#{shortOrderId(o.id)}</Link><div className="muted small">{formatDate(o.created_at)}</div></td>
                    <td>{o.customer_name}</td>
                    <td><span className={`status status-${o.status}`}>{statusLabel[o.status]}</span></td>
                    <td className="num">{formatPrice(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Top products</h3>
          {stats.topProducts.length === 0 ? <p className="muted">No sales yet.</p> : (
            <table className="table">
              <tbody>
                {stats.topProducts.map(([name, p]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="num muted">{p.qty} sold</td>
                    <td className="num">{formatPrice(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
