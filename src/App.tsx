import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import { useAuth } from './context/AuthContext';
import { isSupabaseConfigured } from './lib/supabase';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductPage';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Account from './pages/Account';
import NotFound from './pages/NotFound';
import AdminLayout from './admin/AdminLayout';
import AdminLogin from './admin/AdminLogin';
import ResetPassword from './admin/ResetPassword';
import Dashboard from './admin/Dashboard';
import AdminOrders from './admin/AdminOrders';
import AdminOrderDetail from './admin/AdminOrderDetail';
import Customers from './admin/Customers';
import CustomerDetail from './admin/CustomerDetail';
import AdminProducts from './admin/AdminProducts';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="container page"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading || (user && isAdmin === null)) return <div className="admin-loading"><p className="muted">Loading…</p></div>;
  if (!user || !isAdmin) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function StoreLayout() {
  return (
    <div className="app">
      <Header />
      {!isSupabaseConfigured && (
        <div className="config-banner" role="alert" data-testid="config-banner">
          Supabase is not configured. Add <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> to{' '}
          <code>.env</code> and restart the dev server.
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/reset-password" element={<ResetPassword />} />
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="orders/:id" element={<AdminOrderDetail />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="products" element={<AdminProducts />} />
      </Route>
      <Route element={<StoreLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/login" element={<Login />} />
        <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
