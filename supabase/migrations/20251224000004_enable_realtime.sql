-- Enable Realtime for messages table
alter publication supabase_realtime add table messages;

-- Also enable for matches (for real-time match notifications)
alter publication supabase_realtime add table matches;
