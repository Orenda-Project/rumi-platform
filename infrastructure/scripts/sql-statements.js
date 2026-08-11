/**
 * Split a SQL file into statements that `exec_sql` can run one at a time.
 *
 * Postgres `EXECUTE` in plpgsql accepts a single command. Sending a whole
 * schema file (extensions, 70 tables, functions, indexes) as one RPC therefore
 * either errors ("cannot insert multiple commands") or applies only the first
 * statement — which is how a setup can "succeed" with no `users` table.
 *
 * Dollar-quoted bodies (`$$` / `$function$`) and string literals are kept
 * intact so CREATE FUNCTION / DO blocks stay one statement.
 */

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  const n = String(sql || '').length;
  const src = String(sql || '');

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '-' && next === '-') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }

    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    if (ch === '$') {
      const tagged = src.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (tagged) {
        const tag = tagged[0];
        const close = src.indexOf(tag, i + tag.length);
        if (close !== -1) {
          current += src.slice(i, close + tag.length);
          i = close + tag.length;
          continue;
        }
      }
    }

    if (ch === "'") {
      current += ch;
      i += 1;
      while (i < n) {
        if (src[i] === "'" && src[i + 1] === "'") {
          current += "''";
          i += 2;
          continue;
        }
        current += src[i];
        if (src[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

/** Extensions that are nice to have but must not block creating `users`. */
function isOptionalStatement(sql) {
  return /create\s+extension/i.test(sql) && /vector/i.test(sql);
}

module.exports = { splitSqlStatements, isOptionalStatement };
