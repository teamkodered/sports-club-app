-- Enquiries: who the enquiry is for -- { "self": true } or { "self": false, "names": ["Alfie", "Mia"] }
alter table public.enquiries add column if not exists enquiry_for jsonb;
