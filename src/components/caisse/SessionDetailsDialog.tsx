import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { tr } from '@/lib/i18n';
import { StreamEntry } from '@/lib/api/caisse';
import {
  CaisseSession, PeriodDetails, getPeriodDetails, summarizeProducts,
} from '@/lib/api/caisseSessions';

export const sourceLabel = (s: string): string => ({
  subscription: tr('Abonnements', 'الاشتراكات'),
  free_session: tr('Séances libres', 'حصص حرة'),
  extra_fee: tr('Frais supplémentaires / inscription', 'رسوم إضافية / تسجيل'),
  debt_payment: tr('Paiements de dettes', 'تسديد ديون'),
  sale: tr('Ventes de produits', 'بيع المنتجات'),
  cash_deposit: tr('Dépôts en caisse', 'إيداعات'),
  expense: tr('Dépenses de la salle', 'مصاريف القاعة'),
  worker_payment: tr('Salaires des employés', 'رواتب العمال'),
  worker_acompte: tr('Acomptes des employés', 'تسبيقات العمال'),
  purchase: tr('Achats fournisseurs', 'مشتريات الموردين'),
  cash_withdraw: tr('Retraits de caisse', 'سحوبات'),
} as Record<string, string>)[s] ?? s;

const Section: React.FC<{ title: string; total: number; tone: 'in' | 'out'; children: React.ReactNode }> = ({ title, total, tone, children }) => (
  <div className="rounded-lg border border-gym-gold/15 overflow-hidden">
    <div className="flex items-center justify-between px-3 py-2 bg-gym-black/40">
      <p className="text-sm font-semibold">{title}</p>
      <p className={cn('text-sm font-bold', tone === 'in' ? 'text-green-400' : 'text-red-400')}>
        {tone === 'in' ? '+' : '−'}{formatDZD(total)}
      </p>
    </div>
    <div className="divide-y divide-gym-gold/10">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; detail?: string; date?: string; amount: number; tone: 'in' | 'out' }> = ({ label, detail, date, amount, tone }) => (
  <div className="flex items-center gap-3 px-3 py-2">
    <div className="flex-1 min-w-0">
      <p className="text-sm truncate">{label}</p>
      {detail && <p className="text-xs text-gym-gold/40 truncate">{detail}</p>}
    </div>
    {date && <span className="text-xs text-gym-gold/40 shrink-0">{date}</span>}
    <span className={cn('text-sm shrink-0', tone === 'in' ? 'text-green-400' : 'text-red-400')}>{formatDZD(amount)}</span>
  </div>
);

const groupBySource = (rows: StreamEntry[]) => {
  const map = new Map<string, StreamEntry[]>();
  for (const r of rows) map.set(r.source, [...(map.get(r.source) ?? []), r]);
  return [...map.entries()];
};

