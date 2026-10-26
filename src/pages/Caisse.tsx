import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Wallet, TrendingUp, TrendingDown, Plus, Trash2, ArrowDownCircle, ArrowUpCircle,
  Users, AlertCircle, LockOpen, Lock, History, ShoppingBag, Dumbbell, Scale,
  Search, RefreshCw, Download, Printer, Keyboard, ChevronRight, X, Calendar, Info,
} from 'lucide-react';
import { useCaisseSession } from '@/contexts/CaisseSessionContext';
import { CaisseHistoryDialog } from '@/components/caisse/CaisseHistoryDialog';
import { sourceLabel } from '@/components/caisse/SessionDetailsDialog';
import { toast } from '@/hooks/use-toast';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { usePermissions } from '@/contexts/AuthContext';
import {
  CashDirection, StreamEntry, OutstandingRow, RangePreset, DateRange,
  resolveRange, addTransaction, deleteTransaction,
  listRevenue, listExpenseStream, listOutstanding, getCaisseBalance,
} from '@/lib/api/caisse';
import {
  ProductSaleLine, listProductSales, summarizeProducts, localToday,
} from '@/lib/api/caisseSessions';
import { tr } from '@/lib/i18n';

/** Revenue sources counted as "subscriptions & athletes" gains. */
const SUBSCRIPTION_SOURCES = ['subscription', 'free_session', 'extra_fee', 'debt_payment'];
const MANUAL_SOURCES = ['cash_deposit', 'cash_withdraw'];
const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];

type Direction = 'in' | 'out';
type ViewTab = 'all' | 'in' | 'out' | 'unpaid';
interface Movement extends StreamEntry { dir: Direction }

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

const groupTotals = (rows: StreamEntry[]) => {
  const map = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const cur = map.get(r.source) ?? { count: 0, total: 0 };
    cur.count += 1; cur.total += Number(r.amount);
    map.set(r.source, cur);
  }
  return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
};

// ---------------------------------------------------------------------------
// Details dialog: shows how a displayed total is calculated.
// ---------------------------------------------------------------------------

interface FormulaLine { label: string; value: number; sign?: '+' | '−' | '='; hint?: string }
interface DetailState {
  title: string;
  subtitle?: string;
  lines: FormulaLine[];
  note?: string;
  rows?: Movement[];
  extra?: React.ReactNode;
}

