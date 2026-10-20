import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import ProductCard from '../components/ProductCard';
import { supabase } from '../lib/supabase';
import type { Category, Product } from '../lib/types';

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name';

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeCategory = params.get('category') ?? 'all';
  const search = params.get('q') ?? '';
  const sort = (params.get('sort') as Sort) ?? 'featured';

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').order('id'),
      supabase.from('categories').select('*').order('sort_order'),
    ]).then(([p, c]) => {
      setLoading(false);
      if (p.error || c.error) return setError((p.error ?? c.error)!.message);
      setProducts(p.data as Product[]);
      setCategories(c.data as Category[]);
    });
  }, []);

  const updateParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== fallback) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const category = categories.find((c) => c.slug === activeCategory);
    const term = search.trim().toLowerCase();
    const list = products.filter(
      (p) =>
        (!category || p.category_id === category.id) &&
        (!term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term)),
    );
    const sorters: Record<Sort, (a: Product, b: Product) => number> = {
      featured: (a, b) => Number(b.is_featured) - Number(a.is_featured) || a.id - b.id,
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(sorters[sort] ?? sorters.featured);
  }, [products, categories, activeCategory, search, sort]);

  return (
    <div className="container page">
      <h1>Shop</h1>

      <div className="filters">
        <div className="chips" role="tablist" aria-label="Categories">
          {[{ slug: 'all', name: 'All' }, ...categories].map((c) => (
            <button
              key={c.slug}
              role="tab"
              aria-selected={activeCategory === c.slug}
              className={`chip ${activeCategory === c.slug ? 'chip-active' : ''}`}
              onClick={() => updateParam('category', c.slug, 'all')}
              data-testid={`filter-${c.slug}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <input
            type="search"
            placeholder="Search cakes, bread, cookies…"
            value={search}
            onChange={(e) => updateParam('q', e.target.value, '')}
            aria-label="Search products"
            data-testid="search-input"
          />
          <select
            value={sort}
            onChange={(e) => updateParam('sort', e.target.value, 'featured')}
            aria-label="Sort products"
            data-testid="sort-select"
          >
            <option value="featured">Featured</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {loading && <p className="muted">Loading products…</p>}
      {error && <p className="error">Could not load products: {error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="muted" data-testid="no-results">No products match your search.</p>
      )}

      <div className="product-grid" data-testid="product-grid">
        {visible.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}
