-- =============================================================================
-- Caisse sessions (opening / closing of the cash drawer) + product sales view
-- Run once in the Supabase SQL editor. Safe to re-run.
-- =============================================================================

create table if not exists public.caisse_sessions (
  id              uuid primary key default gen_random_uuid(),
  session_date    date not null unique default current_date,
  opening_amount  numeric(12,2) not null default 0 check (opening_amount >= 0),
  closing_amount  numeric(12,2) check (closing_amount >= 0),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  opened_by       uuid default auth.uid(),
  closed_by       uuid,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists caisse_sessions_date_idx on public.caisse_sessions(session_date);

alter table public.caisse_sessions enable row level security;
revoke all on public.caisse_sessions from anon;
grant select, insert, update, delete on public.caisse_sessions to authenticated;

drop policy if exists csess_select on public.caisse_sessions;
drop policy if exists csess_insert on public.caisse_sessions;
drop policy if exists csess_update on public.caisse_sessions;
drop policy if exists csess_delete on public.caisse_sessions;

-- Every staff member must be able to see / open / close today's caisse,
-- because the whole app is locked until it is opened.
create policy csess_select on public.caisse_sessions for select to authenticated
  using (public.is_staff());
create policy csess_insert on public.caisse_sessions for insert to authenticated
  with check (public.is_staff());
create policy csess_update on public.caisse_sessions for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy csess_delete on public.caisse_sessions for delete to authenticated
  using (public.can_do('caisse', 'delete'));

-- Product sales line by line (dated by invoice), for the "gains" card.
create or replace view public.v_product_sales as
select i.creation_date as sale_date, it.product_id, it.name, it.type,
       it.quantity, it.unit_price, it.total, i.invoice_number, i.customer_name
  from public.sales_invoice_items it
  join public.sales_invoices i on i.id = it.sales_invoice_id
 where public.can_view_any(array['caisse', 'reports', 'dashboard']);

grant select on public.v_product_sales to authenticated;
revoke all on public.v_product_sales from anon;

notify pgrst, 'reload schema';
