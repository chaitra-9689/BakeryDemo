import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatDate, formatPrice, shortOrderId, statusLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Order } from '../lib/types';

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setOrders((data as Order[]) ?? []);
      });
  }, []);

  if (!orders) return <div className="container page"><p className="muted">Loading orders…</p></div>;

  return (
    <div className="container page">
      <h1>My orders</h1>
      {error && <p className="error">{error}</p>}
      {orders.length === 0 ? (
        <div className="empty-state" data-testid="orders-empty">
          <p className="muted">You haven't placed any orders yet.</p>
          <Link to="/shop" className="btn">Start shopping</Link>
        </div>
      ) : (
        <ul className="order-list">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="card order-row" data-testid="order-row">
                <div>
                  <p className="order-id">Order #{shortOrderId(o.id)}</p>
                  <p className="muted small">{formatDate(o.created_at)} · {o.order_items.reduce((n, i) => n + i.quantity, 0)} items</p>
                </div>
                <span className={`status status-${o.status}`}>{statusLabel[o.status]}</span>
                <span className="price">{formatPrice(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
