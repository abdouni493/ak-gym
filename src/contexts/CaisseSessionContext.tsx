import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  CaisseSession, CLOSING_REMINDER_HOUR, getSession, localToday,
} from '@/lib/api/caisseSessions';
import { OpenCaisseDialog, CloseCaisseDialog } from '@/components/caisse/CaisseSessionDialogs';
import { SessionDetailsDialog } from '@/components/caisse/SessionDetailsDialog';
import { toast } from '@/hooks/use-toast';
import { tr } from '@/lib/i18n';

interface CaisseSessionValue {
  /** Today's session, or null when the caisse has not been opened today. */
  session: CaisseSession | null;
  loading: boolean;
  /** True when the table is missing / unreadable — the lock is skipped then. */
  unavailable: boolean;
  isOpen: boolean;
  refresh: () => Promise<void>;
  requestOpen: () => void;
  requestClose: () => void;
  showDetails: (s: CaisseSession) => void;
}

const Ctx = createContext<CaisseSessionValue | null>(null);

const REMINDER_EVERY_MS = 30 * 60 * 1000;

export const CaisseSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [session, setSession] = useState<CaisseSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [details, setDetails] = useState<CaisseSession | null>(null);
  const lastReminder = useRef(0);
  const [day, setDay] = useState(localToday());

  const refresh = useCallback(async () => {
    if (!user) { setSession(null); setLoading(false); return; }
    try {
      setSession(await getSession(localToday()));
      setUnavailable(false);
    } catch {
      // Migration not run yet: don't lock people out of the app.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh, day]);

  // Day rollover + nightly closing reminder.
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      const d = localToday();
      if (d !== day) setDay(d);
      const now = Date.now();
      if (session && !session.closed_at && new Date().getHours() >= CLOSING_REMINDER_HOUR
          && now - lastReminder.current > REMINDER_EVERY_MS) {
        lastReminder.current = now;
        toast({
          title: tr('🔔 Pensez à fermer la caisse', '🔔 تذكير بإغلاق الصندوق'),
          description: tr('La journée se termine : comptez l’argent et fermez la caisse.', 'انتهى اليوم: احسب المال وأغلق الصندوق.'),
          variant: 'destructive',
        });
      }
    };
    tick();
    const id = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(id);
  }, [user, session, day]);

  const value: CaisseSessionValue = {
    session, loading, unavailable,
    isOpen: !!session && !session.closed_at,
    refresh,
    requestOpen: () => setOpenDlg(true),
    requestClose: () => setCloseDlg(true),
    showDetails: (s) => setDetails(s),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {user && (
        <>
          <OpenCaisseDialog open={openDlg} onOpenChange={setOpenDlg} session={session}
                            onDone={async () => { setOpenDlg(false); await refresh(); }} />
          {session && (
            <CloseCaisseDialog open={closeDlg} onOpenChange={setCloseDlg} session={session}
                               onDone={async (closed, viewNow) => {
                                 setCloseDlg(false);
                                 await refresh();
                                 if (viewNow) setDetails(closed);
                               }} />
          )}
          <SessionDetailsDialog session={details} onOpenChange={(o) => { if (!o) setDetails(null); }} />
        </>
      )}
    </Ctx.Provider>
  );
};

export const useCaisseSession = (): CaisseSessionValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCaisseSession must be used inside CaisseSessionProvider');
  return v;
};
