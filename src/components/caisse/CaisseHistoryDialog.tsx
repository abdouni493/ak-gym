import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { describeError } from '@/lib/supabase';
import { formatDZD } from '@/lib/utils';
import { tr } from '@/lib/i18n';
import { usePermissions } from '@/contexts/AuthContext';
import { useCaisseSession } from '@/contexts/CaisseSessionContext';
import {
  CaisseSession, deleteSession, listSessions, updateSession,
} from '@/lib/api/caisseSessions';

export const CaisseHistoryDialog: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const { can } = usePermissions();
  const { showDetails, refresh } = useCaisseSession();
  const [rows, setRows] = useState<CaisseSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CaisseSession | null>(null);
  const [form, setForm] = useState({ opening: '', closing: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listSessions()); }
    catch (e) { toast({ title: tr('Chargement impossible', 'تعذر التحميل'), description: describeError(e), variant: 'destructive' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const startEdit = (s: CaisseSession) => {
    setEditing(s);
    setForm({ opening: String(s.opening_amount), closing: s.closing_amount === null ? '' : String(s.closing_amount), notes: s.notes ?? '' });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const opening = Number(form.opening);
    const closing = form.closing === '' ? null : Number(form.closing);
    if (isNaN(opening) || opening < 0 || (closing !== null && (isNaN(closing) || closing < 0))) {
      toast({ title: tr('Montant invalide', 'مبلغ غير صالح'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateSession(editing.id, { opening_amount: opening, closing_amount: closing, notes: form.notes, closed_at: editing.closed_at });
      toast({ title: tr('Caisse modifiée', 'تم تعديل الصندوق') });
      setEditing(null);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      toast({ title: tr('Modification impossible', 'تعذر التعديل'), description: describeError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: CaisseSession) => {
    if (!window.confirm(tr(`Supprimer la caisse du ${s.session_date} ?`, `حذف صندوق يوم ${s.session_date}؟`))) return;
    try {
      await deleteSession(s.id);
      toast({ title: tr('Caisse supprimée', 'تم حذف الصندوق') });
      await Promise.all([load(), refresh()]);
    } catch (err) {
      toast({ title: tr('Suppression impossible', 'تعذر الحذف'), description: describeError(err), variant: 'destructive' });
    }
  };

  const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="gradient-text">{tr('Historique des ouvertures / fermetures', 'سجل فتح وإغلاق الصندوق')}</DialogTitle>
            <DialogDescription className="text-gym-gold/60">{tr('Une ligne par journée.', 'سطر لكل يوم.')}</DialogDescription>
          </DialogHeader>
          {loading ? (
            <p className="py-10 text-center text-gym-gold/40">{tr('Chargement…', 'جارٍ التحميل…')}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-gym-gold/40">{tr('Aucun historique.', 'لا يوجد سجل.')}</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-gym-gold/15">
                  <div className="min-w-[110px]">
                    <p className="text-sm font-semibold">{s.session_date}</p>
                    <p className="text-xs text-gym-gold/40">{time(s.opened_at)} → {time(s.closed_at)}</p>
                  </div>
                  <Badge variant="outline" className={s.closed_at ? 'border-red-500/40 text-red-400' : 'border-green-500/40 text-green-400'}>
                    {s.closed_at ? tr('Fermée', 'مغلق') : tr('Ouverte', 'مفتوح')}
                  </Badge>
                  <div className="flex-1 flex flex-wrap gap-4 text-sm">
                    <span><span className="text-xs text-gym-gold/50">{tr('Ouverture', 'الافتتاح')} </span>{formatDZD(s.opening_amount)}</span>
                    <span><span className="text-xs text-gym-gold/50">{tr('Fermeture', 'الإغلاق')} </span>{s.closing_amount === null ? '—' : formatDZD(s.closing_amount)}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => showDetails(s)}
                            disabled={!s.closed_at} title={tr('Voir les détails', 'عرض التفاصيل')}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    {can('caisse', 'edit') && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(s)} title={tr('Modifier', 'تعديل')}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {can('caisse', 'delete') && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-500/10" onClick={() => remove(s)} title={tr('Supprimer', 'حذف')}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="bg-gym-gray border-gym-gold/20 text-gym-gold max-w-md">
          <DialogHeader>
            <DialogTitle className="gradient-text">{tr('Modifier la caisse', 'تعديل الصندوق')} — {editing?.session_date}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tr('Ouverture (DA)', 'الافتتاح (دج)')}</Label>
                <Input type="number" min="0" step="0.01" value={form.opening} onChange={(e) => setForm((f) => ({ ...f, opening: e.target.value }))} className="gym-input" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr('Fermeture (DA)', 'الإغلاق (دج)')}</Label>
                <Input type="number" min="0" step="0.01" value={form.closing} placeholder={tr('Vide = ouverte', 'فارغ = مفتوح')}
                       onChange={(e) => setForm((f) => ({ ...f, closing: e.target.value }))} className="gym-input" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('Remarque', 'ملاحظة')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="gym-input min-h-[60px]" />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>{tr('Annuler', 'إلغاء')}</Button>
              <Button type="submit" className="gym-button" disabled={saving}>{saving ? tr('Enregistrement…', 'جارٍ الحفظ…') : tr('Enregistrer', 'حفظ')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
