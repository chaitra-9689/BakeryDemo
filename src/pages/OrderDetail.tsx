import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { formatDate, formatPrice, shortOrderId, statusLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Order } from '../lib/types';

export default function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const justPlaced = params.get('placed') === '1';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id ?? '')
      .maybeSingle()
      .then(({ data }) => {
        setOrder(data as Order | null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="container page"><p className="muted">Loading order…</p></div>;
  if (!order) {
    return (
      <div className="container page">
        <h1>Order not found</h1>
        <Link to="/orders">Back to my orders</Link>
      </div>
    );
  }

  return (
    <div className="container page narrow">
      {justPlaced && (
        <div className="card confirmation" data-testid="order-confirmation">
          <h1>Thank you! Your order is in. 🎉</h1>
          <p>We'll start baking soon and deliver to {order.delivery_address}.</p>
        </div>
      )}
      <div className="section-head">
        <h2 data-testid="order-number">Order #{shortOrderId(order.id)}</h2>
        <span className={`status status-${order.status}`} data-testid="order-status">{statusLabel[order.status]}</span>
      </div>
      <p className="muted">Placed {formatDate(order.created_at)}</p>

      <div className="card">
        {order.order_items.map((i) => (
          <div key={i.id} className="summary-row" data-testid="order-item">
            <span>{i.quantity} × {i.product_name}</span>
            <span>{formatPrice(i.unit_price * i.quantity)}</span>
          </div>
        ))}
        <div className="summary-row summary-total">
          <span>Total</span><span data-testid="order-total">{formatPrice(order.total)}</span>
        </div>
      </div>

      <div className="card">
        <h3>Delivery</h3>
        <p>{order.customer_name} · {order.phone}</p>
        <p className="pre-line">{order.delivery_address}</p>
        {order.notes && <p className="muted">Note: {order.notes}</p>}
      </div>

      <Link to="/orders">← All orders</Link>
    </div>
  );
}
