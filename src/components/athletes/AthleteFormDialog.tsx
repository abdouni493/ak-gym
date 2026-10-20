import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Trash2, CalendarCheck, Check, X, Settings2, CreditCard, UserRound, Dumbbell,
  BadgeDollarSign, Nfc, Receipt,
} from 'lucide-react';
import { PhotoPicker } from '@/components/common/PhotoPicker';
import { toast } from '@/hooks/use-toast';
import { formatDZD } from '@/lib/utils';
import { describeError } from '@/lib/supabase';
import { deleteByUrl, uploadImage } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation, makeTr } from '@/lib/i18n';
import type { AthleteSubscription } from '@/lib/api/athletes';
import { getLatestSubscription, updateAthleteSubscription, createExtraFee } from '@/lib/api/athleteExtras';
import { getRegistrationFee } from '@/lib/api/misc';
import { cn } from '@/lib/utils';
import { SubscriptionFields, SubFields, subFieldsFrom } from './EditSubscriptionDialog';
import {
  Athlete, AthleteInput, Sport, Subscription,
  createAthlete, updateAthlete, listSports, createSport, deleteSport,
  listSubscriptionTypes, assignSubscription,
} from '@/lib/api/athletes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  athlete: Athlete | null;
  onSaved: () => void;
  /** When true (create mode), the caller allows assigning a subscription inline. */
  canSubscribe?: boolean;
}

const blank = (): AthleteInput => ({
  first_name: '', last_name: '', phone: null,
  date_of_birth: null, gender: null, sport_id: null,
  rfid_uid: null, photo_url: null,
});

const today = () => new Date().toISOString().split('T')[0];
const NONE = '__none__';

