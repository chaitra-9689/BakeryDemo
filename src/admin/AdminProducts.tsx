import { useEffect, useState, type FormEvent } from 'react';
import { formatPrice } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Category, Product } from '../lib/types';

type Draft = Omit<Product, 'id'> & { id?: number };

const emptyDraft = (categoryId: number): Draft => ({
  category_id: categoryId, name: '', slug: '', description: '', price: 0, image_url: '', is_featured: false, is_available: true,
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [p, c] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    setProducts((p.data as Product[]) ?? []);
    setCategories((c.data as Category[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (p: Product, field: 'is_available' | 'is_featured') => {
    const { error } = await supabase.from('products').update({ [field]: !p[field] }).eq('id', p.id);
    if (error) return setError(error.message);
    setProducts((list) => list?.map((x) => (x.id === p.id ? { ...x, [field]: !p[field] } : x)) ?? null);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    const { id, ...fields } = draft;
    const row = { ...fields, slug: fields.slug || slugify(fields.name), image_url: fields.image_url || null };
    const { error } = id
      ? await supabase.from('products').update(row).eq('id', id)
      : await supabase.from('products').insert(row);
    if (error) return setError(error.message);
    setDraft(null);
    await load();
  };

  if (!products) return <p className="muted">Loading products…</p>;

  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? '';
  const q = query.trim().toLowerCase();
  const visible = products.filter((p) => !q || p.name.toLowerCase().includes(q) || categoryName(p.category_id).toLowerCase().includes(q));

  return (
    <div className="admin-page">
      <div className="section-head">
        <h1>Products</h1>
        <button className="btn btn-small" onClick={() => setDraft(emptyDraft(categories[0]?.id ?? 0))} data-testid="product-new">+ New product</button>
      </div>
      {error && <p className="error">{error}</p>}

      {draft && (
        <form className="card form product-form" onSubmit={save} data-testid="product-form">
          <h3>{draft.id ? 'Edit product' : 'New product'}</h3>
          <div className="form-grid">
            <label>Name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="product-name" /></label>
            <label>Slug<input value={draft.slug} placeholder={slugify(draft.name)} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} data-testid="product-slug" /></label>
            <label>Category
              <select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: Number(e.target.value) })} data-testid="product-category">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Price (₹)<input required type="number" min={0} step="1" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} data-testid="product-price" /></label>
          </div>
          <label>Image URL<input type="url" value={draft.image_url ?? ''} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} data-testid="product-image" /></label>
          <label>Description<textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="product-description" /></label>
          <div className="filter-row">
            <label className="checkbox"><input type="checkbox" checked={draft.is_available} onChange={(e) => setDraft({ ...draft, is_available: e.target.checked })} /> Available</label>
            <label className="checkbox"><input type="checkbox" checked={draft.is_featured} onChange={(e) => setDraft({ ...draft, is_featured: e.target.checked })} /> Featured</label>
          </div>
          <div className="filter-row">
            <button className="btn btn-small" data-testid="product-save">Save</button>
            <button type="button" className="link-button" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="filter-row">
        <input type="search" placeholder="Search products or categories" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="products-search" />
      </div>

      <div className="card table-card">
        <table className="table" data-testid="products-table">
          <thead>
            <tr><th>Product</th><th>Category</th><th>Price</th><th>Available</th><th>Featured</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} data-testid="product-row" className={p.is_available ? '' : 'row-muted'}>
                <td>{p.name}<div className="muted small">/{p.slug}</div></td>
                <td>{categoryName(p.category_id)}</td>
                <td className="num">{formatPrice(p.price)}</td>
                <td><input type="checkbox" className="switch" checked={p.is_available} onChange={() => toggle(p, 'is_available')} aria-label={`${p.name} available`} data-testid="product-available" /></td>
                <td><input type="checkbox" className="switch" checked={p.is_featured} onChange={() => toggle(p, 'is_featured')} aria-label={`${p.name} featured`} data-testid="product-featured" /></td>
                <td><button className="link-button" onClick={() => setDraft({ ...p })} data-testid="product-edit">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
