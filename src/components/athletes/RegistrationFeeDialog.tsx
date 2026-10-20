import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BadgeDollarSign } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeError } from '@/lib/supabase';
import { useLang } from '@/hooks/useLang';
import { getRegistrationFee, saveRegistrationFee } from '@/lib/api/misc';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Sets the registration fee (frais d'inscription) charged when an athlete is created. */
export const RegistrationFeeDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const { tr } = useLang();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    getRegistrationFee().then((v) => setAmount(String(v)));
  }, [isOpen]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveRegistrationFee(Number(amount) || 0);
      toast({ title: tr("Frais d'inscription enregistrés", 'تم حفظ رسوم التسجيل') });
      onClose();
    } catch (err) {
      toast({
        title: tr('Enregistré sur cet appareil uniquement', 'تم الحفظ على هذا الجهاز فقط'),
        description: describeError(err),
        variant: 'destructive',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0d0d0d] border-yellow-400/30 text-zinc-100 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-yellow-400">
            <BadgeDollarSign className="w-5 h-5" />{tr("Frais d'inscription", 'رسوم التسجيل')}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {tr('Montant ajouté automatiquement à la création de chaque nouvel athlète.',
              'مبلغ يضاف تلقائيا عند إنشاء كل رياضي جديد.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">{tr('Montant (DA)', 'المبلغ (دج)')}</Label>
            <Input type="number" min="0" step="0.01" value={amount} autoFocus
                   onChange={(e) => setAmount(e.target.value)}
                   className="bg-black border-zinc-700 text-yellow-300 text-lg font-semibold focus-visible:ring-yellow-400" />
            <p className="text-[11px] text-zinc-500">{tr('Mettez 0 pour désactiver.', 'ضع 0 للتعطيل.')}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-zinc-400 hover:bg-zinc-800">
              {tr('Annuler', 'إلغاء')}
            </Button>
            <Button type="submit" disabled={saving} className="bg-yellow-400 text-black font-semibold hover:bg-yellow-300">
              {tr('Enregistrer', 'حفظ')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
