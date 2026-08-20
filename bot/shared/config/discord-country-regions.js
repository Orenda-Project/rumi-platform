/**
 * Continent-ish buckets over registration-data.js's 164-country COUNTRIES_DROPDOWN,
 * for Discord's 2-step country picker (pick a region bucket, then pick a
 * country within it) — Discord's StringSelectMenuBuilder caps at 25 options
 * (Slack's static_select caps at 100, so this chunking has no Slack
 * equivalent). Every bucket below is sized under that cap.
 *
 * This is genuine new data, not derived from an existing table — unlike the
 * Pakistan/India region picker (discord-views/registration.view.js's
 * REGION_INFO screen), which reuses REGIONS_DROPDOWN's existing `in_`-prefixed
 * ids directly and needs no bucket table of its own.
 *
 * Bucket membership is by ISO 3166-1 alpha-2 code, matching COUNTRIES_DROPDOWN's
 * own `id` field — update this file if registration-data.js's COUNTRY_CODES
 * list ever changes.
 */

const COUNTRY_REGION_BUCKETS = [
  {
    id: 'south_asia',
    title: 'South Asia',
    countryCodes: ['PK', 'IN', 'BD', 'LK', 'NP', 'AF', 'MV', 'BT'],
  },
  {
    id: 'middle_east',
    title: 'Middle East',
    countryCodes: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'TR', 'IQ', 'SY', 'JO', 'LB', 'PS', 'YE', 'IR', 'CY'],
  },
  {
    id: 'europe',
    title: 'Europe',
    countryCodes: [
      'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'FI', 'BE', 'AT',
      'CH', 'PT', 'IE', 'PL', 'CZ', 'RO', 'HU', 'GR', 'BG',
    ],
  },
  {
    id: 'europe_other',
    title: 'Europe (other)',
    countryCodes: [
      'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'RU', 'UA', 'BY', 'MD', 'RS', 'BA',
      'ME', 'MK', 'AL', 'XK', 'MT', 'IS', 'LU', 'LI', 'MC', 'SM', 'AD', 'VA',
    ],
  },
  {
    id: 'east_southeast_asia',
    title: 'East & Southeast Asia',
    countryCodes: [
      'MY', 'ID', 'TH', 'VN', 'PH', 'SG', 'MM', 'KH', 'LA', 'CN', 'JP', 'KR',
      'TW', 'HK', 'MN', 'BN', 'TL',
    ],
  },
  {
    id: 'central_asia_caucasus',
    title: 'Central Asia & Caucasus',
    countryCodes: ['KZ', 'UZ', 'TJ', 'KG', 'TM', 'AZ', 'GE', 'AM'],
  },
  {
    id: 'africa_north_west',
    title: 'Africa (North & West)',
    countryCodes: ['EG', 'MA', 'TN', 'DZ', 'LY', 'SD', 'NG', 'GH', 'SN', 'CI', 'CM'],
  },
  {
    id: 'africa_east_south',
    title: 'Africa (East & South)',
    countryCodes: [
      'ZA', 'KE', 'ET', 'TZ', 'UG', 'RW', 'CD', 'AO', 'MZ', 'ZW', 'MW', 'ZM',
      'BW', 'NA', 'MG', 'MU', 'SC',
    ],
  },
  {
    id: 'americas_north',
    title: 'Americas (North & Central)',
    countryCodes: [
      'US', 'CA', 'MX', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'CU', 'DO', 'HT',
      'JM', 'TT', 'BB', 'BS', 'BZ',
    ],
  },
  {
    id: 'americas_south',
    title: 'Americas (South)',
    countryCodes: ['BR', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'GY', 'SR'],
  },
  {
    id: 'oceania',
    title: 'Oceania',
    countryCodes: [
      'AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'KI', 'MH', 'FM', 'PW', 'NR', 'TV',
    ],
  },
];

/**
 * Builds the runtime bucket list from COUNTRIES_DROPDOWN, so titles/order
 * always reflect the live registration data rather than a second hardcoded
 * copy — only the ISO-code membership above is hand-maintained.
 * @param {Array<{id: string, title: string}>} countriesDropdown - registration-data.js's COUNTRIES_DROPDOWN
 * @returns {Array<{id: string, title: string, countries: Array<{id: string, title: string}>}>}
 */
function buildBuckets(countriesDropdown) {
  const byCode = new Map(countriesDropdown.map((c) => [c.id, c]));
  const buckets = COUNTRY_REGION_BUCKETS.map((bucket) => ({
    id: bucket.id,
    title: bucket.title,
    countries: bucket.countryCodes.map((code) => byCode.get(code)).filter(Boolean),
  }));

  // Anything in COUNTRIES_DROPDOWN but not yet bucketed above lands in a
  // catch-all bucket rather than silently vanishing from the picker.
  const bucketedCodes = new Set(COUNTRY_REGION_BUCKETS.flatMap((b) => b.countryCodes));
  const unbucketed = countriesDropdown.filter((c) => !bucketedCodes.has(c.id));
  if (unbucketed.length) {
    buckets.push({ id: 'other', title: 'Other', countries: unbucketed });
  }

  return buckets;
}

module.exports = { COUNTRY_REGION_BUCKETS, buildBuckets };