const DetailsDialog: React.FC<{ state: DetailState | null; onClose: () => void }> = ({ state, onClose }) => (
  <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="gradient-text">{state?.title}</DialogTitle>
        {state?.subtitle && <DialogDescription className="text-gym-gold/60">{state.subtitle}</DialogDescription>}
      </DialogHeader>
      {state && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gym-gold/20 bg-gym-black/40 divide-y divide-gym-gold/10">
            {state.lines.map((l, i) => (
              <div key={i} className={cn('flex items-center gap-3 px-4 py-2.5', l.sign === '=' && 'bg-gym-gold/10')}>
                <span className={cn('w-5 text-center font-bold',
                  l.sign === '+' ? 'text-green-400' : l.sign === '−' ? 'text-red-400' : 'text-gym-gold')}>
                  {l.sign ?? ''}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', l.sign === '=' && 'font-semibold')}>{l.label}</p>
                  {l.hint && <p className="text-xs text-gym-gold/40">{l.hint}</p>}
                </div>
                <span className={cn('font-semibold tabular-nums', l.sign === '=' ? 'text-lg text-gym-gold' : '')}>
                  {formatDZD(l.value)}
                </span>
              </div>
            ))}
          </div>
          {state.note && (
            <p className="text-xs text-gym-gold/50 flex gap-2"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />{state.note}</p>
          )}
          {state.extra}
          {state.rows && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-gym-gold/50">
                {tr('Opérations', 'العمليات')} ({state.rows.length})
              </p>
              {state.rows.length === 0
                ? <p className="text-sm text-gym-gold/40 py-4 text-center">{tr('Rien sur cette période.', 'لا شيء في هذه الفترة.')}</p>
                : state.rows.map((r) => <MovementRow key={`${r.source}-${r.ref_id}`} m={r} compact />)}
            </div>
          )}
        </div>
      )}
    </DialogContent>
  </Dialog>
);

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const MovementRow: React.FC<{ m: Movement; compact?: boolean; onDelete?: () => void }> = ({ m, compact, onDelete }) => (
  <div className={cn('group flex items-center gap-3 rounded-lg border border-transparent hover:border-gym-gold/20 hover:bg-gym-black/40 transition-colors',
    compact ? 'px-2 py-1.5' : 'px-3 py-2.5')}>
    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
      m.dir === 'in' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
      {m.dir === 'in' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-gym-gold-light truncate">{m.label || sourceLabel(m.source)}</p>
      <p className="text-xs text-gym-gold/40 truncate">
        {sourceLabel(m.source)}{m.detail ? ` · ${m.detail}` : ''}
      </p>
    </div>
    <span className="text-xs text-gym-gold/40 shrink-0 hidden sm:block tabular-nums">{m.entry_date}</span>
    <span className={cn('text-sm font-semibold shrink-0 tabular-nums', m.dir === 'in' ? 'text-green-400' : 'text-red-400')}>
      {m.dir === 'in' ? '+' : '−'}{formatDZD(m.amount)}
    </span>
    {onDelete && (
      <Button size="icon" variant="ghost" onClick={onDelete}
              className="h-7 w-7 text-red-400 hover:bg-red-500/10 shrink-0 opacity-60 group-hover:opacity-100"
              aria-label={tr('Supprimer l’opération', 'حذف العملية')}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    )}
  </div>
);

const KpiCard: React.FC<{
  icon: React.ReactNode; label: string; value: number; sub?: string;
  tone: 'green' | 'blue' | 'red' | 'gold' | 'purple'; onClick: () => void; loading?: boolean;
}> = ({ icon, label, value, sub, tone, onClick, loading }) => {
  const tones = {
    green: 'from-green-500/15 border-green-500/25 hover:border-green-400/60 [&_.ic]:bg-green-500/20 [&_.ic]:text-green-400',
    blue: 'from-sky-500/15 border-sky-500/25 hover:border-sky-400/60 [&_.ic]:bg-sky-500/20 [&_.ic]:text-sky-400',
    red: 'from-red-500/15 border-red-500/25 hover:border-red-400/60 [&_.ic]:bg-red-500/20 [&_.ic]:text-red-400',
    gold: 'from-gym-gold/15 border-gym-gold/25 hover:border-gym-gold/60 [&_.ic]:bg-gym-gold/20 [&_.ic]:text-gym-gold',
    purple: 'from-violet-500/15 border-violet-500/25 hover:border-violet-400/60 [&_.ic]:bg-violet-500/20 [&_.ic]:text-violet-400',
  };
  return (
    <button type="button" onClick={onClick}
            className={cn('text-start rounded-xl border bg-gradient-to-br to-gym-gray p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gym-gold',
              tones[tone])}>
      <div className="flex items-center justify-between">
        <div className="ic w-9 h-9 rounded-lg flex items-center justify-center">{icon}</div>
        <ChevronRight className="w-4 h-4 text-gym-gold/30 rtl:rotate-180" />
      </div>
      <p className="mt-3 text-xs text-gym-gold/60">{label}</p>
      <p className="text-xl md:text-2xl font-bold text-gym-gold-light tabular-nums truncate">
        {loading ? '…' : formatDZD(value)}
      </p>
      {sub && <p className="text-xs text-gym-gold/40 mt-0.5 truncate">{sub}</p>}
    </button>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded border border-gym-gold/30 bg-gym-black text-[10px] font-mono text-gym-gold/80">{children}</kbd>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PRESETS = (): [RangePreset, string][] => [
  ['today', tr('Aujourd’hui', 'اليوم')],
  ['yesterday', tr('Hier', 'أمس')],
  ['week', tr('7 jours', '7 أيام')],
  ['month', tr('30 jours', '30 يومًا')],
  ['thisMonth', tr('Ce mois', 'هذا الشهر')],
  ['all', tr('Tout', 'الكل')],
  ['custom', tr('Personnalisé', 'مخصص')],
];

export const Caisse: React.FC = () => {
  const { can } = usePermissions();
  const caisseSession = useCaisseSession();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);

  const [preset, setPreset] = useState<RangePreset>('today');
  const [custom, setCustom] = useState<DateRange>({ from: localToday(), to: localToday() });
  const [tab, setTab] = useState<ViewTab>('all');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const [revenue, setRevenue] = useState<StreamEntry[]>([]);
  const [expenses, setExpenses] = useState<StreamEntry[]>([]);
  const [products, setProducts] = useState<ProductSaleLine[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [balance, setBalance] = useState({ total_in: 0, total_out: 0, balance: 0 });
  const [todayIn, setTodayIn] = useState(0);
  const [todayOut, setTodayOut] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New transaction dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [direction, setDirection] = useState<CashDirection>('deposit');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState(localToday());
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);
  const rangeLabel = preset === 'all' ? tr('Toutes les dates', 'كل التواريخ')
    : range.from === range.to ? range.from : `${range.from} → ${range.to}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const d = localToday();
    try {
      const [rev, exp, prod, out, bal, tRev, tExp] = await Promise.all([
        listRevenue(range),
        listExpenseStream(range),
        listProductSales(range).catch(() => [] as ProductSaleLine[]),
        listOutstanding(),
        getCaisseBalance(),
        listRevenue({ from: d, to: d }),
        listExpenseStream({ from: d, to: d }),
      ]);
      setRevenue(rev); setExpenses(exp); setProducts(prod);
      setOutstanding(out); setBalance(bal);
      setTodayIn(sum(tRev)); setTodayOut(sum(tExp));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // ---- Derived numbers ----------------------------------------------------
  const salesRows = useMemo(() => revenue.filter((r) => r.source === 'sale'), [revenue]);
  const subRows = useMemo(() => revenue.filter((r) => SUBSCRIPTION_SOURCES.includes(r.source)), [revenue]);
  const otherInRows = useMemo(() => revenue.filter((r) => r.source !== 'sale' && !SUBSCRIPTION_SOURCES.includes(r.source)), [revenue]);
  const periodIn = sum(revenue);
  const periodOut = sum(expenses);
  const salesTotal = sum(salesRows);
  const subTotal = sum(subRows);
  const net = periodIn - periodOut;
  const totalDebt = useMemo(() => outstanding.reduce((s, r) => s + Number(r.remaining), 0), [outstanding]);
  const opening = caisseSession.session ? Number(caisseSession.session.opening_amount) : null;
  const drawerExpected = opening !== null ? opening + todayIn - todayOut : null;

  const movements = useMemo<Movement[]>(() => [
    ...revenue.map((r) => ({ ...r, dir: 'in' as const })),
    ...expenses.map((r) => ({ ...r, dir: 'out' as const })),
  ].sort((a, b) => b.entry_date.localeCompare(a.entry_date)), [revenue, expenses]);

  const tag = (rows: StreamEntry[], dir: Direction): Movement[] => rows.map((r) => ({ ...r, dir }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements.filter((m) =>
      (tab === 'all' || tab === m.dir)
      && (!sourceFilter || m.source === sourceFilter)
      && (!q || `${m.label} ${m.detail} ${sourceLabel(m.source)}`.toLowerCase().includes(q)));
  }, [movements, tab, sourceFilter, query]);

  const filteredIn = sum(filtered.filter((m) => m.dir === 'in'));
  const filteredOut = sum(filtered.filter((m) => m.dir === 'out'));

  const sourceChips = useMemo(() => {
    const base = tab === 'in' ? revenue : tab === 'out' ? expenses : [...revenue, ...expenses];
    return groupTotals(base);
  }, [tab, revenue, expenses]);

  const byDate = useMemo(() => {
    const map = new Map<string, Movement[]>();
    for (const m of filtered) map.set(m.entry_date, [...(map.get(m.entry_date) ?? []), m]);
    return [...map.entries()];
  }, [filtered]);

  // ---- Card details -------------------------------------------------------
  const showBalance = () => setDetail({
    title: tr('Contenu de la caisse', 'محتوى الصندوق'),
    subtitle: tr('Comment le montant en caisse est calculé', 'كيف يُحسب المبلغ الموجود في الصندوق'),
    lines: [
      { label: tr('Total de toutes les entrées', 'مجموع كل المداخيل'), value: balance.total_in, sign: '+', hint: tr('Depuis le début', 'منذ البداية') },
      { label: tr('Total de toutes les sorties', 'مجموع كل المخارج'), value: balance.total_out, sign: '−', hint: tr('Depuis le début', 'منذ البداية') },
      { label: tr('Solde en caisse', 'الرصيد في الصندوق'), value: balance.balance, sign: '=' },
    ],
    note: tr('Le solde est cumulé : il ne dépend pas de la période filtrée.', 'الرصيد تراكمي: لا يتأثر بالفترة المختارة.'),
    extra: (
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-gym-gold/50">{tr('Tiroir d’aujourd’hui', 'درج اليوم')}</p>
        {opening === null ? (
          <p className="text-sm text-gym-gold/50">{tr('La caisse n’a pas encore été ouverte aujourd’hui.', 'لم يُفتح الصندوق اليوم بعد.')}</p>
        ) : (
          <div className="rounded-xl border border-gym-gold/20 bg-gym-black/40 divide-y divide-gym-gold/10">
            {([
              ['', tr('Montant d’ouverture', 'مبلغ الافتتاح'), opening],
              ['+', tr('Entrées d’aujourd’hui', 'مداخيل اليوم'), todayIn],
              ['−', tr('Sorties d’aujourd’hui', 'مخارج اليوم'), todayOut],
              ['=', tr('Devrait être dans le tiroir', 'المفروض في الدرج'), drawerExpected ?? 0],
            ] as [string, string, number][]).map(([s, l, v]) => (
              <div key={l} className={cn('flex items-center gap-3 px-4 py-2.5', s === '=' && 'bg-gym-gold/10 font-semibold')}>
                <span className={cn('w-5 text-center font-bold', s === '+' ? 'text-green-400' : s === '−' ? 'text-red-400' : 'text-gym-gold')}>{s}</span>
                <span className="flex-1 text-sm">{l}</span>
                <span className="tabular-nums">{formatDZD(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  });

  const showSales = () => {
    const summary = summarizeProducts(products);
    setDetail({
      title: tr('Gains des ventes de produits', 'أرباح بيع المنتجات'),
      subtitle: rangeLabel,
      lines: [
        ...summary.map((p) => ({ label: p.name, value: p.total, sign: '+' as const, hint: `${tr('Quantité', 'الكمية')} : ${p.quantity}` })),
        { label: `${tr('Total des ventes', 'مجموع المبيعات')} (${salesRows.length})`, value: salesTotal, sign: '=' as const },
      ],
      note: tr('Somme de toutes les factures de vente payées sur la période.', 'مجموع كل فواتير البيع المدفوعة في الفترة.'),
      extra: summary.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-gym-gold/50">{tr('Par produit', 'حسب المنتج')}</p>
          <div className="rounded-xl border border-gym-gold/20 divide-y divide-gym-gold/10">
            {summary.map((p) => (
              <div key={p.name} className="flex items-center gap-3 px-4 py-2">
                <ShoppingBag className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="flex-1 text-sm truncate">{p.name}</span>
                <Badge variant="outline" className="border-gym-gold/25 text-gym-gold/70">×{p.quantity}</Badge>
                <span className="text-sm text-green-400 tabular-nums">{formatDZD(p.total)}</span>
              </div>
            ))}
          </div>
        </div>
      ),
      rows: tag(salesRows, 'in'),
    });
  };

  const showSubs = () => setDetail({
    title: tr('Gains des abonnements & séances', 'أرباح الاشتراكات والحصص'),
    subtitle: rangeLabel,
    lines: [
      ...groupTotals(subRows).map(([src, g]) => ({
        label: sourceLabel(src), value: g.total, sign: '+' as const, hint: `${g.count} ${tr('opération(s)', 'عملية')}`,
      })),
      { label: tr('Total abonnements & athlètes', 'مجموع الاشتراكات والرياضيين'), value: subTotal, sign: '=' as const },
    ],
    note: tr('Comprend abonnements, séances libres, frais d’inscription et paiements de dettes.', 'يشمل الاشتراكات والحصص الحرة ورسوم التسجيل وتسديد الديون.'),
    rows: tag(subRows, 'in'),
  });

  const showIn = () => setDetail({
    title: tr('Total des entrées', 'مجموع المداخيل'),
    subtitle: rangeLabel,
    lines: [
      { label: tr('Ventes de produits', 'بيع المنتجات'), value: salesTotal, sign: '+' },
      { label: tr('Abonnements & athlètes', 'الاشتراكات والرياضيون'), value: subTotal, sign: '+' },
      ...groupTotals(otherInRows).map(([src, g]) => ({ label: sourceLabel(src), value: g.total, sign: '+' as const, hint: `${g.count}` })),
      { label: tr('Total entrées', 'مجموع المداخيل'), value: periodIn, sign: '=' },
    ],
    rows: tag(revenue, 'in'),
  });

  const showOut = () => setDetail({
    title: tr('Total des sorties', 'مجموع المخارج'),
    subtitle: rangeLabel,
    lines: [
      ...groupTotals(expenses).map(([src, g]) => ({ label: sourceLabel(src), value: g.total, sign: '+' as const, hint: `${g.count} ${tr('opération(s)', 'عملية')}` })),
      { label: tr('Total sorties', 'مجموع المخارج'), value: periodOut, sign: '=' },
    ],
    rows: tag(expenses, 'out'),
  });

  const showNet = () => setDetail({
    title: tr('Bénéfice net', 'الربح الصافي'),
    subtitle: rangeLabel,
    lines: [
      { label: tr('Ventes de produits', 'بيع المنتجات'), value: salesTotal, sign: '+' },
      { label: tr('Abonnements & athlètes', 'الاشتراكات والرياضيون'), value: subTotal, sign: '+' },
      ...(otherInRows.length ? [{ label: tr('Autres entrées (dépôts…)', 'مداخيل أخرى (إيداعات…)'), value: sum(otherInRows), sign: '+' as const }] : []),
      { label: tr('Toutes les sorties', 'كل المخارج'), value: periodOut, sign: '−' },
      { label: tr('Net', 'الصافي'), value: net, sign: '=' },
    ],
    note: tr('Net = entrées − sorties sur la période sélectionnée.', 'الصافي = المداخيل − المخارج في الفترة المختارة.'),
  });

  // ---- Actions ------------------------------------------------------------
  const openNew = useCallback((dir: CashDirection) => {
    if (!can('caisse', 'create')) return;
    setDirection(dir); setAmount(''); setDesc(''); setTxDate(localToday());
    setDialogOpen(true);
  }, [can]);

  const submitTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast({ title: tr('Saisissez un montant', 'أدخل مبلغًا'), description: tr('Doit être supérieur à zéro.', 'يجب أن يكون أكبر من صفر.'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addTransaction({ direction, amount: value, transaction_date: txDate, description: desc || null });
      toast({
        title: direction === 'deposit' ? tr('Dépôt enregistré', 'تم تسجيل الإيداع') : tr('Retrait enregistré', 'تم تسجيل السحب'),
        description: formatDZD(value),
      });
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: tr('Impossible d’enregistrer l’opération', 'تعذر حفظ العملية'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const removeTx = async (id: string) => {
    if (!window.confirm(tr('Supprimer cette opération ?', 'حذف هذه العملية؟'))) return;
    try {
      await deleteTransaction(id);
      toast({ title: tr('Opération supprimée', 'تم حذف العملية') });
      await load();
    } catch (e) {
      toast({ title: tr('Suppression impossible', 'تعذر الحذف'), description: describeError(e), variant: 'destructive' });
    }
  };

  const exportCsv = useCallback(() => {
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Date', 'Type', 'Source', 'Libellé', 'Détail', 'Montant'].map(esc).join(','),
      ...filtered.map((m) => [m.entry_date, m.dir === 'in' ? 'Entrée' : 'Sortie', sourceLabel(m.source), m.label, m.detail,
        (m.dir === 'in' ? 1 : -1) * Number(m.amount)].map(esc).join(',')),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `caisse_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filtered, range]);

  const resetFilters = () => { setTab('all'); setSourceFilter(null); setQuery(''); };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        if (e.key === 'Escape' && el === searchRef.current) { setQuery(''); el.blur(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || dialogOpen || detail) return;
      const k = e.key.toLowerCase();
      const presetKeys: Record<string, RangePreset> = { '1': 'today', '2': 'yesterday', '3': 'week', '4': 'month', '5': 'thisMonth', '6': 'all' };
      if (presetKeys[k]) { setPreset(presetKeys[k]); return; }
      switch (k) {
        case 'n': case 'd': e.preventDefault(); openNew('deposit'); break;
        case 'w': e.preventDefault(); openNew('withdraw'); break;
        case 'r': load(); break;
        case '/': case 'f': e.preventDefault(); searchRef.current?.focus(); break;
        case 'e': exportCsv(); break;
        case 'h': setHistoryOpen(true); break;
        case 'p': window.print(); break;
        case '?': setShortcutsOpen(true); break;
        case 'a': setTab('all'); break;
        case 'i': setTab('in'); break;
        case 'o': setTab('out'); break;
        case 'u': setTab('unpaid'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen, detail, openNew, load, exportCsv]);

  const tabs: [ViewTab, string, number, string][] = [
    ['all', tr('Toutes', 'الكل'), movements.length, 'A'],
    ['in', tr('Entrées', 'المداخيل'), revenue.length, 'I'],
    ['out', tr('Sorties', 'المخارج'), expenses.length, 'O'],
    ['unpaid', tr('Impayés', 'غير مدفوع'), outstanding.length, 'U'],
  ];

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-0 md:p-2">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold gradient-text">{tr('Caisse', 'الصندوق')}</h1>
              {!caisseSession.unavailable && (
                <Badge variant="outline" className={cn('gap-1.5',
                  caisseSession.isOpen ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-red-500/40 text-red-400 bg-red-500/10')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', caisseSession.isOpen ? 'bg-green-400 animate-pulse' : 'bg-red-400')} />
                  {caisseSession.isOpen ? tr('Ouverte', 'مفتوح') : tr('Fermée', 'مغلق')}
                </Badge>
              )}
            </div>
            <p className="text-gym-gold/50 text-sm mt-1">{tr('Mouvements, gains, solde et paiements en attente.', 'الحركات والأرباح والرصيد والمدفوعات المعلقة.')}</p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {can('caisse', 'create') && (
              <>
                <Button onClick={() => openNew('deposit')} className="bg-green-600 hover:bg-green-700 text-white">
                  <ArrowDownCircle className="w-4 h-4 me-2" />{tr('Dépôt', 'إيداع')}
                </Button>
                <Button onClick={() => openNew('withdraw')} className="bg-red-600/90 hover:bg-red-700 text-white">
                  <ArrowUpCircle className="w-4 h-4 me-2" />{tr('Retrait', 'سحب')}
                </Button>
              </>
            )}
            {caisseSession.isOpen ? (
              <Button variant="outline" onClick={caisseSession.requestClose} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
                <Lock className="w-4 h-4 me-2" />{tr('Fermer la caisse', 'إغلاق الصندوق')}
              </Button>
            ) : (
              <Button onClick={caisseSession.requestOpen} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                <LockOpen className="w-4 h-4 me-2" />{tr('Ouvrir la caisse', 'فتح الصندوق')}
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => setHistoryOpen(true)} title={tr('Historique caisse (H)', 'سجل الصندوق (H)')}
                    className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"><History className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={load} title={tr('Actualiser (R)', 'تحديث (R)')}
                    className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShortcutsOpen(true)} title={tr('Raccourcis (?)', 'الاختصارات (?)')}
                    className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"><Keyboard className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Caisse content hero */}
        <div className="grid lg:grid-cols-3 gap-4">
          {can('caisse', 'view_balance') && (
            <button type="button" onClick={showBalance}
                    className="lg:col-span-2 text-start rounded-2xl border border-gym-gold/40 bg-gradient-to-br from-gym-gold/25 via-gym-gray to-gym-black p-5 md:p-6 hover:border-gym-gold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gym-gold">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gym-gold text-gym-black flex items-center justify-center"><Wallet className="w-6 h-6" /></div>
                  <div>
                    <p className="text-sm text-gym-gold/70">{tr('Montant en caisse', 'المبلغ في الصندوق')}</p>
                    <p className="text-3xl md:text-4xl font-bold text-gym-gold-light tabular-nums">{loading ? '…' : formatDZD(balance.balance)}</p>
                  </div>
                </div>
                <span className="text-xs text-gym-gold/50 flex items-center gap-1">{tr('Détails', 'التفاصيل')}<ChevronRight className="w-4 h-4 rtl:rotate-180" /></span>
              </div>
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  [tr('Ouverture du jour', 'افتتاح اليوم'), opening, 'text-gym-gold-light'],
                  [tr('Entrées du jour', 'مداخيل اليوم'), todayIn, 'text-green-400'],
                  [tr('Sorties du jour', 'مخارج اليوم'), todayOut, 'text-red-400'],
                  [tr('Attendu au tiroir', 'المتوقع في الدرج'), drawerExpected, 'text-gym-gold'],
                ] as [string, number | null, string][]).map(([l, v, c]) => (
                  <div key={l} className="rounded-lg bg-gym-black/50 border border-gym-gold/10 px-3 py-2">
                    <p className="text-[11px] text-gym-gold/50">{l}</p>
                    <p className={cn('font-semibold tabular-nums', c)}>{v === null ? '—' : formatDZD(v)}</p>
                  </div>
                ))}
              </div>
            </button>
          )}
          <div className={cn('grid grid-cols-2 gap-4', !can('caisse', 'view_balance') && 'lg:col-span-3 lg:grid-cols-4')}>
            <KpiCard icon={<Scale className="w-5 h-5" />} label={tr('Net (période)', 'الصافي (الفترة)')} value={net}
                     tone={net >= 0 ? 'gold' : 'red'} onClick={showNet} loading={loading} sub={tr('Entrées − sorties', 'مداخيل − مخارج')} />
            <KpiCard icon={<AlertCircle className="w-5 h-5" />} label={tr('Impayés athlètes', 'مستحقات الرياضيين')} value={totalDebt}
                     tone="purple" onClick={() => setTab('unpaid')} loading={loading} sub={`${outstanding.length} ${tr('athlète(s)', 'رياضي')}`} />
            <KpiCard icon={<TrendingUp className="w-5 h-5" />} label={tr('Total entrées', 'مجموع المداخيل')} value={periodIn}
                     tone="green" onClick={showIn} loading={loading} sub={`${revenue.length} ${tr('opérations', 'عملية')}`} />
            <KpiCard icon={<TrendingDown className="w-5 h-5" />} label={tr('Total sorties', 'مجموع المخارج')} value={periodOut}
                     tone="red" onClick={showOut} loading={loading} sub={`${expenses.length} ${tr('opérations', 'عملية')}`} />
          </div>
        </div>

        {/* Gains split */}
        <div className="grid sm:grid-cols-2 gap-4">
          <KpiCard icon={<ShoppingBag className="w-5 h-5" />} label={tr('Gains des ventes de produits', 'أرباح بيع المنتجات')}
                   value={salesTotal} tone="blue" onClick={showSales} loading={loading}
                   sub={`${salesRows.length} ${tr('vente(s)', 'عملية بيع')} · ${products.reduce((s, p) => s + Number(p.quantity), 0)} ${tr('article(s)', 'قطعة')} · ${rangeLabel}`} />
          <KpiCard icon={<Dumbbell className="w-5 h-5" />} label={tr('Gains des abonnements & séances', 'أرباح الاشتراكات والحصص')}
                   value={subTotal} tone="green" onClick={showSubs} loading={loading}
                   sub={`${subRows.length} ${tr('paiement(s)', 'دفعة')} · ${rangeLabel}`} />
        </div>

        {/* Filters */}
        <Card className="bg-gym-gray border-gym-gold/20 print:hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="w-4 h-4 text-gym-gold/50" />
              <div className="flex flex-wrap gap-1 rounded-lg bg-gym-black/60 p-1">
                {PRESETS().map(([key, label], i) => (
                  <button key={key} type="button" onClick={() => setPreset(key)}
                          className={cn('px-3 py-1.5 text-sm rounded-md transition-colors',
                            preset === key ? 'bg-gym-gold text-gym-black font-semibold' : 'text-gym-gold/70 hover:bg-gym-gold/10')}>
                    {label}{i < 6 && <span className="ms-1.5 text-[10px] opacity-50">{i + 1}</span>}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-gym-gold/40" />
                <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
                       placeholder={tr('Rechercher (nom, produit, détail…)  /', 'بحث (اسم، منتج، تفاصيل…)  /')}
                       className="bg-gym-black border-gym-gold/30 text-gym-gold ps-9 pe-8" />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 text-gym-gold/50 hover:text-gym-gold">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                <Download className="w-4 h-4 me-1.5" />CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                <Printer className="w-4 h-4" />
              </Button>
            </div>

            {preset === 'custom' && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr('Du', 'من')}</Label>
                  <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                         className="bg-gym-black border-gym-gold/30 text-gym-gold w-44" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr('Au', 'إلى')}</Label>
                  <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                         className="bg-gym-black border-gym-gold/30 text-gym-gold w-44" />
                </div>
                {custom.from > custom.to && (
                  <p className="text-xs text-red-400 pb-2">{tr('La date de début est après la date de fin.', 'تاريخ البداية بعد تاريخ النهاية.')}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {error ? (
          <Card className="bg-gym-gray border-red-500/30">
            <CardContent className="p-8 text-center space-y-3">
              <p className="text-red-400 font-medium">{tr('Impossible de charger la caisse', 'تعذر تحميل الصندوق')}</p>
              <p className="text-sm text-gym-gold/50">{error}</p>
              <Button variant="outline" onClick={load} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">{tr('Réessayer', 'إعادة المحاولة')}</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-gym-gray border-gym-gold/20">
            <CardContent className="p-0">
              {/* Tabs */}
              <div className="flex flex-wrap items-center gap-1 border-b border-gym-gold/15 px-3 pt-3">
                {tabs.map(([key, label, count, kbd]) => (
                  <button key={key} type="button" onClick={() => { setTab(key); setSourceFilter(null); }}
                          className={cn('px-4 py-2 text-sm rounded-t-lg border-b-2 -mb-px transition-colors flex items-center gap-2',
                            tab === key ? 'border-gym-gold text-gym-gold font-semibold bg-gym-gold/5' : 'border-transparent text-gym-gold/50 hover:text-gym-gold')}>
                    {label}
                    <span className={cn('text-[11px] px-1.5 rounded-full', tab === key ? 'bg-gym-gold text-gym-black' : 'bg-gym-gold/10')}>{count}</span>
                    <span className="hidden md:inline text-[10px] opacity-40">{kbd}</span>
                  </button>
                ))}
                <span className="ms-auto text-xs text-gym-gold/40 pb-2 hidden sm:block">{rangeLabel}</span>
              </div>

              {tab !== 'unpaid' && sourceChips.length > 1 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-3 print:hidden">
                  <button type="button" onClick={() => setSourceFilter(null)}
                          className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                            !sourceFilter ? 'border-gym-gold bg-gym-gold/15 text-gym-gold' : 'border-gym-gold/20 text-gym-gold/60 hover:border-gym-gold/40')}>
                    {tr('Toutes catégories', 'كل الأصناف')}
                  </button>
                  {sourceChips.map(([src, g]) => (
                    <button key={src} type="button" onClick={() => setSourceFilter(sourceFilter === src ? null : src)}
                            className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                              sourceFilter === src ? 'border-gym-gold bg-gym-gold/15 text-gym-gold' : 'border-gym-gold/20 text-gym-gold/60 hover:border-gym-gold/40')}>
                      {sourceLabel(src)} · {g.count}
                    </button>
                  ))}
                </div>
              )}

              <div className="p-3 md:p-4">
                {loading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-lg bg-gym-black/40 animate-pulse" />)}
                  </div>
                ) : tab === 'unpaid' ? (
                  outstanding.length === 0 ? (
                    <p className="text-sm text-gym-gold/40 py-10 text-center">{tr('Tous les athlètes sont à jour.', 'كل الرياضيين سددوا ما عليهم.')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {outstanding.map((o) => (
                        <div key={o.subscription_id} className="flex items-center gap-3 p-3 rounded-lg border border-gym-gold/15 hover:border-violet-400/40 transition-colors">
                          <div className="w-9 h-9 rounded-full bg-gym-gold/15 flex items-center justify-center overflow-hidden shrink-0">
                            {o.photo_url ? <img src={o.photo_url} alt="" className="w-full h-full object-cover" /> : <Users className="w-4 h-4 text-gym-gold/50" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate text-gym-gold-light">{o.full_name}</p>
                            <p className="text-xs text-gym-gold/40 truncate">{o.subscription_name} · {o.phone || tr('pas de téléphone', 'بدون هاتف')}</p>
                          </div>
                          <div className="text-end shrink-0">
                            <p className="text-xs text-gym-gold/40">{formatDZD(o.amount_paid)} / {formatDZD(o.price)}</p>
                            <p className="text-sm font-semibold text-violet-300">{formatDZD(o.remaining)} {tr('dû', 'مستحق')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : filtered.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-sm text-gym-gold/40">{tr('Aucune opération ne correspond aux filtres.', 'لا توجد عمليات تطابق الفلاتر.')}</p>
                    {(query || sourceFilter || tab !== 'all') && (
                      <Button size="sm" variant="outline" onClick={resetFilters} className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                        {tr('Réinitialiser les filtres', 'إعادة ضبط الفلاتر')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {byDate.map(([date, rows]) => (
                      <div key={date}>
                        {byDate.length > 1 && (
                          <div className="flex items-center justify-between px-2 pb-1 text-xs text-gym-gold/50">
                            <span className="font-semibold">{date}</span>
                            <span className="tabular-nums">
                              <span className="text-green-400/80">+{formatDZD(sum(rows.filter((r) => r.dir === 'in')))}</span>
                              {' · '}
                              <span className="text-red-400/80">−{formatDZD(sum(rows.filter((r) => r.dir === 'out')))}</span>
                            </span>
                          </div>
                        )}
                        <div className="space-y-0.5">
                          {rows.map((m) => (
                            <MovementRow key={`${m.source}-${m.ref_id}`} m={m}
                                         onDelete={MANUAL_SOURCES.includes(m.source) && can('caisse', 'delete') ? () => removeTx(m.ref_id) : undefined} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {tab !== 'unpaid' && !loading && filtered.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-gym-gold/15 px-4 py-3 text-sm bg-gym-black/30 rounded-b-lg">
                  <span className="text-gym-gold/50">{filtered.length} {tr('opération(s)', 'عملية')}</span>
                  <span>{tr('Entrées', 'المداخيل')} <b className="text-green-400 tabular-nums">+{formatDZD(filteredIn)}</b></span>
                  <span>{tr('Sorties', 'المخارج')} <b className="text-red-400 tabular-nums">−{formatDZD(filteredOut)}</b></span>
                  <span>{tr('Solde', 'الرصيد')} <b className={cn('tabular-nums', filteredIn - filteredOut >= 0 ? 'text-gym-gold' : 'text-red-400')}>{formatDZD(filteredIn - filteredOut)}</b></span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-gym-gold/30 text-center print:hidden">
          {tr('Astuce : appuyez sur', 'نصيحة: اضغط')} <Kbd>?</Kbd> {tr('pour voir les raccourcis clavier.', 'لعرض اختصارات لوحة المفاتيح.')}
        </p>
      </div>

      <CaisseHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      <DetailsDialog state={detail} onClose={() => setDetail(null)} />

      {/* Shortcuts */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
          <DialogHeader>
            <DialogTitle className="gradient-text flex items-center gap-2"><Keyboard className="w-5 h-5 text-gym-gold" />{tr('Raccourcis clavier', 'اختصارات لوحة المفاتيح')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-1.5 text-sm">
            {([
              ['N / D', tr('Nouveau dépôt', 'إيداع جديد')],
              ['W', tr('Nouveau retrait', 'سحب جديد')],
              ['1 – 6', tr('Période : aujourd’hui, hier, 7j, 30j, mois, tout', 'الفترة: اليوم، أمس، 7، 30، الشهر، الكل')],
              ['A / I / O / U', tr('Toutes / entrées / sorties / impayés', 'الكل / المداخيل / المخارج / غير المدفوع')],
              ['/ ou F', tr('Rechercher', 'بحث')],
              ['R', tr('Actualiser', 'تحديث')],
              ['E', tr('Exporter en CSV', 'تصدير CSV')],
              ['P', tr('Imprimer', 'طباعة')],
              ['H', tr('Historique de la caisse', 'سجل الصندوق')],
              ['Esc', tr('Fermer / vider la recherche', 'إغلاق / مسح البحث')],
            ] as [string, string][]).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-gym-black/40">
                <span className="text-gym-gold/80">{l}</span><Kbd>{k}</Kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* New transaction */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
          <DialogHeader>
            <DialogTitle className="gradient-text">{tr('Nouvelle opération', 'عملية جديدة')}</DialogTitle>
            <DialogDescription className="text-gym-gold/60">
              {tr('Enregistrez l’argent déposé ou retiré de la caisse.', 'سجّل الأموال المودعة أو المسحوبة من الصندوق.')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitTx} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-gym-black/60 p-1">
              {([
                ['deposit', tr('Dépôt', 'إيداع'), <ArrowDownCircle key="d" className="w-4 h-4" />, 'bg-green-600 text-white'],
                ['withdraw', tr('Retrait', 'سحب'), <ArrowUpCircle key="w" className="w-4 h-4" />, 'bg-red-600 text-white'],
              ] as [CashDirection, string, React.ReactNode, string][]).map(([key, label, icon, active]) => (
                <button key={key} type="button" onClick={() => setDirection(key)}
                        className={cn('flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors',
                          direction === key ? active : 'text-gym-gold/60 hover:bg-gym-gold/10')}>
                  {icon}{label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>{tr('Montant (DA)', 'المبلغ (دج)')} *</Label>
              <Input type="number" min="0" step="0.01" value={amount} autoFocus
                     onChange={(e) => setAmount(e.target.value)} className="gym-input text-lg font-semibold" placeholder="1000" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK_AMOUNTS.map((v) => (
                  <button key={v} type="button" onClick={() => setAmount(String(v))}
                          className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                            Number(amount) === v ? 'border-gym-gold bg-gym-gold/20 text-gym-gold' : 'border-gym-gold/25 text-gym-gold/70 hover:border-gym-gold/50')}>
                    {formatDZD(v)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{tr('Date', 'التاريخ')} *</Label>
              <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="gym-input" />
            </div>

            <div className="space-y-1.5">
              <Label>{tr('Description', 'الوصف')}</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                        className="gym-input min-h-[70px]" placeholder={tr('C’était pour quoi ?', 'لأي غرض؟')} />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                {tr('Annuler', 'إلغاء')}
              </Button>
              <Button type="submit" disabled={saving}
                      className={direction === 'deposit' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}>
                <Plus className="w-4 h-4 me-1.5" />
                {saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
