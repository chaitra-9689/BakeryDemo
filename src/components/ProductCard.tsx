import { useState } from 'react';
import { Link } from 'react-router';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/format';
import type { Product } from '../lib/types';
import ProductImage from './ProductImage';

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    add(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <article className="card product-card" data-testid="product-card" data-product-slug={product.slug}>
      <Link to={`/product/${product.slug}`} className="product-card-image">
        <ProductImage src={product.image_url} alt={product.name} />
      </Link>
      <div className="product-card-body">
        <Link to={`/product/${product.slug}`} className="product-card-name" data-testid="product-name">
          {product.name}
        </Link>
        <p className="product-card-desc">{product.description}</p>
        <div className="product-card-footer">
          <span className="price" data-testid="product-price">{formatPrice(product.price)}</span>
          {product.is_available ? (
            <button className="btn btn-small" onClick={handleAdd} data-testid="add-to-cart">
              {added ? 'Added ✓' : 'Add to cart'}
            </button>
          ) : (
            <span className="muted">Sold out</span>
          )}
        </div>
      </div>
    </article>
  );
}
