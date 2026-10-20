import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { formatDate, formatPrice, isRevenue, shortOrderId, statusLabel } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { AdminOrder, Customer, CustomerNote } from '../lib/types';

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('orders').select('*, order_items(*)').eq('user_id', id).order('created_at', { ascending: false }),
      supabase.from('customer_notes').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ]).then(([c, o, n]) => {
      setCustomer(c.data as Customer | null);
      setOrders((o.data as AdminOrder[]) ?? []);
      setNotes((n.data as CustomerNote[]) ?? []);
      setLoading(false);
    });
  }, [id]);

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { data, error } = await supabase.from('customer_notes').insert({ customer_id: id, body: draft.trim() }).select().single();
    if (error) return setError(error.message);
    setNotes((list) => [data as CustomerNote, ...list]);
    setDraft('');
  };

  const deleteNote = async (noteId: number) => {
    const { error } = await supabase.from('customer_notes').delete().eq('id', noteId);
    if (error) return setError(error.message);
    setNotes((list) => list.filter((n) => n.id !== noteId));
  };

  if (loading) return <p className="muted">Loading customer…</p>;
  if (!customer) return <div><h1>Customer not found</h1><Link to="/admin/customers">← All customers</Link></div>;

  const paid = orders.filter((o) => isRevenue(o.status));
  const spent = paid.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="admin-page">
      <Link to="/admin/customers" className="small">← All customers</Link>
      <h1 data-testid="customer-name">{customer.full_name || 'Unnamed customer'}</h1>
      <p className="muted">Customer since {formatDate(customer.created_at)}</p>

      <div className="kpi-grid">
        <div className="card kpi"><p className="muted small">Orders</p><p className="kpi-value" data-testid="customer-order-count">{orders.length}</p></div>
        <div className="card kpi"><p className="muted small">Total spent</p><p className="kpi-value" data-testid="customer-spent">{formatPrice(spent)}</p></div>
        <div className="card kpi"><p className="muted small">Avg. order</p><p className="kpi-value">{formatPrice(paid.length ? spent / paid.length : 0)}</p></div>
      </div>

      <div className="admin-grid">
        <div>
          <div className="card">
            <h3>Contact</h3>
            <p>{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : <span className="muted">No email</span>}</p>
            <p>{customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : <span className="muted">No phone</span>}</p>
            <p className="pre-line">{customer.address || <span className="muted">No saved address</span>}</p>
          </div>

          <div className="card">
            <h3>Orders</h3>
            {orders.length === 0 ? <p className="muted">No orders yet.</p> : (
              <table className="table">
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} data-testid="customer-order-row">
                      <td><Link to={`/admin/orders/${o.id}`}>#{shortOrderId(o.id)}</Link><div className="muted small">{formatDate(o.created_at)}</div></td>
                      <td><span className={`status status-${o.status}`}>{statusLabel[o.status]}</span></td>
                      <td className="num">{formatPrice(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Notes</h3>
          <form className="form" onSubmit={addNote} data-testid="note-form">
            <textarea rows={3} required placeholder="Preferences, allergies, follow-ups…" value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="note-input" />
            <button className="btn btn-small" disabled={!draft.trim()} data-testid="note-submit">Add note</button>
          </form>
          {error && <p className="error">{error}</p>}
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id} data-testid="note">
                <p className="pre-line">{n.body}</p>
                <div className="note-meta">
                  <span className="muted small">{formatDate(n.created_at)}</span>
                  <button className="link-button small" onClick={() => deleteNote(n.id)} data-testid="note-delete">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
