import React from 'react';
import { Lock, LockOpen, LogOut, Eye, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCaisseSession } from '@/contexts/CaisseSessionContext';
import { CLOSING_REMINDER_HOUR } from '@/lib/api/caisseSessions';
import { formatDZD, cn } from '@/lib/utils';
import { tr } from '@/lib/i18n';

/**
 * Full-screen lock shown on every interface while today's caisse is not open.
 * Nothing behind it can be clicked until the caisse is opened.
 */
export const CaisseGate: React.FC = () => {
  const { logout } = useAuth();
  const { session, loading, unavailable, isOpen, requestOpen, showDetails } = useCaisseSession();
  if (loading || unavailable || isOpen) return null;

  const closedToday = !!session?.closed_at;

  return (
    <div className="fixed inset-0 z-[60] bg-gym-black/95 backdrop-blur-sm flex items-center justify-center p-4"
         role="alertdialog" aria-modal="true">
      <div className="max-w-md w-full rounded-2xl border border-gym-gold/30 bg-gym-gray p-6 text-center space-y-4 animate-fade-in">
        <div className={cn('w-16 h-16 rounded-full mx-auto flex items-center justify-center',
          closedToday ? 'bg-red-500/15 text-red-400' : 'bg-gym-gold/15 text-gym-gold')}>
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold gradient-text">
          {closedToday ? tr('Caisse fermée', 'الصندوق مغلق') : tr('La caisse n’est pas ouverte', 'الصندوق غير مفتوح')}
        </h2>
        <p className="text-gym-gold/60 text-sm">
          {closedToday
            ? tr(`La caisse a été fermée aujourd’hui avec ${formatDZD(session!.closing_amount ?? 0)}. Rouvrez-la pour continuer à travailler.`,
                 `تم إغلاق الصندوق اليوم بمبلغ ${formatDZD(session!.closing_amount ?? 0)}. أعد فتحه لمواصلة العمل.`)
            : tr('Vous devez ouvrir la caisse et saisir le montant présent avant d’utiliser l’application.',
                 'يجب فتح الصندوق وإدخال المبلغ الموجود قبل استعمال التطبيق.')}
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={requestOpen} className="bg-green-600 hover:bg-green-700 text-white h-12 text-base">
            <LockOpen className="w-5 h-5 me-2" />
            {closedToday ? tr('Rouvrir la caisse', 'إعادة فتح الصندوق') : tr('Ouvrir la caisse', 'فتح الصندوق')}
          </Button>
          {closedToday && (
            <Button variant="outline" onClick={() => showDetails(session!)}
                    className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
              <Eye className="w-4 h-4 me-2" />{tr('Voir les détails de la journée', 'عرض تفاصيل اليوم')}
            </Button>
          )}
          <Button variant="ghost" onClick={logout} className="text-gym-gold/60">
            <LogOut className="w-4 h-4 me-2" />{tr('Déconnexion', 'تسجيل الخروج')}
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Floating shortcut on every interface: close the caisse (pulses at night). */
export const CaisseShortcut: React.FC = () => {
  const { isOpen, requestClose, unavailable } = useCaisseSession();
  if (!isOpen || unavailable) return null;
  const late = new Date().getHours() >= CLOSING_REMINDER_HOUR;
  return (
    <button onClick={requestClose}
            className={cn('fixed bottom-4 start-4 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg text-sm font-semibold transition-colors print:hidden',
              late ? 'bg-red-600 text-white animate-pulse hover:bg-red-700'
                   : 'bg-gym-gray border border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10')}
            title={tr('Fermer la caisse', 'إغلاق الصندوق')}>
      <Wallet className="w-4 h-4" />
      <span className="hidden sm:inline">{tr('Fermer la caisse', 'إغلاق الصندوق')}</span>
    </button>
  );
};
