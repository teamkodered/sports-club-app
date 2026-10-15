-- Focus notes per team: 'pka' (PKA + KR, the existing notes) and 'krba' (KRBA's own).
-- KRBA's Format lives in settings 'dashboard_format_krba' (created when first saved).
alter table public.focus_notes add column if not exists team text not null default 'pka';
