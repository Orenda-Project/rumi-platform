const { COUNTRIES_DROPDOWN } = require('../../bot/shared/config/registration-data');
const { buildBuckets, COUNTRY_REGION_BUCKETS } = require('../../bot/shared/config/discord-country-regions');

describe('discord-country-regions', () => {
  it('every bucket stays at or under Discord\'s 25-option StringSelectMenu cap', () => {
    const buckets = buildBuckets(COUNTRIES_DROPDOWN);
    for (const bucket of buckets) {
      expect(bucket.countries.length).toBeLessThanOrEqual(25);
    }
  });

  it('covers every country in COUNTRIES_DROPDOWN exactly once, with none dropped or duplicated', () => {
    const buckets = buildBuckets(COUNTRIES_DROPDOWN);
    const seen = new Map();
    for (const bucket of buckets) {
      for (const country of bucket.countries) {
        expect(seen.has(country.id)).toBe(false); // no duplicates across buckets
        seen.set(country.id, bucket.id);
      }
    }
    expect(seen.size).toBe(COUNTRIES_DROPDOWN.length);
    for (const country of COUNTRIES_DROPDOWN) {
      expect(seen.has(country.id)).toBe(true); // nothing silently dropped
    }
  });

  it('preserves each country\'s live title/id from COUNTRIES_DROPDOWN rather than a second hardcoded copy', () => {
    const buckets = buildBuckets(COUNTRIES_DROPDOWN);
    const pakistanBucket = buckets.find((b) => b.countries.some((c) => c.id === 'PK'));
    const pakistan = pakistanBucket.countries.find((c) => c.id === 'PK');
    expect(pakistan).toEqual({ id: 'PK', title: 'Pakistan' });
  });

  it('falls back to a catch-all "Other" bucket for any country not yet hand-bucketed, instead of silently dropping it', () => {
    const extendedDropdown = [...COUNTRIES_DROPDOWN, { id: 'ZZ', title: 'Fictionland' }];
    const buckets = buildBuckets(extendedDropdown);
    const other = buckets.find((b) => b.id === 'other');
    expect(other).toBeTruthy();
    expect(other.countries).toEqual([{ id: 'ZZ', title: 'Fictionland' }]);
  });

  it('does not add an "Other" bucket when every country is already covered', () => {
    const buckets = buildBuckets(COUNTRIES_DROPDOWN);
    expect(buckets.find((b) => b.id === 'other')).toBeUndefined();
  });

  it('every hand-maintained bucket has a stable id and title', () => {
    for (const bucket of COUNTRY_REGION_BUCKETS) {
      expect(typeof bucket.id).toBe('string');
      expect(bucket.id.length).toBeGreaterThan(0);
      expect(typeof bucket.title).toBe('string');
      expect(Array.isArray(bucket.countryCodes)).toBe(true);
      expect(bucket.countryCodes.length).toBeGreaterThan(0);
    }
  });
});
