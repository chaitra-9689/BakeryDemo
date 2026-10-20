import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from '../lib/types';

export type CartItem = {
  productId: number;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
};

const STORAGE_KEY = 'bakery-cart';
export const MAX_QTY = 50;

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage unavailable (private mode); the cart still works for this visit.
    }
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const clamp = (q: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(q)));
    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      add: (product, quantity = 1) =>
        setItems((prev) => {
          const existing = prev.find((i) => i.productId === product.id);
          if (existing) {
            return prev.map((i) =>
              i.productId === product.id ? { ...i, quantity: clamp(i.quantity + quantity) } : i,
            );
          }
          return [
            ...prev,
            {
              productId: product.id,
              name: product.name,
              price: Number(product.price),
              imageUrl: product.image_url,
              quantity: clamp(quantity),
            },
          ];
        }),
      setQuantity: (productId, quantity) =>
        setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity: clamp(quantity) } : i))),
      remove: (productId) => setItems((prev) => prev.filter((i) => i.productId !== productId)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
