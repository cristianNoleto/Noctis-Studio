-- Agregação por categoria para a aba "Por Categoria" do Niche Finder.
-- Retorna categoria, nº de canais e soma de views — calculado no banco (rápido
-- mesmo com centenas de milhares de canais). Rode uma vez no SQL Editor.

create or replace function public.niche_category_stats()
returns table(category text, count bigint, views numeric)
language sql
stable
as $$
  select
    coalesce(nullif(category, ''), 'Outros') as category,
    count(*)::bigint                         as count,
    coalesce(sum(views), 0)::numeric         as views
  from public.niche_channels
  group by 1
  order by count desc;
$$;
