import { supabase } from '@/lib/supabase';
import { DateRange, StreamEntry, listRevenue, listExpenseStream } from '@/lib/api/caisse';

export interface CaisseSession {
  id: string;
  session_date: string;
  opening_amount: number;
  closing_amount: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

export interface ProductSaleLine {
  sale_date: string;
  product_id: string | null;
  name: string;
  type: string;
  quantity: number;
  unit_price: number;
  total: number;
  invoice_number: string;
  customer_name: string;
}

export interface ProductSummary { name: string; quantity: number; total: number }

/** Local calendar date, YYYY-MM-DD. */
export const localToday = () => new Date().toLocaleDateString('en-CA');

/** Hour (local) after which the "close the caisse" reminder fires. */
export const CLOSING_REMINDER_HOUR = 20;

const COLS = 'id, session_date, opening_amount, closing_amount, opened_at, closed_at, notes';

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function getSession(date: string): Promise<CaisseSession | null> {
  const { data, error } = await supabase.from('caisse_sessions').select(COLS)
    .eq('session_date', date).maybeSingle();
  if (error) throw error;
  return data as CaisseSession | null;
}

export async function listSessions(): Promise<CaisseSession[]> {
  const { data, error } = await supabase.from('caisse_sessions').select(COLS)
    .order('session_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CaisseSession[];
}

export async function openSession(opening_amount: number, notes?: string | null): Promise<CaisseSession> {
  const { data, error } = await supabase.from('caisse_sessions')
    .insert({ session_date: localToday(), opening_amount, notes: notes?.trim() || null })
    .select(COLS).single();
  if (error) throw error;
  return data as CaisseSession;
}

export async function closeSession(id: string, closing_amount: number, notes?: string | null): Promise<CaisseSession> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('caisse_sessions')
    .update({
      closing_amount, closed_at: new Date().toISOString(), closed_by: auth.user?.id ?? null,
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
    })
    .eq('id', id).select(COLS).single();
  if (error) throw error;
  return data as CaisseSession;
}

export async function updateSession(id: string, patch: {
  opening_amount: number; closing_amount: number | null; notes: string | null;
  /** Previous closing time, kept when the session stays closed. */
  closed_at?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('caisse_sessions').update({
    opening_amount: patch.opening_amount,
    closing_amount: patch.closing_amount,
    closed_at: patch.closing_amount === null ? null : (patch.closed_at ?? new Date().toISOString()),
    notes: patch.notes?.trim() || null,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('caisse_sessions').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Gains / details
// ---------------------------------------------------------------------------

export async function listProductSales(range: DateRange): Promise<ProductSaleLine[]> {
  const { data, error } = await supabase.from('v_product_sales').select('*')
    .gte('sale_date', range.from).lte('sale_date', range.to)
    .order('sale_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProductSaleLine[];
}

/** Group sale lines by product name: quantity sold and money made per product. */
export function summarizeProducts(lines: ProductSaleLine[]): ProductSummary[] {
  const map = new Map<string, ProductSummary>();
  for (const l of lines) {
    const key = l.product_id ?? l.name;
    const cur = map.get(key) ?? { name: l.name, quantity: 0, total: 0 };
    cur.quantity += Number(l.quantity);
    cur.total += Number(l.total);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface PeriodDetails {
  revenue: StreamEntry[];
  expenses: StreamEntry[];
  products: ProductSaleLine[];
  totalIn: number;
  totalOut: number;
}

export async function getPeriodDetails(range: DateRange): Promise<PeriodDetails> {
  const [revenue, expenses, products] = await Promise.all([
    listRevenue(range),
    listExpenseStream(range),
    listProductSales(range).catch(() => [] as ProductSaleLine[]),
  ]);
  const sum = (rows: StreamEntry[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
  return { revenue, expenses, products, totalIn: sum(revenue), totalOut: sum(expenses) };
}
