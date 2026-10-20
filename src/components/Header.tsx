import { Link, NavLink, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Header() {
  const { user, isAdmin, signOut } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo" data-testid="logo">
          <span aria-hidden>🥐</span> Crumb &amp; Co.
        </Link>
        <nav className="nav">
          <NavLink to="/shop" data-testid="nav-shop">Shop</NavLink>
          {user && <NavLink to="/orders" data-testid="nav-orders">My orders</NavLink>}
          {isAdmin && <NavLink to="/admin" data-testid="nav-admin">CRM</NavLink>}
          {user ? (
            <>
              <NavLink to="/account" data-testid="nav-account">Account</NavLink>
              <button className="link-button" onClick={handleSignOut} data-testid="sign-out">Sign out</button>
            </>
          ) : (
            <NavLink to="/login" data-testid="nav-login">Sign in</NavLink>
          )}
          <NavLink to="/cart" className="cart-link" data-testid="nav-cart" aria-label={`Cart, ${count} items`}>
            Cart <span className="badge" data-testid="cart-count">{count}</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
