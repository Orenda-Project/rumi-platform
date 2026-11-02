/**
 * The PostgREST mini-languages the bundled-Postgres adapter has to read:
 * select strings, column refs with JSON paths, .or() logic trees and
 * in-lists. Every shape here is one the bot or dashboard actually sends.
 */

const {
  parseSelect,
  parseColumnRef,
  parseLogicTree,
  parseList,
} = require('../../bot/shared/services/db/pg-adapter/postgrest-syntax');

describe('parseColumnRef', () => {
  test('plain column', () => {
    expect(parseColumnRef('phone_number')).toEqual({ name: 'phone_number', path: [], cast: null });
  });

  test('JSON path with -> and ->>', () => {
    expect(parseColumnRef('analysis_data->observer_debrief->>audio_hash')).toEqual({
      name: 'analysis_data',
      path: [
        { op: '->', key: 'observer_debrief' },
        { op: '->>', key: 'audio_hash' },
      ],
      cast: null,
    });
  });

  test('numeric JSON path segment becomes an index', () => {
    expect(parseColumnRef('items->0->>id').path).toEqual([
      { op: '->', key: 0 },
      { op: '->>', key: 'id' },
    ]);
  });

  test('cast, when allowed (select lists)', () => {
    expect(parseColumnRef('created_at::text', { allowCast: true })).toEqual({ name: 'created_at', path: [], cast: 'text' });
  });

  test('cast is rejected by default (filters, order)', () => {
    expect(() => parseColumnRef('created_at::text')).toThrow(/not allowed/);
  });

  test.each(['a;drop', 'a b', '"x"', '', 'a->', 'a::text;x'])('rejects unsafe ref %p', (ref) => {
    expect(() => parseColumnRef(ref, { allowCast: true })).toThrow();
  });
});

describe('parseSelect', () => {
  test('star', () => {
    expect(parseSelect('*')).toEqual([{ type: 'star' }]);
  });

  test('empty select means star', () => {
    expect(parseSelect('')).toEqual([{ type: 'star' }]);
    expect(parseSelect(undefined)).toEqual([{ type: 'star' }]);
  });

  test('columns with whitespace and newlines', () => {
    const nodes = parseSelect(`
      id, user_id,
      status
    `);
    expect(nodes.map((n) => n.name)).toEqual(['id', 'user_id', 'status']);
    expect(nodes.every((n) => n.type === 'column' && n.alias === null)).toBe(true);
  });

  test('aliased JSON path', () => {
    expect(parseSelect('id, observer_debrief:analysis_data->observer_debrief')[1]).toEqual({
      type: 'column',
      name: 'analysis_data',
      path: [{ op: '->', key: 'observer_debrief' }],
      cast: null,
      alias: 'observer_debrief',
    });
  });

  test('to-one embed', () => {
    expect(parseSelect('id, users(preferred_language)')[1]).toEqual({
      type: 'embed',
      relation: 'users',
      alias: null,
      hint: null,
      isInner: false,
      children: [{ type: 'column', name: 'preferred_language', path: [], cast: null, alias: null }],
    });
  });

  test('!inner embed', () => {
    const [, embed] = parseSelect('*, users!inner(phone_number, first_name)');
    expect(embed).toMatchObject({ relation: 'users', hint: null, isInner: true });
    expect(embed.children.map((c) => c.name)).toEqual(['phone_number', 'first_name']);
  });

  test('FK-hinted embed', () => {
    const [, embed] = parseSelect('*, users!video_requests_user_id_fkey(phone_number)');
    expect(embed).toMatchObject({ relation: 'users', hint: 'video_requests_user_id_fkey', isInner: false });
  });

  test('hint and !inner together', () => {
    const [embed] = parseSelect('users!video_requests_user_id_fkey!inner(id)');
    expect(embed).toMatchObject({ hint: 'video_requests_user_id_fkey', isInner: true });
  });

  test('aliased embed with star', () => {
    expect(parseSelect('*, session:byof_sessions(*)')[1]).toMatchObject({
      type: 'embed',
      relation: 'byof_sessions',
      alias: 'session',
      children: [{ type: 'star' }],
    });
  });

  test('alias equal to the relation name (users:users(...))', () => {
    expect(parseSelect('users:users(first_name)')[0]).toMatchObject({ relation: 'users', alias: 'users' });
  });

  test('nested embed', () => {
    const [embed] = parseSelect('quizzes(id, quiz_questions(question_text))');
    expect(embed.children[1]).toMatchObject({ type: 'embed', relation: 'quiz_questions' });
  });

  test.each(['id,', 'users(id', 'users)', 'id;drop table x', 'a b'])('rejects malformed %p', (s) => {
    expect(() => parseSelect(s)).toThrow();
  });
});

describe('parseList', () => {
  test('quoted and bare items', () => {
    expect(parseList('("completed","cancelled",error)')).toEqual(['completed', 'cancelled', 'error']);
  });

  test('quoted item with a comma inside', () => {
    expect(parseList('("a,b",c)')).toEqual(['a,b', 'c']);
  });

  test('empty list', () => {
    expect(parseList('()')).toEqual([]);
  });

  test('rejects a string without parentheses', () => {
    expect(() => parseList('a,b')).toThrow();
  });
});

describe('parseLogicTree', () => {
  test('flat or list (telemetry.js)', () => {
    expect(parseLogicTree('is_test_user.is.null,is_test_user.eq.false')).toEqual([
      { type: 'filter', column: 'is_test_user', negate: false, op: 'is', value: 'null' },
      { type: 'filter', column: 'is_test_user', negate: false, op: 'eq', value: 'false' },
    ]);
  });

  test('ISO timestamps keep their dots and colons (pic-lp-session.service.js)', () => {
    const [gt] = parseLogicTree('expires_at.gt.2026-11-02T10:20:30.123Z,expires_at.is.null');
    expect(gt).toEqual({
      type: 'filter', column: 'expires_at', negate: false, op: 'gt', value: '2026-11-02T10:20:30.123Z',
    });
  });

  test('ilike with % wildcards (dashboard search)', () => {
    expect(parseLogicTree('first_name.ilike.%ali%,name.ilike.%ali%')[1]).toMatchObject({
      column: 'name', op: 'ilike', value: '%ali%',
    });
  });

  test('not. prefix and in-list', () => {
    expect(parseLogicTree('status.not.in.("a","b")')).toEqual([
      { type: 'filter', column: 'status', negate: true, op: 'in', value: ['a', 'b'] },
    ]);
  });

  test('nested and() group', () => {
    expect(parseLogicTree('a.eq.1,and(b.is.null,c.gt.2)')[1]).toEqual({
      type: 'group',
      op: 'and',
      negate: false,
      children: [
        { type: 'filter', column: 'b', negate: false, op: 'is', value: 'null' },
        { type: 'filter', column: 'c', negate: false, op: 'gt', value: '2' },
      ],
    });
  });

  test('JSON path column', () => {
    expect(parseLogicTree('meta->>sent_at.is.null')[0]).toMatchObject({ column: 'meta->>sent_at', op: 'is' });
  });

  test('double-quoted value with a comma', () => {
    expect(parseLogicTree('name.eq."Smith, J",id.eq.1')[0]).toMatchObject({ value: 'Smith, J' });
  });

  test.each(['a.zz.1', 'a', 'a.eq', 'and(a.eq.1'])('rejects malformed %p', (s) => {
    expect(() => parseLogicTree(s)).toThrow();
  });
});
