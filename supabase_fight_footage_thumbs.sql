-- Small preview picture saved with each uploaded video (a ~5 KB JPEG data URL
-- grabbed on the device at upload), shown in Awaiting publish, View iT and the
-- athletes' lists so you can see who's in a clip without opening it.
-- Safe to run more than once.
alter table fight_footage add column if not exists thumb text;
