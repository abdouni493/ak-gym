import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeError } from '@/lib/supabase';
import { useLang } from '@/hooks/useLang';
import { listSubscriptionTypes } from '@/lib/api/athletes';
import type { AthleteSubscription, Subscription } from '@/lib/api/athletes';
import { updateAthleteSubscription } from '@/lib/api/athleteExtras';
import { SubscriptionEditor, SubEditState, initSubEdit, computeSubEdit } from './SubscriptionEditor';
import { DIALOG, DIALOG_HEADER, DIALOG_FOOTER, HEADER_ICON, PRIMARY_BTN, GHOST_BTN } from './formStyles';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subscription: AthleteSubscription | null;
  onSaved: () => void;
}

/** Edit one athlete subscription with the same options and design as on athlete creation. */
export const EditSubscriptionDialog: React.FC<Props> = ({ isOpen, onClose, subscription, onSaved }) => {
  const { tr } = useLang();
  const [types, setTypes] = useState<Subscription[]>([]);
  const [state, setState] = useState<SubEditState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !subscription) return;
    let active = true;
    setState(null);
    listSubscriptionTypes()
      .catch((e) => {
        toast({ title: tr('Chargement impossible', 'تعذر التحميل'), description: describeError(e), variant: 'destructive' });
        return [] as Subscription[];
      })
      .then((ty) => {
        if (!active) return;
        setTypes(ty);
        setState(initSubEdit(subscription, ty));
      });
    return () => { active = false; };
  }, [isOpen, subscription]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscription || !state) return;
    const { patch, changed } = computeSubEdit(state, types, subscription);
    if (!patch.name.trim() || !patch.payment_date) {
      toast({ title: tr('Vérifiez le formulaire', 'تحقق من النموذج'), variant: 'destructive' });
      return;
    }
    if (!changed) { onClose(); return; }
    setSaving(true);
    try {
      await updateAthleteSubscription(subscription, patch);
      toast({ title: tr('Abonnement modifié', 'تم تعديل الاشتراك'), description: patch.name });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: tr('Enregistrement impossible', 'تعذر الحفظ'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={DIALOG}>
        <DialogHeader className={DIALOG_HEADER}>
          <div className="flex items-center gap-3">
            <div className={HEADER_ICON}><CalendarCheck className="w-5 h-5" /></div>
            <div>
              <DialogTitle className="text-xl font-extrabold text-yellow-400">
                {tr('Modifier l’abonnement', 'تعديل الاشتراك')}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 text-xs">{subscription?.name}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="px-5 sm:px-6 py-5 space-y-4">
          {subscription && state
            ? <SubscriptionEditor subscription={subscription} types={types} value={state} onChange={setState} />
            : <p className="py-10 text-center text-sm text-zinc-500">{tr('Chargement…', 'جارٍ التحميل…')}</p>}

          <DialogFooter className={DIALOG_FOOTER}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving} className={GHOST_BTN}>
              {tr('Annuler', 'إلغاء')}
            </Button>
            <Button type="submit" disabled={saving || !state} className={PRIMARY_BTN}>
              {saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
