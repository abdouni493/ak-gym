import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarCheck, CreditCard, Receipt } from 'lucide-react';
import { formatDZD, cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation, makeTr } from '@/lib/i18n';
import type { AthleteSubscription, Subscription } from '@/lib/api/athletes';
import type { AthleteSubscriptionPatch } from '@/lib/api/athleteExtras';
import { DiscountControl, DiscountState, NO_DISCOUNT, applyDiscount, nameWithDiscount } from './DiscountControl';
import { FIELD, LABEL, MENU, Section } from './formStyles';

/** The existing plan is no longer in the catalog: keep it as a "custom" entry. */
export const CUSTOM = '__custom__';

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Saved names carry the discount details (" · Remise …"): keep only the plan name. */
export const stripDiscount = (name: string) => name.split(' · Remise')[0].trim();

export interface SubEditState {
  typeId: string;
  paymentDate: string;
  expiry: string;
  discount: DiscountState;
  amountPaid: string;
  customName: string;
  customPrice: number;
}

/** Pre-fill the editor from an existing athlete subscription. */
export function initSubEdit(sub: AthleteSubscription, types: Subscription[]): SubEditState {
  const type = sub.subscription_id ? types.find((x) => x.id === sub.subscription_id) : undefined;
  const base = type ? Number(type.price) || 0 : Number(sub.price) || 0;
  const saved = Number(sub.price) || 0;
  return {
    typeId: type ? type.id : CUSTOM,
    paymentDate: sub.payment_date,
    expiry: sub.expiry_date ?? '',
    // A saved price different from the plan price means a discount: show it as a manual total.
    discount: saved !== base ? { enabled: true, mode: 'manual', value: String(saved) } : NO_DISCOUNT,
    amountPaid: String(Number(sub.amount_paid) || 0),
    customName: stripDiscount(sub.name),
    customPrice: base,
  };
}

export function computeSubEdit(state: SubEditState, types: Subscription[], sub: AthleteSubscription) {
  const selected = types.find((x) => x.id === state.typeId) ?? null;
  const planName = selected ? selected.name : (state.customName.trim() || stripDiscount(sub.name));
  const basePrice = selected ? Number(selected.price) || 0 : state.customPrice;
  const disc = applyDiscount(basePrice, state.discount);
  const paid = Math.max(0, Number(state.amountPaid) || 0);
  const patch: AthleteSubscriptionPatch = {
    name: nameWithDiscount(planName, disc.label),
    price: disc.final,
    payment_date: state.paymentDate || sub.payment_date,
    expiry_date: state.expiry || null,
    amount_paid: paid,
    subscription_id: selected ? selected.id : sub.subscription_id,
  };
  const changed = patch.name !== sub.name
    || patch.price !== Number(sub.price)
    || patch.payment_date !== sub.payment_date
    || patch.expiry_date !== (sub.expiry_date ?? null)
    || patch.amount_paid !== Number(sub.amount_paid)
    || patch.subscription_id !== sub.subscription_id;
  return { selected, planName, basePrice, disc, paid, remaining: Math.max(0, disc.final - paid), patch, changed };
}

interface Props {
  subscription: AthleteSubscription;
  types: Subscription[];
  value: SubEditState;
  onChange: (v: SubEditState) => void;
  title?: string;
  hint?: string;
}

