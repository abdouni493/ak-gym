import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LockOpen, Lock, CheckCircle2, Eye, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeError } from '@/lib/supabase';
import { formatDZD, cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import {
  CaisseSession, closeSession, getPeriodDetails, openSession, updateSession,
} from '@/lib/api/caisseSessions';

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

export const OpenCaisseDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Today's session if it exists (closed) — then opening means re-opening it. */
  session: CaisseSession | null;
  onDone: () => void;
}> = ({ open, onOpenChange, session, onDone }) => {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const reopening = !!session;

  useEffect(() => {
    if (open) {
      setAmount(session ? String(session.opening_amount) : '');
      setNotes(session?.notes ?? '');
    }
  }, [open, session]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (amount === '' || isNaN(value) || value < 0) {
      toast({ title: tr('Saisissez le montant en caisse', 'أدخل المبلغ الموجود في الصندوق'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (session) await updateSession(session.id, { opening_amount: value, closing_amount: null, notes });
      else await openSession(value, notes);
      toast({ title: tr('Caisse ouverte', 'تم فتح الصندوق'), description: formatDZD(value) });
      onDone();
    } catch (err) {
      toast({ title: tr('Ouverture impossible', 'تعذر فتح الصندوق'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md z-[110]">
        <DialogHeader>
          <DialogTitle className="gradient-text flex items-center gap-2">
            <LockOpen className="w-5 h-5 text-green-400" />
            {reopening ? tr('Rouvrir la caisse', 'إعادة فتح الصندوق') : tr('Ouverture de la caisse', 'فتح الصندوق')}
          </DialogTitle>
          <DialogDescription className="text-gym-gold/60">
            {tr('Comptez l’argent présent dans la caisse au début de la journée.', 'احسب المال الموجود في الصندوق في بداية اليوم.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{tr('Montant en caisse (DA)', 'المبلغ في الصندوق (دج)')} *</Label>
            <Input type="number" min="0" step="0.01" autoFocus value={amount}
                   onChange={(e) => setAmount(e.target.value)} className="gym-input text-lg" placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Remarque', 'ملاحظة')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="gym-input min-h-[60px]" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {tr('Annuler', 'إلغاء')}
            </Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" disabled={saving}>
              {saving ? tr('Ouverture…', 'جارٍ الفتح…') : tr('Ouvrir la caisse', 'فتح الصندوق')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

export const CloseCaisseDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: CaisseSession;
  onDone: (closed: CaisseSession, viewDetailsNow: boolean) => void;
}> = ({ open, onOpenChange, session, onDone }) => {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [expected, setExpected] = useState<number | null>(null);
  const [closed, setClosed] = useState<CaisseSession | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(''); setNotes(session.notes ?? ''); setClosed(null); setExpected(null);
    const d = session.session_date;
    getPeriodDetails({ from: d, to: d })
      .then((p) => setExpected(Number(session.opening_amount) + p.totalIn - p.totalOut))
      .catch(() => setExpected(null));
  }, [open, session]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (amount === '' || isNaN(value) || value < 0) {
      toast({ title: tr('Saisissez le montant en caisse', 'أدخل المبلغ الموجود في الصندوق'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      setClosed(await closeSession(session.id, value, notes));
      toast({ title: tr('Caisse fermée', 'تم إغلاق الصندوق'), description: formatDZD(value) });
    } catch (err) {
      toast({ title: tr('Fermeture impossible', 'تعذر إغلاق الصندوق'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const diff = expected !== null && amount !== '' ? Number(amount) - expected : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && closed) onDone(closed, false); else onOpenChange(o); }}>
      <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md z-[110]">
        {closed ? (
          <div className="text-center space-y-4 py-2">
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto" />
            <DialogTitle className="gradient-text text-xl">{tr('Caisse fermée', 'تم إغلاق الصندوق')}</DialogTitle>
            <p className="text-gym-gold/60 text-sm">
              {tr('Voulez-vous voir les détails de la journée maintenant ?', 'هل تريد رؤية تفاصيل اليوم الآن؟')}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => onDone(closed, false)}
                      className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                <Clock className="w-4 h-4 me-2" />{tr('Voir plus tard', 'لاحقًا')}
              </Button>
              <Button onClick={() => onDone(closed, true)} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                <Eye className="w-4 h-4 me-2" />{tr('Voir les détails', 'عرض التفاصيل')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="gradient-text flex items-center gap-2">
                <Lock className="w-5 h-5 text-red-400" />{tr('Fermeture de la caisse', 'إغلاق الصندوق')}
              </DialogTitle>
              <DialogDescription className="text-gym-gold/60">
                {tr('Comptez l’argent présent dans la caisse en fin de journée.', 'احسب المال الموجود في الصندوق في نهاية اليوم.')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gym-gold/20 p-3">
                  <p className="text-xs text-gym-gold/50">{tr('Ouverture', 'الافتتاح')}</p>
                  <p className="font-bold">{formatDZD(session.opening_amount)}</p>
                </div>
                <div className="rounded-lg border border-gym-gold/20 p-3">
                  <p className="text-xs text-gym-gold/50">{tr('Théorique', 'النظري')}</p>
                  <p className="font-bold">{expected === null ? '…' : formatDZD(expected)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{tr('Montant compté en caisse (DA)', 'المبلغ المحسوب في الصندوق (دج)')} *</Label>
                <Input type="number" min="0" step="0.01" autoFocus value={amount}
                       onChange={(e) => setAmount(e.target.value)} className="gym-input text-lg" placeholder="0" />
                {diff !== null && (
                  <p className={cn('text-xs', diff === 0 ? 'text-green-400' : diff > 0 ? 'text-blue-400' : 'text-red-400')}>
                    {tr('Écart', 'الفارق')} : {diff > 0 ? '+' : ''}{formatDZD(diff)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{tr('Remarque', 'ملاحظة')}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="gym-input min-h-[60px]" />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  {tr('Annuler', 'إلغاء')}
                </Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white" disabled={saving}>
                  {saving ? tr('Fermeture…', 'جارٍ الإغلاق…') : tr('Fermer la caisse', 'إغلاق الصندوق')}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
