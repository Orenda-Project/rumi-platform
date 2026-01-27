-- Test query to verify connection
SELECT
  'Connection successful!' as status,
  current_database() as database,
  current_user as user,
  version() as postgres_version;
