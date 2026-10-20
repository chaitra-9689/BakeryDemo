import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import ProductImage from '../components/ProductImage';
import { MAX_QTY, useCart } from '../context/CartContext';
import { formatPrice } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { Category, Product } from '../lib/types';

type ProductWithCategory = Product & { categories: Pick<Category, 'name' | 'slug'> | null };

export default function ProductPage() {
  const { slug } = useParams();
  const { add } = useCart();
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('products')
      .select('*, categories(name, slug)')
      .eq('slug', slug ?? '')
      .maybeSingle()
      .then(({ data }) => {
        setProduct(data as ProductWithCategory | null);
        setLoading(false);
      });
  }, [slug]);

  if (loading) return <div className="container page"><p className="muted">Loading…</p></div>;
  if (!product) {
    return (
      <div className="container page">
        <h1>Product not found</h1>
        <Link to="/shop">Back to the shop</Link>
      </div>
    );
  }

  const handleAdd = () => {
    add(product, quantity);
    setAdded(true);
  };

  return (
    <div className="container page">
      <p className="breadcrumb">
        <Link to="/shop">Shop</Link>
        {product.categories && (
          <> / <Link to={`/shop?category=${product.categories.slug}`}>{product.categories.name}</Link></>
        )}
      </p>
      <div className="product-detail">
        <ProductImage src={product.image_url} alt={product.name} className="product-detail-image" />
        <div>
          <h1 data-testid="product-title">{product.name}</h1>
          <p className="price price-large" data-testid="product-detail-price">{formatPrice(product.price)}</p>
          <p className="lead">{product.description}</p>
          {product.is_available ? (
            <div className="add-row">
              <label className="qty-label">
                Quantity
                <input
                  type="number"
                  min={1}
                  max={MAX_QTY}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(MAX_QTY, Number(e.target.value) || 1)))}
                  data-testid="quantity-input"
                />
              </label>
              <button className="btn btn-large" onClick={handleAdd} data-testid="add-to-cart">
                Add to cart
              </button>
            </div>
          ) : (
            <p className="muted">Sold out today. Check back tomorrow morning.</p>
          )}
          {added && (
            <p className="success" data-testid="added-message">
              Added to your cart. <Link to="/cart">View cart →</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