export const AthleteFormDialog: React.FC<Props> = ({ isOpen, onClose, athlete, onSaved, canSubscribe }) => {
  const { language } = useAuth();
  const { t } = useTranslation(language);
  const tr = makeTr(language);
  const isEdit = athlete !== null;

  const [form, setForm] = useState<AthleteInput>(blank());
  const [sports, setSports] = useState<Sport[]>([]);
  const [newSport, setNewSport] = useState('');
  const [manageSports, setManageSports] = useState(false);
  const [sportPendingDelete, setSportPendingDelete] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline subscription (create mode only)
  const [subTypes, setSubTypes] = useState<Subscription[]>([]);
  const [subTypeId, setSubTypeId] = useState(NONE);
  const [subPaymentDate, setSubPaymentDate] = useState(today());
  const [subAmountPaid, setSubAmountPaid] = useState('');

  // Registration fee (create mode only), charged once on creation
  const [regFee, setRegFee] = useState(0);
  const [regFeePaid, setRegFeePaid] = useState(true);

  // Edit mode: latest subscription
  const [lastSub, setLastSub] = useState<AthleteSubscription | null>(null);
  const [lastFields, setLastFields] = useState<SubFields | null>(null);

  const selectedSub = useMemo(
    () => (subTypeId === NONE ? null : subTypes.find((s) => s.id === subTypeId) ?? null),
    [subTypes, subTypeId],
  );

  const set = <K extends keyof AthleteInput>(k: K, v: AthleteInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        const [s, types] = await Promise.all([
          listSports(),
          !athlete && canSubscribe ? listSubscriptionTypes() : Promise.resolve([]),
        ]);
        if (!active) return;
        setSports(s);
        setSubTypes(types);
        if (!athlete) {
          const fee = await getRegistrationFee();
          if (active) setRegFee(fee);
        }
        if (athlete && canSubscribe) {
          const last = await getLatestSubscription(athlete.id).catch(() => null);
          if (!active) return;
          setLastSub(last);
          setLastFields(last ? subFieldsFrom(last) : null);
        }
      } catch (e) {
        toast({ title: t('athX.couldNotLoad'), description: describeError(e), variant: 'destructive' });
      }
    })();

    if (athlete) {
      setForm({
        first_name: athlete.first_name, last_name: athlete.last_name,
        phone: athlete.phone, date_of_birth: athlete.date_of_birth,
        gender: athlete.gender, sport_id: athlete.sport_id,
        rfid_uid: athlete.rfid_uid, photo_url: athlete.photo_url,
      });
      setPreview(athlete.photo_url);
    } else {
      setForm(blank());
      setPreview(null);
    }
    setPhotoFile(null);
    setLastSub(null);
    setLastFields(null);
    setNewSport('');
    setManageSports(false);
    setSportPendingDelete(null);
    setSubTypeId(NONE);
    setSubPaymentDate(today());
    setSubAmountPaid('');
    setRegFee(0);
    setRegFeePaid(true);
    return () => { active = false; };
  }, [isOpen, athlete, canSubscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default the amount to the full price when a subscription type is chosen.
  useEffect(() => {
    if (selectedSub) setSubAmountPaid(String(selectedSub.price));
  }, [selectedSub]);

  // PhotoPicker hands over an already-optimised file (or null = remove photo).
  const onPhotoChange = (file: File | null, url: string | null) => {
    setPhotoFile(file);
    setPreview(url);
    if (!file) set('photo_url', null);
  };

  const addSport = async () => {
    const name = newSport.trim();
    if (!name) return;
    try {
      const s = await createSport(name);
      setSports((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
      set('sport_id', s.id);
      setNewSport('');
    } catch (e) {
      toast({ title: t('sports.cannotAdd'), description: describeError(e), variant: 'destructive' });
    }
  };

  const removeSport = async (id: string) => {
    try {
      await deleteSport(id);
      setSports((prev) => prev.filter((s) => s.id !== id));
      if (form.sport_id === id) set('sport_id', null);
      setSportPendingDelete(null);
      toast({ title: t('sports.deleted') });
    } catch (e) {
      toast({ title: t('common.error'), description: describeError(e), variant: 'destructive' });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast({ title: t('athX.nameRequired'), description: t('athX.nameRequiredDesc'), variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let photoUrl = form.photo_url ?? null;
      if (photoFile) {
        photoUrl = await uploadImage('athlete-photos', photoFile, '', { optimize: false });
      }
      const payload: AthleteInput = { ...form, photo_url: photoUrl };

      if (isEdit && athlete) {
        await updateAthlete(athlete.id, payload);
        if (lastSub && lastFields
            && JSON.stringify(lastFields) !== JSON.stringify(subFieldsFrom(lastSub))) {
          await updateAthleteSubscription(lastSub, {
            name: lastFields.name || lastSub.name,
            price: Number(lastFields.price) || 0,
            payment_date: lastFields.payment_date || lastSub.payment_date,
            expiry_date: lastFields.expiry_date || null,
            amount_paid: Number(lastFields.amount_paid) || 0,
          });
        }
        // Free the storage used by a replaced or removed photo.
        if (athlete.photo_url && athlete.photo_url !== photoUrl) {
          void deleteByUrl('athlete-photos', athlete.photo_url);
        }
        toast({ title: t('athX.updated'), description: `${form.first_name} ${form.last_name}` });
      } else {
        const created = await createAthlete(payload);
        if (regFee > 0) {
          try {
            await createExtraFee({
              athlete_id: created.id,
              name: tr("Frais d'inscription", 'رسوم التسجيل'),
              quantity: 1,
              unit_price: regFee,
              amount_paid: regFeePaid ? regFee : 0,
              fee_date: subPaymentDate || today(),
            });
          } catch (feeErr) {
            toast({ title: tr("Frais d'inscription non enregistrés", 'لم يتم تسجيل رسوم التسجيل'),
              description: describeError(feeErr), variant: 'destructive' });
          }
        }
        // Optionally assign the chosen subscription in the same flow.
        if (selectedSub) {
          try {
            await assignSubscription({
              athleteId: created.id,
              subscription: selectedSub,
              paymentDate: subPaymentDate,
              amountPaid: Number(subAmountPaid) || 0,
              creditUsed: 0,
              currentBalance: 0,
              currentTotalPaid: 0,
            });
            toast({ title: t('athX.added'), description: `${form.first_name} ${form.last_name} — ${selectedSub.name}` });
          } catch (subErr) {
            // The athlete is created; surface the subscription failure without losing them.
            toast({
              title: t('athX.added'),
              description: `${t('athX.couldNotSave')}: ${describeError(subErr)}`,
              variant: 'destructive',
            });
          }
        } else {
          toast({ title: t('athX.added'), description: `${form.first_name} ${form.last_name}` });
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: t('athX.couldNotSave'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };


  const subPrice = selectedSub ? Number(selectedSub.price) : 0;
  const subPaid = selectedSub ? Number(subAmountPaid) || 0 : 0;
  const remaining = selectedSub ? Math.max(0, subPrice - subPaid) : 0;
  const showFee = !isEdit && regFee > 0;
  const feeDue = showFee ? regFee : 0;
  const feeCollected = showFee && regFeePaid ? regFee : 0;
  const grandTotal = subPrice + feeDue;
  const collectedNow = subPaid + feeCollected;
  const totalRemaining = remaining + (feeDue - feeCollected);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0a0a0a] border border-yellow-400/25 text-zinc-100 max-w-2xl max-h-[94vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="sticky top-0 z-10 px-5 sm:px-6 py-4 bg-[#0a0a0a]/95 backdrop-blur border-b border-zinc-800 text-start">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-300 to-yellow-500 text-black flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <UserRound className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-extrabold text-yellow-400">
                {isEdit ? t('athX.editTitle') : t('athX.newTitle')}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 text-xs">
                {isEdit ? t('athX.editDesc') : t('athX.newDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="px-5 sm:px-6 py-5 space-y-4">
          {/* Identity */}
          <Section icon={<UserRound className="w-4 h-4" />} title={tr('Informations personnelles', 'المعلومات الشخصية')}>
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
                <PhotoPicker preview={preview} onChange={onPhotoChange} t={t} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={LABEL}>{t('athX.firstName')} <span className="text-yellow-400">*</span></Label>
                  <Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={FIELD} />
                </div>
                <div className="space-y-1.5">
                  <Label className={LABEL}>{t('athX.lastName')} <span className="text-yellow-400">*</span></Label>
                  <Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={FIELD} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className={LABEL}>{t('athX.phone')}</Label>
                  <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={FIELD} />
                </div>
                <div className="space-y-1.5">
                  <Label className={LABEL}>{t('athX.dob')}</Label>
                  <Input type="date" value={form.date_of_birth ?? ''}
                         onChange={(e) => set('date_of_birth', e.target.value || null)} className={FIELD} />
                </div>
                <div className="space-y-1.5">
                  <Label className={LABEL}>{t('athX.gender')}</Label>
                  <Select value={form.gender ?? undefined} onValueChange={(v) => set('gender', v)}>
                    <SelectTrigger className={FIELD}><SelectValue placeholder={t('athX.selectGender')} /></SelectTrigger>
                    <SelectContent className={MENU}>
                      <SelectItem value="male">{t('athX.male')}</SelectItem>
                      <SelectItem value="female">{t('athX.female')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Section>

          {/* Sport + management */}
          <Section icon={<Dumbbell className="w-4 h-4" />} title={t('athX.sport')}>
            <div className="flex items-center gap-2">
              <Select value={form.sport_id ?? undefined} onValueChange={(v) => set('sport_id', v)}>
                <SelectTrigger className={FIELD}><SelectValue placeholder={t('athX.selectSport')} /></SelectTrigger>
                <SelectContent className={MENU}>
                  {sports.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => setManageSports((v) => !v)}
                      className={cn('h-11 shrink-0 border-zinc-800 bg-black/60 text-zinc-400 hover:text-yellow-400 hover:bg-yellow-400/10',
                        manageSports && 'text-yellow-400 border-yellow-400/40')}
                      aria-label={t('athX.manageSports')} title={t('athX.manageSports')}>
                <Settings2 className="w-4 h-4" />
              </Button>
            </div>

            {manageSports && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex gap-2">
                  <Input value={newSport} onChange={(e) => setNewSport(e.target.value)}
                         placeholder={t('athX.newSportPlaceholder')} className={FIELD}
                         onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSport(); } }} />
                  <Button type="button" onClick={addSport} disabled={!newSport.trim()}
                          className="h-11 shrink-0 bg-yellow-400 text-black hover:bg-yellow-300">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {/* Per-row delete + inline confirm (no nested Radix dialog). */}
                <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
                  {sports.length === 0 && (
                    <p className="p-3 text-xs text-zinc-500 text-center">{t('sports.empty')}</p>
                  )}
                  {sports.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm bg-black/40">
                      <span className="truncate">{s.name}</span>
                      {sportPendingDelete === s.id ? (
                        <span className="flex items-center gap-1 text-xs">
                          <span className="text-zinc-400">{t('sports.deleteTitle')}</span>
                          <button type="button" onClick={() => removeSport(s.id)}
                                  className="p-1 rounded text-red-400 hover:bg-red-500/15" aria-label={tr('Confirmer', 'تأكيد')}>
                            <Check className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setSportPendingDelete(null)}
                                  className="p-1 rounded text-zinc-400 hover:bg-zinc-800" aria-label={tr('Annuler', 'إلغاء')}>
                            <X className="w-4 h-4" />
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setSportPendingDelete(s.id)}
                                className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                aria-label={tr('Supprimer le sport', 'حذف الرياضة')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Inline subscription assignment (create mode only) */}
          {!isEdit && canSubscribe && (
            <Section icon={<CalendarCheck className="w-4 h-4" />} title={t('athX.subSection')} hint={t('athX.subSectionDesc')}>
              <Select value={subTypeId} onValueChange={setSubTypeId}>
                <SelectTrigger className={FIELD}><SelectValue placeholder={t('athX.selectSubscription')} /></SelectTrigger>
                <SelectContent className={MENU}>
                  <SelectItem value={NONE}>{t('athX.noSubscription')}</SelectItem>
                  {subTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {formatDZD(s.price)}{s.duration > 0 ? ` · ${s.duration}${t('athX.days').charAt(0)}` : ` · ${t('athX.open')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedSub && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                  <div className="space-y-1.5">
                    <Label className={LABEL}>{t('athX.paymentDate')}</Label>
                    <Input type="date" value={subPaymentDate} onChange={(e) => setSubPaymentDate(e.target.value)} className={FIELD} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={LABEL}>{t('athX.amountPaid')}</Label>
                    <Input type="number" min="0" step="0.01" value={subAmountPaid}
                           onChange={(e) => setSubAmountPaid(e.target.value)} className={cn(FIELD, 'text-yellow-300 font-semibold')} />
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Registration fee, charged once at creation */}
          {showFee && (
            <Section icon={<BadgeDollarSign className="w-4 h-4" />} title={tr("Frais d'inscription", 'رسوم التسجيل')}
                     hint={tr('Facturés une seule fois à la création.', 'تُحتسب مرة واحدة عند الإنشاء.')}>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-black/60 border border-zinc-800 px-4 py-3">
                <div>
                  <p className="text-lg font-extrabold text-yellow-400">{formatDZD(regFee)}</p>
                  <p className={cn('text-[11px]', regFeePaid ? 'text-emerald-400' : 'text-red-400')}>
                    {regFeePaid ? tr('Payés', 'مدفوعة') : tr('Non payés — ajoutés à la dette', 'غير مدفوعة — تضاف إلى الدين')}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  {tr('Payés', 'مدفوعة')}
                  <Switch checked={regFeePaid} onCheckedChange={setRegFeePaid}
                          className="data-[state=checked]:bg-yellow-400 data-[state=unchecked]:bg-zinc-700" />
                </label>
              </div>
            </Section>
          )}

          {/* Payment summary: subscription + registration fee */}
          {!isEdit && (selectedSub || showFee) && (
            <div className="rounded-2xl border border-yellow-400/40 bg-gradient-to-br from-yellow-400/15 via-yellow-400/5 to-transparent p-4 space-y-2 animate-fade-in">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yellow-400">
                <Receipt className="w-4 h-4" />{tr('Récapitulatif', 'الملخص')}
              </p>
              {selectedSub && (
                <div className="flex justify-between text-sm text-zinc-300">
                  <span>{selectedSub.name}</span><span>{formatDZD(subPrice)}</span>
                </div>
              )}
              {showFee && (
                <div className="flex justify-between text-sm text-zinc-300">
                  <span>{tr("Frais d'inscription", 'رسوم التسجيل')}</span><span>{formatDZD(regFee)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-yellow-400/20 pt-2 text-base font-extrabold text-zinc-100">
                <span>{tr('Total', 'المجموع')}</span><span className="text-yellow-400">{formatDZD(grandTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">{tr('Encaissé maintenant', 'المحصّل الآن')}</span>
                <span className="font-semibold text-emerald-400">{formatDZD(collectedNow)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1.5 text-zinc-400"><CreditCard className="w-4 h-4" />{t('athX.remainingAfter')}</span>
                <span className={cn('font-bold', totalRemaining > 0 ? 'text-red-400' : 'text-zinc-300')}>{formatDZD(totalRemaining)}</span>
              </div>
            </div>
          )}

          {/* Edit mode: the latest subscription can be corrected here */}
          {isEdit && canSubscribe && lastSub && lastFields && (
            <Section icon={<CalendarCheck className="w-4 h-4" />} title={tr('Dernier abonnement', 'آخر اشتراك')}
                     hint={tr('Modifiez les informations du dernier abonnement créé.', 'عدّل معلومات آخر اشتراك تم إنشاؤه.')}>
              <SubscriptionFields value={lastFields} onChange={setLastFields} />
            </Section>
          )}

          {/* RFID is always the last field */}
          <Section icon={<Nfc className="w-4 h-4" />} title={t('athX.rfidCard')}
                   hint={tr('Cliquez ici puis passez la carte sur le lecteur.', 'انقر هنا ثم مرر البطاقة على القارئ.')}>
            <Input value={form.rfid_uid ?? ''} onChange={(e) => set('rfid_uid', e.target.value)}
                   className={cn(FIELD, 'font-mono tracking-widest text-yellow-300')} placeholder="A3F2C1D4" data-rfid-input="true" />
          </Section>

          <DialogFooter className="sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 py-4 bg-[#0a0a0a]/95 backdrop-blur border-t border-zinc-800 gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}
                    className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
              {t('athX.cancel')}
            </Button>
            <Button type="submit" disabled={saving}
                    className="bg-yellow-400 text-black font-bold hover:bg-yellow-300 shadow-lg shadow-yellow-400/20 px-6">
              {saving ? t('athX.saving') : isEdit ? t('athX.save') : t('athX.addAthlete')}
              {!isEdit && grandTotal > 0 && !saving && <span className="ms-2 opacity-70">· {formatDZD(collectedNow)}</span>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const FIELD = 'bg-black/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 h-11 rounded-lg focus-visible:ring-1 focus-visible:ring-yellow-400 focus-visible:border-yellow-400/60 transition-colors';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-400';
const MENU = 'bg-[#111] border-zinc-800 text-zinc-100';

/** A titled card grouping related fields. Defined at module level so inputs keep focus across renders. */
const Section: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> =
  ({ icon, title, hint, children }) => (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 sm:p-5 space-y-4">
      <header className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-yellow-400 text-black flex items-center justify-center shrink-0">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
          {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
