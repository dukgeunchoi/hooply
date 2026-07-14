// Single source of truth for "is this string UUID-shaped" — used both for
// request-param validation (a malformed query param is a 400) and as
// defensiveness inside packages/db's lookups (a malformed path-param id
// should resolve to "not found" rather than letting Postgres throw on an
// invalid uuid literal).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
