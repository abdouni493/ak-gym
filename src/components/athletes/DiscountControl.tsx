import React from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { BadgePercent } from 'lucide-react';
import { formatDZD, cn } from '@/lib/utils';
import { makeTr } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';

export type DiscountMode = 'amount' | 'percent' | 'manual';
export interface DiscountState { enabled: boolean; mode: DiscountMode; value: string }
export const NO_DISCOUNT: DiscountState = { enabled: false, mode: 'amount', value: '' };

/** Final subscription price after the discount, plus a label saved with the subscription. */
export function applyDiscount(price: number, d: DiscountState): { final: number; discount: number; label: string | null } {
  const v = Math.max(0, Number(d.value) || 0);
  if (!d.enabled || d.value === '') return { final: price, discount: 0, label: null };
  let final = price;
  if (d.mode === 'amount') final = price - v;
  else if (d.mode === 'percent') final = price - (price * Math.min(v, 100)) / 100;
  else final = v;
  final = Math.round(Math.max(0, final) * 100) / 100;
  const discount = Math.round((price - final) * 100) / 100;
  if (discount === 0) return { final, discount, label: null };
  const what = d.mode === 'percent' ? `${Math.min(v, 100)}%`
    : d.mode === 'amount' ? formatDZD(v) : 'total manuel';
  return { final, discount, label: `Remise ${what} (${formatDZD(price)} → ${formatDZD(final)})` };
}

/** Name stored on the athlete subscription so the discount shows in the details screen. */
export function nameWithDiscount(name: string, label: string | null) {
  return label ? `${name} · ${label}` : name;
}

interface Props { price: number; value: DiscountState; onChange: (d: DiscountState) => void; className?: string }

export function DiscountControl({ price, value, onChange, className }: Props) {
  const { language } = useAuth();
  const tr = makeTr(language);
  const { final, discount } = applyDiscount(price, value);
  const modes: { k: DiscountMode; l: string }[] = [
    { k: 'amount', l: tr('Montant', 'مبلغ') },
    { k: 'percent', l: '%' },
    { k: 'manual', l: tr('Total manuel', 'مجموع يدوي') },
  ];
  return (
    <div className={cn('rounded-xl bg-black/60 border border-zinc-800 px-4 py-3 space-y-3', className)}>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="flex items-center gap-2 text-sm font-semibold text-yellow-400">
          <BadgePercent className="w-4 h-4" />{tr('Remise', 'تخفيض')}
        </span>
        <Switch checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })}
                className="data-[state=checked]:bg-yellow-400 data-[state=unchecked]:bg-zinc-700" />
      </label>
      {value.enabled && (
        <div className="space-y-2 animate-fade-in">
          <div className="grid grid-cols-3 gap-2">
            {modes.map((m) => (
              <button key={m.k} type="button" onClick={() => onChange({ ...value, mode: m.k, value: '' })}
                      className={cn('rounded-lg border px-2 py-1.5 text-xs font-semibold',
                        value.mode === m.k ? 'bg-yellow-400 text-black border-yellow-400' : 'border-zinc-700 text-zinc-300')}>
                {m.l}
              </button>
            ))}
          </div>
          <Input type="number" min="0" step="0.01" max={value.mode === 'percent' ? 100 : undefined}
                 value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })}
                 placeholder={value.mode === 'percent' ? '10' : value.mode === 'manual' ? String(price) : '500'}
                 className="bg-black border-zinc-700 text-yellow-300 font-semibold" />
          <div className="flex justify-between text-xs text-zinc-400">
            <span>{tr('Remise', 'تخفيض')}: <b className="text-emerald-400">-{formatDZD(discount)}</b></span>
            <span>{tr('Nouveau prix', 'السعر الجديد')}: <b className="text-yellow-400">{formatDZD(final)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}