/** Edit an existing subscription with the same options and design as on athlete creation. */
export const SubscriptionEditor: React.FC<Props> = ({ subscription, types, value, onChange, title, hint }) => {
  const { language } = useAuth();
  const { t } = useTranslation(language);
  const tr = makeTr(language);
  const set = (patch: Partial<SubEditState>) => onChange({ ...value, ...patch });
  const { selected, planName, basePrice, disc, paid, remaining } = computeSubEdit(value, types, subscription);
  const isCustom = !selected;
  const inCatalog = types.some((x) => x.id === subscription.subscription_id);
  const dayInitial = t('athX.days').charAt(0);

  // Changing the plan or the payment date recomputes the expiry (still editable by hand).
  const onType = (id: string) => {
    const type = types.find((x) => x.id === id);
    set({
      typeId: id,
      discount: NO_DISCOUNT,
      ...(type ? { expiry: type.duration > 0 ? addDays(value.paymentDate || subscription.payment_date, type.duration) : '' } : {}),
    });
  };
  const onDate = (date: string) => {
    set({
      paymentDate: date,
      ...(selected && date ? { expiry: selected.duration > 0 ? addDays(date, selected.duration) : '' } : {}),
    });
  };

  return (
    <>
      <Section icon={<CalendarCheck className="w-4 h-4" />}
               title={title ?? t('athX.subSection')}
               hint={hint ?? tr('Choisissez un autre abonnement, la date, la remise et le paiement.',
                 'اختر اشتراكًا آخر والتاريخ والتخفيض والدفع.')}>
        <Select value={value.typeId} onValueChange={onType}>
          <SelectTrigger className={FIELD}><SelectValue placeholder={t('athX.selectSubscription')} /></SelectTrigger>
          <SelectContent className={MENU}>
            {!inCatalog && (
              <SelectItem value={CUSTOM}>{stripDiscount(subscription.name)} — {tr('actuel', 'الحالي')}</SelectItem>
            )}
            {types.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} — {formatDZD(s.price)}{s.duration > 0 ? ` · ${s.duration}${dayInitial}` : ` · ${t('athX.open')}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isCustom && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
            <div className="space-y-1.5">
              <Label className={LABEL}>{tr('Nom de l’abonnement', 'اسم الاشتراك')}</Label>
              <Input value={value.customName} onChange={(e) => set({ customName: e.target.value })} className={FIELD} />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL}>{tr('Prix', 'السعر')}</Label>
              <Input type="number" min="0" step="0.01" value={value.customPrice}
                     onChange={(e) => set({ customPrice: Math.max(0, Number(e.target.value) || 0) })} className={FIELD} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className={LABEL}>{t('athX.paymentDate')}</Label>
            <Input type="date" value={value.paymentDate} onChange={(e) => onDate(e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1.5">
            <Label className={LABEL}>{tr('Date d’expiration', 'تاريخ الانتهاء')}</Label>
            <Input type="date" value={value.expiry} onChange={(e) => set({ expiry: e.target.value })} className={FIELD} />
          </div>
        </div>
        <DiscountControl price={basePrice} value={value.discount} onChange={(discount) => set({ discount })} />
      </Section>

      {/* Payment summary, same as on creation */}
      <div className="rounded-2xl border border-yellow-400/40 bg-gradient-to-br from-yellow-400/15 via-yellow-400/5 to-transparent p-4 space-y-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yellow-400">
          <Receipt className="w-4 h-4" />{tr('Récapitulatif', 'الملخص')}
        </p>
        <div className="flex justify-between text-sm text-zinc-300">
          <span>{planName}</span><span>{formatDZD(basePrice)}</span>
        </div>
        {disc.discount > 0 && (
          <div className="flex justify-between text-sm text-emerald-400">
            <span>{tr('Remise', 'تخفيض')}</span><span>-{formatDZD(disc.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-yellow-400/20 pt-2 text-base font-extrabold text-zinc-100">
          <span>{tr('Total', 'المجموع')}</span><span className="text-yellow-400">{formatDZD(disc.final)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <Label className="text-zinc-400 flex items-center gap-2">
            {t('athX.amountPaid')}
            {paid !== disc.final && (
              <button type="button" onClick={() => set({ amountPaid: String(disc.final) })}
                      className="rounded-md border border-yellow-400/40 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400 hover:bg-yellow-400/10">
                {tr('Tout payer', 'دفع الكل')}
              </button>
            )}
          </Label>
          <Input type="number" min="0" step="0.01" value={value.amountPaid}
                 onChange={(e) => set({ amountPaid: e.target.value })}
                 className={cn(FIELD, 'max-w-[180px] text-end text-yellow-300 font-semibold')} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="flex items-center gap-1.5 text-zinc-400"><CreditCard className="w-4 h-4" />{t('athX.remainingAfter')}</span>
          <span className={cn('font-bold', remaining > 0 ? 'text-red-400' : 'text-zinc-300')}>{formatDZD(remaining)}</span>
        </div>
      </div>
    </>
  );
};
