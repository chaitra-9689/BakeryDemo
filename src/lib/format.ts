import type { OrderStatus } from './types';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const formatPrice = (amount: number) => currency.format(Number(amount));

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export const shortOrderId = (id: string) => id.slice(0, 8).toUpperCase();

export const statusLabel: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  baking: 'In the oven',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const orderStatuses = Object.keys(statusLabel) as OrderStatus[];

// Cancelled orders don't count towards revenue.
export const isRevenue = (status: OrderStatus) => status !== 'cancelled';
