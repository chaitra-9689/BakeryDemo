import { Link, useNavigate } from 'react-router';
import ProductImage from '../components/ProductImage';
import { MAX_QTY, useCart } from '../context/CartContext';
import { formatPrice } from '../lib/format';

export default function Cart() {
  const { items, subtotal, setQuantity, remove } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="container page empty-state" data-testid="cart-empty">
        <h1>Your cart is empty</h1>
        <p className="muted">Something warm and fresh is waiting for you.</p>
        <Link to="/shop" className="btn">Browse the shop</Link>
      </div>
    );
  }

  return (
    <div className="container page">
      <h1>Your cart</h1>
      <div className="cart-layout">
        <ul className="cart-list">
          {items.map((item) => (
            <li key={item.productId} className="cart-item" data-testid="cart-item">
              <ProductImage src={item.imageUrl} alt={item.name} className="cart-item-image" />
              <div className="cart-item-info">
                <p className="cart-item-name" data-testid="cart-item-name">{item.name}</p>
                <p className="muted">{formatPrice(item.price)} each</p>
              </div>
              <div className="qty-stepper">
                <button
                  onClick={() => setQuantity(item.productId, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                  aria-label={`Decrease ${item.name}`}
                  data-testid="qty-decrease"
                >−</button>
                <span data-testid="cart-item-qty">{item.quantity}</span>
                <button
                  onClick={() => setQuantity(item.productId, item.quantity + 1)}
                  disabled={item.quantity >= MAX_QTY}
                  aria-label={`Increase ${item.name}`}
                  data-testid="qty-increase"
                >+</button>
              </div>
              <p className="cart-item-total">{formatPrice(item.price * item.quantity)}</p>
              <button className="link-button" onClick={() => remove(item.productId)} data-testid="remove-item">
                Remove
              </button>
            </li>
          ))}
        </ul>

        <aside className="card summary">
          <h2>Order summary</h2>
          <div className="summary-row"><span>Subtotal</span><span data-testid="cart-subtotal">{formatPrice(subtotal)}</span></div>
          <div className="summary-row"><span>Delivery</span><span>Free</span></div>
          <div className="summary-row summary-total"><span>Total</span><span data-testid="cart-total">{formatPrice(subtotal)}</span></div>
          <button className="btn btn-block" onClick={() => navigate('/checkout')} data-testid="checkout-button">
            Proceed to checkout
          </button>
          <Link to="/shop" className="muted center-link">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
