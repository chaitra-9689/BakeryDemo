import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

export default function Checkout() {
  const { user } = useAuth();
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [saveDetails, setSaveDetails] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => {
      const p = data as Profile | null;
      setForm((f) => ({
        ...f,
        name: f.name || p?.full_name || '',
        phone: f.phone || p?.phone || '',
        address: f.address || p?.address || '',
      }));
    });
  }, [user]);

  if (items.length === 0) {
    return (
      <div className="container page empty-state">
        <h1>Nothing to check out</h1>
        <Link to="/shop" className="btn">Browse the shop</Link>
      </div>
    );
  }

  const update = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data: orderId, error: rpcError } = await supabase.rpc('place_order', {
      p_items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      p_customer_name: form.name,
      p_phone: form.phone,
      p_delivery_address: form.address,
      p_notes: form.notes,
    });

    if (rpcError) {
      setSubmitting(false);
      setError(rpcError.message);
      return;
    }

    if (saveDetails && user) {
      await supabase
        .from('profiles')
        .update({ full_name: form.name, phone: form.phone, address: form.address })
        .eq('id', user.id);
    }

    clear();
    navigate(`/orders/${orderId}?placed=1`, { replace: true });
  };

  return (
    <div className="container page">
      <h1>Checkout</h1>
      <div className="cart-layout">
        <form className="card form" onSubmit={handleSubmit} data-testid="checkout-form">
          <h2>Delivery details</h2>
          <label>
            Full name
            <input required value={form.name} onChange={update('name')} autoComplete="name" data-testid="checkout-name" />
          </label>
          <label>
            Phone
            <input required type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" data-testid="checkout-phone" />
          </label>
          <label>
            Delivery address
            <textarea required rows={3} value={form.address} onChange={update('address')} autoComplete="street-address" data-testid="checkout-address" />
          </label>
          <label>
            Notes for the baker <span className="muted">(optional)</span>
            <textarea rows={2} value={form.notes} onChange={update('notes')} placeholder="e.g. 'Happy Birthday Sam' on the cake" data-testid="checkout-notes" />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={saveDetails} onChange={(e) => setSaveDetails(e.target.checked)} />
            Save these details for next time
          </label>
          <p className="muted small">Payment is cash or UPI on delivery.</p>
          {error && <p className="error" data-testid="checkout-error">{error}</p>}
          <button className="btn btn-block" disabled={submitting} data-testid="place-order">
            {submitting ? 'Placing order…' : `Place order · ${formatPrice(subtotal)}`}
          </button>
        </form>

        <aside className="card summary">
          <h2>Your order</h2>
          {items.map((i) => (
            <div key={i.productId} className="summary-row">
              <span>{i.quantity} × {i.name}</span>
              <span>{formatPrice(i.price * i.quantity)}</span>
            </div>
          ))}
          <div className="summary-row"><span>Delivery</span><span>Free</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{formatPrice(subtotal)}</span></div>
          <Link to="/cart" className="muted center-link">Edit cart</Link>
        </aside>
      </div>
    </div>
  );
}
