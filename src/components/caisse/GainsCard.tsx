import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Coins, ChevronRight, Dumbbell, ShoppingBag, TrendingDown } from 'lucide-react';
import { formatDZD, cn } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { tr } from '@/lib/i18n';
import { DateRange, RangePreset, resolveRange } from '@/lib/api/caisse';
import { PeriodDetails, getPeriodDetails, localToday } from '@/lib/api/caisseSessions';
import { PeriodDetailsBody } from '@/components/caisse/SessionDetailsDialog';

const ATHLETE_SOURCES = ['subscription', 'free_session', 'extra_fee', 'debt_payment'];

const split = (d: PeriodDetails) => {
  const sum = (src: (s: string) => boolean) => d.revenue.filter((r) => src(r.source)).reduce((s, r) => s + Number(r.amount), 0);
  return {
    athletes: sum((s) => ATHLETE_SOURCES.includes(s)),
    sales: sum((s) => s === 'sale'),
    net: d.totalIn - d.totalOut,
  };
};

/** Clickable "gains of today" card — opens the detailed view with a period picker. */
export const GainsCard: React.FC<{ className?: string }> = ({ className }) => {
  const [today, setToday] = useState<PeriodDetails | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = localToday();
    getPeriodDetails({ from: d, to: d }).then(setToday).catch(() => setToday(null));
  }, [open]);

  const s = today ? split(today) : null;

  return (
    <>
      <Card onClick={() => setOpen(true)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpen(true); }}
            className={cn('cursor-pointer bg-gradient-to-br from-gym-gold/25 via-gym-gray to-gym-black border-gym-gold/40 hover:border-gym-gold transition-colors', className)}>
        <CardContent className="p-4 md:p-5 flex flex-wrap items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gym-gold text-gym-black flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-gym-gold/60">{tr('Gains d’aujourd’hui', 'أرباح اليوم')}</p>
            <p className="text-2xl md:text-3xl font-bold text-gym-gold">{s ? formatDZD(today!.totalIn) : '…'}</p>
          </div>
          {s && (
            <div className="flex flex-wrap gap-4 text-sm">
              <div><p className="text-xs text-gym-gold/50 flex items-center gap-1"><Dumbbell className="w-3 h-3" />{tr('Abonnements & athlètes', 'الاشتراكات والرياضيون')}</p><p className="font-semibold text-green-400">{formatDZD(s.athletes)}</p></div>
              <div><p className="text-xs text-gym-gold/50 flex items-center gap-1"><ShoppingBag className="w-3 h-3" />{tr('Ventes produits', 'بيع المنتجات')}</p><p className="font-semibold text-green-400">{formatDZD(s.sales)}</p></div>
              <div><p className="text-xs text-gym-gold/50 flex items-center gap-1"><TrendingDown className="w-3 h-3" />{tr('Net (après sorties)', 'الصافي')}</p><p className={cn('font-semibold', s.net >= 0 ? 'text-gym-gold' : 'text-red-400')}>{formatDZD(s.net)}</p></div>
            </div>
          )}
          <ChevronRight className="w-5 h-5 text-gym-gold/50 shrink-0 rtl:rotate-180" />
        </CardContent>
      </Card>
      <GainsDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export const GainsDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [custom, setCustom] = useState<DateRange>({ from: localToday(), to: localToday() });
  const [details, setDetails] = useState<PeriodDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);

  const load = useCallback(async () => {
    setDetails(null); setError(null);
    try { setDetails(await getPeriodDetails(range)); } catch (e) { setError(describeError(e)); }
  }, [range]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const s = details ? split(details) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text">{tr('Détail des gains', 'تفاصيل الأرباح')}</DialogTitle>
          <DialogDescription className="text-gym-gold/60">{range.from} → {range.to}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {([
            ['today', tr('Aujourd’hui', 'اليوم')], ['week', tr('7 jours', '7 أيام')],
            ['month', tr('30 jours', '30 يومًا')], ['custom', tr('Période', 'فترة')],
          ] as [RangePreset, string][]).map(([key, label]) => (
            <Button key={key} size="sm" variant={preset === key ? 'default' : 'outline'} onClick={() => setPreset(key)}
                    className={preset === key ? 'bg-gym-gold text-gym-black hover:bg-gym-gold/90' : 'border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10'}>
              {label}
            </Button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1"><Label className="text-xs">{tr('Du', 'من')}</Label>
              <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="gym-input w-44" /></div>
            <div className="space-y-1"><Label className="text-xs">{tr('Au', 'إلى')}</Label>
              <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="gym-input w-44" /></div>
          </div>
        )}

        {error ? <p className="text-red-400 text-sm">{error}</p> : !details || !s ? (
          <p className="py-10 text-center text-gym-gold/40">{tr('Chargement…', 'جارٍ التحميل…')}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                [tr('Total gains', 'مجموع الأرباح'), details.totalIn, 'text-green-400'],
                [tr('Athlètes', 'الرياضيون'), s.athletes, 'text-green-400'],
                [tr('Produits', 'المنتجات'), s.sales, 'text-green-400'],
                [tr('Net', 'الصافي'), s.net, s.net >= 0 ? 'text-gym-gold' : 'text-red-400'],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-lg border border-gym-gold/20 p-3">
                  <p className="text-xs text-gym-gold/50">{l}</p>
                  <p className={cn('font-bold', c as string)}>{formatDZD(v as number)}</p>
                </div>
              ))}
            </div>
            <PeriodDetailsBody details={details} showDates={range.from !== range.to} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
