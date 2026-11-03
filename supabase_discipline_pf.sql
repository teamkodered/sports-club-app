-- Discipline codes: PC (points) is now PF (points fighting)
update public.students set discipline_codes = regexp_replace(discipline_codes, '(^|/)PC(/|$)', '\1PF\2', 'g')
where discipline_codes ~ '(^|/)PC(/|$)';
