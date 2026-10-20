import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="admin">
      <aside className="admin-sidebar">
        <Link to="/admin" className="logo admin-logo" data-testid="admin-logo">
          <span aria-hidden>🥐</span> Crumb CRM
        </Link>
        <nav className="admin-nav">
          <NavLink to="/admin" end data-testid="admin-nav-dashboard">Dashboard</NavLink>
          <NavLink to="/admin/orders" data-testid="admin-nav-orders">Orders</NavLink>
          <NavLink to="/admin/customers" data-testid="admin-nav-customers">Customers</NavLink>
          <NavLink to="/admin/products" data-testid="admin-nav-products">Products</NavLink>
        </nav>
        <div className="admin-sidebar-foot">
          <p className="small muted admin-user" data-testid="admin-user">{user?.email}</p>
          <Link to="/" className="small">View store ↗</Link>
          <button className="link-button small" onClick={handleSignOut} data-testid="admin-sign-out">Sign out</button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