/** Everything that entered / left the caisse over a period, grouped by kind. */
export const PeriodDetailsBody: React.FC<{ details: PeriodDetails; showDates?: boolean }> = ({ details, showDates }) => {
  const products = useMemo(() => summarizeProducts(details.products), [details.products]);
  const sum = (rows: StreamEntry[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div className="space-y-4">
      {products.length > 0 && (
        <Section title={tr('Produits vendus', 'المنتجات المباعة')} tone="in"
                 total={products.reduce((s, p) => s + p.total, 0)}>
          {products.map((p) => (
            <Row key={p.name} label={p.name} detail={`${tr('Quantité', 'الكمية')} : ${p.quantity}`} amount={p.total} tone="in" />
          ))}
        </Section>
      )}

      <p className="text-xs uppercase tracking-wider text-green-400/70">{tr('Entrées', 'المداخيل')}</p>
      {details.revenue.length === 0 && <p className="text-sm text-gym-gold/40">{tr('Aucune entrée.', 'لا توجد مداخيل.')}</p>}
      {groupBySource(details.revenue).map(([src, rows]) => (
        <Section key={src} title={`${sourceLabel(src)} (${rows.length})`} total={sum(rows)} tone="in">
          {rows.map((r) => <Row key={r.ref_id} label={r.label} detail={r.detail} date={showDates ? r.entry_date : undefined} amount={Number(r.amount)} tone="in" />)}
        </Section>
      ))}

      <p className="text-xs uppercase tracking-wider text-red-400/70">{tr('Sorties', 'المخارج')}</p>
      {details.expenses.length === 0 && <p className="text-sm text-gym-gold/40">{tr('Aucune sortie.', 'لا توجد مخارج.')}</p>}
      {groupBySource(details.expenses).map(([src, rows]) => (
        <Section key={src} title={`${sourceLabel(src)} (${rows.length})`} total={sum(rows)} tone="out">
          {rows.map((r) => <Row key={r.ref_id} label={r.label} detail={r.detail} date={showDates ? r.entry_date : undefined} amount={Number(r.amount)} tone="out" />)}
        </Section>
      ))}
    </div>
  );
};

const Box: React.FC<{ label: string; value: string; className?: string }> = ({ label, value, className }) => (
  <div className={cn('rounded-lg border border-gym-gold/20 p-3', className)}>
    <p className="text-xs text-gym-gold/50">{label}</p>
    <p className="font-bold">{value}</p>
  </div>
);

export const SessionDetailsDialog: React.FC<{
  session: CaisseSession | null;
  onOpenChange: (o: boolean) => void;
}> = ({ session, onOpenChange }) => {
  const [details, setDetails] = useState<PeriodDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setDetails(null); setError(null);
    const d = session.session_date;
    getPeriodDetails({ from: d, to: d }).then(setDetails).catch((e) => setError(describeError(e)));
  }, [session]);

  const expected = session && details ? Number(session.opening_amount) + details.totalIn - details.totalOut : null;
  const closing = session?.closing_amount;
  const diff = expected !== null && closing !== null && closing !== undefined ? Number(closing) - expected : null;
  const time = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <Dialog open={!!session} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-2xl max-h-[90vh] overflow-y-auto z-[110] print:max-h-none">
        <DialogHeader>
          <DialogTitle className="gradient-text flex items-center justify-between gap-2">
            {tr('Détails de la caisse', 'تفاصيل الصندوق')} — {session?.session_date}
            <Button size="icon" variant="ghost" onClick={() => window.print()} className="h-8 w-8 me-6 print:hidden"
                    aria-label={tr('Imprimer', 'طباعة')}>
              <Printer className="w-4 h-4" />
            </Button>
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60 flex flex-wrap gap-2 items-center">
            {tr('Ouverte à', 'فُتح على')} {time(session?.opened_at)} · {tr('Fermée à', 'أُغلق على')} {time(session?.closed_at)}
            <Badge variant="outline" className={session?.closed_at ? 'border-red-500/40 text-red-400' : 'border-green-500/40 text-green-400'}>
              {session?.closed_at ? tr('Fermée', 'مغلق') : tr('Ouverte', 'مفتوح')}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-red-400 text-sm">{error}</p> : !details || !session ? (
          <p className="py-10 text-center text-gym-gold/40">{tr('Chargement…', 'جارٍ التحميل…')}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Box label={tr('Montant d’ouverture', 'مبلغ الافتتاح')} value={formatDZD(session.opening_amount)} />
              <Box label={tr('Total entrées', 'مجموع المداخيل')} value={`+${formatDZD(details.totalIn)}`} className="text-green-400" />
              <Box label={tr('Total sorties', 'مجموع المخارج')} value={`−${formatDZD(details.totalOut)}`} className="text-red-400" />
              <Box label={tr('Montant théorique', 'المبلغ النظري')} value={formatDZD(expected ?? 0)} className="border-gym-gold/50" />
              <Box label={tr('Montant de fermeture', 'مبلغ الإغلاق')} value={closing === null ? '—' : formatDZD(closing)} />
              <Box label={tr('Écart', 'الفارق')}
                   value={diff === null ? '—' : `${diff > 0 ? '+' : ''}${formatDZD(diff)}`}
                   className={diff === null ? '' : diff === 0 ? 'text-green-400' : diff > 0 ? 'text-blue-400' : 'text-red-400'} />
            </div>
            <p className="text-xs text-gym-gold/40">
              {tr('Théorique = ouverture + entrées − sorties.', 'النظري = الافتتاح + المداخيل − المخارج.')}
            </p>
            {session.notes && <p className="text-sm text-gym-gold/70 border-s-2 border-gym-gold/30 ps-3">{session.notes}</p>}
            <PeriodDetailsBody details={details} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
