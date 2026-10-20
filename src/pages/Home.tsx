import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import ProductCard from '../components/ProductCard';
import { supabase } from '../lib/supabase';
import type { Category, Product } from '../lib/types';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?w=1600&h=900&fit=crop&q=75';

export default function Home() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_featured', true).order('id'),
      supabase.from('categories').select('*').order('sort_order'),
    ]).then(([p, c]) => {
      if (p.error || c.error) return setError((p.error ?? c.error)!.message);
      setFeatured(p.data as Product[]);
      setCategories(c.data as Category[]);
    });
  }, []);

  return (
    <>
      <section className="hero" style={{ backgroundImage: `url(${HERO_IMAGE})` }}>
        <div className="hero-overlay">
          <div className="container hero-content">
            <h1>Fresh from our oven to your table</h1>
            <p>Sourdough, celebration cakes, flaky pastries and cookies, baked by hand every morning.</p>
            <Link to="/shop" className="btn btn-large" data-testid="hero-shop-now">Shop now</Link>
          </div>
        </div>
      </section>

      <section className="container section">
        <h2>Browse by category</h2>
        <div className="category-grid">
          {categories.map((c) => (
            <Link key={c.id} to={`/shop?category=${c.slug}`} className="category-tile" data-testid="category-tile">
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>Customer favourites</h2>
          <Link to="/shop">View all →</Link>
        </div>
        {error && <p className="error">Could not load products: {error}</p>}
        <div className="product-grid">
          {featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </>
  );
}
