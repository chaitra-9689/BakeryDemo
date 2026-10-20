export type Category = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
};

export type Product = {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  image_url: string | null;
  is_featured: boolean;
  is_available: boolean;
};

export type OrderStatus = 'pending' | 'confirmed' | 'baking' | 'out_for_delivery' | 'delivered' | 'cancelled';

export type OrderItem = {
  id: number;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
};

export type Order = {
  id: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  delivery_address: string;
  notes: string | null;
  total: number;
  created_at: string;
  order_items: OrderItem[];
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
};

export type AdminOrder = Order & { user_id: string };

export type Customer = Profile & {
  email: string | null;
  created_at: string;
};

export type CustomerNote = {
  id: number;
  customer_id: string;
  body: string;
  created_at: string;
};

export type StatusChange = {
  id: number;
  status: OrderStatus;
  created_at: string;
};
