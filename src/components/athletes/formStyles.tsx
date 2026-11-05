import React from 'react';

/** Shared look of the athlete create / edit dialogs (black + yellow). */
export const FIELD = 'bg-black/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 h-11 rounded-lg focus-visible:ring-1 focus-visible:ring-yellow-400 focus-visible:border-yellow-400/60 transition-colors';
export const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-400';
export const MENU = 'bg-[#111] border-zinc-800 text-zinc-100';
export const DIALOG = 'bg-[#0a0a0a] border border-yellow-400/25 text-zinc-100 max-w-2xl max-h-[94vh] overflow-y-auto p-0 gap-0';
export const DIALOG_HEADER = 'sticky top-0 z-10 px-5 sm:px-6 py-4 bg-[#0a0a0a]/95 backdrop-blur border-b border-zinc-800 text-start';
export const DIALOG_FOOTER = 'sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 py-4 bg-[#0a0a0a]/95 backdrop-blur border-t border-zinc-800 gap-2';
export const HEADER_ICON = 'w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-300 to-yellow-500 text-black flex items-center justify-center shadow-lg shadow-yellow-500/20';
export const PRIMARY_BTN = 'bg-yellow-400 text-black font-bold hover:bg-yellow-300 shadow-lg shadow-yellow-400/20 px-6';
export const GHOST_BTN = 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800';

/** A titled card grouping related fields. Defined at module level so inputs keep focus across renders. */
export const Section: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> =
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
