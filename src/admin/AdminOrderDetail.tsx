import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatDate, formatPrice, orderStatuses, shortOrderId, statusLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { AdminOrder, OrderStatus, StatusChange } from '../lib/types';

export default function AdminOrderDetail() {
  const { id = '' } = useParams();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [history, setHistory] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, h] = await Promise.all([
      supabase.from('orders').select('*, order_items(*)').eq('id', id).maybeSingle(),
      supabase.from('order_status_history').select('id, status, created_at').eq('order_id', id).order('created_at'),
    ]);
    setOrder(o.data as AdminOrder | null);
    setHistory((h.data as StatusChange[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (next: OrderStatus) => {
    setError(null);
    const { error } = await supabase.from('orders').update({ status: next }).eq('id', id);
    if (error) setError(error.message);
    await load();
  };

  if (loading) return <p className="muted">Loading order…</p>;
  if (!order) return <div><h1>Order not found</h1><Link to="/admin/orders">← All orders</Link></div>;

  return (
    <div className="admin-page">
      <Link to="/admin/orders" className="small">← All orders</Link>
      <div className="section-head">
        <h1 data-testid="admin-order-number">Order #{shortOrderId(order.id)}</h1>
        <label className="inline-label">
          Status
          <select className={`status-select status-${order.status}`} value={order.status} onChange={(e) => updateStatus(e.target.value as OrderStatus)} data-testid="admin-order-status">
            {orderStatuses.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">Placed {formatDate(order.created_at)}</p>
      {error && <p className="error">{error}</p>}

      <div className="admin-grid">
        <div className="card">
          <h3>Items</h3>
          {order.order_items.map((i) => (
            <div key={i.id} className="summary-row" data-testid="admin-order-item">
              <span>{i.quantity} × {i.product_name} <span className="muted small">@ {formatPrice(i.unit_price)}</span></span>
              <span>{formatPrice(i.unit_price * i.quantity)}</span>
            </div>
          ))}
          <div className="summary-row summary-total"><span>Total</span><span>{formatPrice(order.total)}</span></div>
        </div>

        <div>
          <div className="card">
            <h3>Customer</h3>
            <p><Link to={`/admin/customers/${order.user_id}`} data-testid="admin-order-customer">{order.customer_name}</Link></p>
            <p><a href={`tel:${order.phone}`}>{order.phone}</a></p>
            <p className="pre-line">{order.delivery_address}</p>
            {order.notes && <p className="muted">Note: {order.notes}</p>}
          </div>
          <div className="card">
            <h3>Status history</h3>
            <ol className="timeline" data-testid="status-history">
              {history.map((h) => (
                <li key={h.id}>
                  <span className={`status status-${h.status}`}>{statusLabel[h.status]}</span>
                  <span className="muted small">{formatDate(h.created_at)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
