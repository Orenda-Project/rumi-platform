/**
 * Registration Flow Data Configuration
 *
 * Static data for the WhatsApp Flow registration form.
 * Provides {id, title} formatted arrays for WhatsApp Flow dropdown data-sources.
 *
 * Flow JSON (v3 Flow ID: 1097696882539960, legacy: 1365762335566492) references:
 *   PERSONAL_INFO: ${data.countries}, ${data.regions}
 *   PROFESSIONAL_INFO: ${data.organizations}, ${data.grades}, ${data.subjects}
 *
 * Bead: bd-384, bd-391
 * Updated: February 13, 2026
 */

// Country name mapping (ISO 3166-1 alpha-2 → display name)
const COUNTRY_NAMES = {
  PK: 'Pakistan', IN: 'India', BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal',
  AF: 'Afghanistan', AE: 'UAE', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait',
  BH: 'Bahrain', OM: 'Oman', US: 'United States', GB: 'United Kingdom',
  CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France', IT: 'Italy',
  ES: 'Spain', NL: 'Netherlands', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', BE: 'Belgium', AT: 'Austria', CH: 'Switzerland', PT: 'Portugal',
  IE: 'Ireland', PL: 'Poland', CZ: 'Czech Republic', RO: 'Romania', HU: 'Hungary',
  GR: 'Greece', BG: 'Bulgaria', HR: 'Croatia', SK: 'Slovakia', SI: 'Slovenia',
  LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia', TR: 'Turkey', EG: 'Egypt',
  MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria', LY: 'Libya', SD: 'Sudan',
  IQ: 'Iraq', SY: 'Syria', JO: 'Jordan', LB: 'Lebanon', PS: 'Palestine',
  YE: 'Yemen', IR: 'Iran', MY: 'Malaysia', ID: 'Indonesia', TH: 'Thailand',
  VN: 'Vietnam', PH: 'Philippines', SG: 'Singapore', MM: 'Myanmar', KH: 'Cambodia',
  LA: 'Laos', CN: 'China', JP: 'Japan', KR: 'South Korea', TW: 'Taiwan',
  HK: 'Hong Kong', MN: 'Mongolia', KZ: 'Kazakhstan', UZ: 'Uzbekistan',
  TJ: 'Tajikistan', KG: 'Kyrgyzstan', TM: 'Turkmenistan', AZ: 'Azerbaijan',
  GE: 'Georgia', AM: 'Armenia', RU: 'Russia', UA: 'Ukraine', BY: 'Belarus',
  MD: 'Moldova', RS: 'Serbia', BA: 'Bosnia & Herzegovina', ME: 'Montenegro',
  MK: 'North Macedonia', AL: 'Albania', XK: 'Kosovo', CY: 'Cyprus', MT: 'Malta',
  IS: 'Iceland', LU: 'Luxembourg', LI: 'Liechtenstein', MC: 'Monaco',
  SM: 'San Marino', AD: 'Andorra', VA: 'Vatican City', ZA: 'South Africa',
  NG: 'Nigeria', KE: 'Kenya', ET: 'Ethiopia', GH: 'Ghana', TZ: 'Tanzania',
  UG: 'Uganda', RW: 'Rwanda', SN: 'Senegal', CI: "Cote d'Ivoire", CM: 'Cameroon',
  CD: 'DR Congo', AO: 'Angola', MZ: 'Mozambique', ZW: 'Zimbabwe', MW: 'Malawi',
  ZM: 'Zambia', BW: 'Botswana', NA: 'Namibia', MG: 'Madagascar', MU: 'Mauritius',
  SC: 'Seychelles', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', CO: 'Colombia',
  CL: 'Chile', PE: 'Peru', VE: 'Venezuela', EC: 'Ecuador', BO: 'Bolivia',
  PY: 'Paraguay', UY: 'Uruguay', CR: 'Costa Rica', PA: 'Panama', GT: 'Guatemala',
  HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua', CU: 'Cuba',
  DO: 'Dominican Republic', HT: 'Haiti', JM: 'Jamaica', TT: 'Trinidad & Tobago',
  BB: 'Barbados', BS: 'Bahamas', GY: 'Guyana', SR: 'Suriname', BZ: 'Belize',
  NZ: 'New Zealand', FJ: 'Fiji', PG: 'Papua New Guinea', WS: 'Samoa', TO: 'Tonga',
  VU: 'Vanuatu', SB: 'Solomon Islands', KI: 'Kiribati', MH: 'Marshall Islands',
  FM: 'Micronesia', PW: 'Palau', NR: 'Nauru', TV: 'Tuvalu', MV: 'Maldives',
  BN: 'Brunei', TL: 'Timor-Leste', BT: 'Bhutan'
};

// Country codes in priority order: Pakistan first, then regional, then alphabetical
const COUNTRY_CODES = [
  'PK', 'IN', 'BD', 'LK', 'NP', 'AF', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM',
  'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK',
  'FI', 'BE', 'AT', 'CH', 'PT', 'IE', 'PL', 'CZ', 'RO', 'HU', 'GR', 'BG',
  'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'TR', 'EG', 'MA', 'TN', 'DZ', 'LY',
  'SD', 'IQ', 'SY', 'JO', 'LB', 'PS', 'YE', 'IR', 'MY', 'ID', 'TH', 'VN',
  'PH', 'SG', 'MM', 'KH', 'LA', 'CN', 'JP', 'KR', 'TW', 'HK', 'MN', 'KZ',
  'UZ', 'TJ', 'KG', 'TM', 'AZ', 'GE', 'AM', 'RU', 'UA', 'BY', 'MD', 'RS',
  'BA', 'ME', 'MK', 'AL', 'XK', 'CY', 'MT', 'IS', 'LU', 'LI', 'MC', 'SM',
  'AD', 'VA', 'ZA', 'NG', 'KE', 'ET', 'GH', 'TZ', 'UG', 'RW', 'SN', 'CI',
  'CM', 'CD', 'AO', 'MZ', 'ZW', 'MW', 'ZM', 'BW', 'NA', 'MG', 'MU', 'SC',
  'BR', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'CR',
  'PA', 'GT', 'HN', 'SV', 'NI', 'CU', 'DO', 'HT', 'JM', 'TT', 'BB', 'BS',
  'GY', 'SR', 'BZ', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'KI', 'MH',
  'FM', 'PW', 'NR', 'TV', 'MV', 'BN', 'TL', 'BT'
];

// Pre-built dropdown arrays in WhatsApp Flow {id, title} format
// Sorted alphabetically by display name for UX

const COUNTRIES_DROPDOWN = COUNTRY_CODES.map(code => ({
  id: code,
  title: COUNTRY_NAMES[code] || code
})).sort((a, b) => a.title.localeCompare(b.title));

const REGIONS_DROPDOWN = [
  { id: 'federal', title: 'Federal' },
  { id: 'punjab', title: 'Punjab' },
  { id: 'sindh', title: 'Sindh' },
  { id: 'kpk', title: 'KPK' },
  { id: 'balochistan', title: 'Balochistan' },
  { id: 'kashmir', title: 'Kashmir' },
  { id: 'gilgit_baltistan', title: 'Gilgit-Baltistan' }
];

const ORGANIZATIONS_DROPDOWN = [
  { id: 'taleemabad', title: 'Taleemabad' },
  { id: 'fde', title: 'FDE' },
  { id: 'aga_khan', title: 'Aga Khan Foundation' },
  { id: 'tcf', title: 'TCF' },
  { id: 'care', title: 'CARE Foundation' },
  { id: 'dawood', title: 'Dawood Foundation' },
  { id: 'durbeen', title: 'Durbeen' },
  { id: 'akhuwat', title: 'Akhuwat' },
  { id: 'ita', title: 'ITA' },
  { id: 'pef', title: 'PEF' },
  { id: 'steda', title: 'STEDA' },
  { id: 'eaa', title: 'EAA' },
  { id: 'idp', title: 'IDP Education' },
  { id: 'british_council', title: 'British Council' },
  { id: 'usaid', title: 'USAID' },
  { id: 'unicef', title: 'UNICEF' },
  { id: 'world_bank', title: 'World Bank' },
  { id: 'none', title: 'None / Independent' },
  { id: 'other', title: 'Other' }
];

const GRADES_DROPDOWN = [
  { id: 'early_years', title: 'Early Years (KG)' },
  { id: 'grade_1', title: 'Grade 1' },
  { id: 'grade_2', title: 'Grade 2' },
  { id: 'grade_3', title: 'Grade 3' },
  { id: 'grade_4', title: 'Grade 4' },
  { id: 'grade_5', title: 'Grade 5' },
  { id: 'grade_6', title: 'Grade 6' },
  { id: 'grade_7', title: 'Grade 7' },
  { id: 'grade_8', title: 'Grade 8' },
  { id: 'grade_9', title: 'Grade 9' },
  { id: 'grade_10', title: 'Grade 10' },
  { id: 'higher_secondary', title: 'Higher Secondary (11-12)' }
];

const SUBJECTS_DROPDOWN = [
  { id: 'maths', title: 'Maths' },
  { id: 'english', title: 'English' },
  { id: 'urdu', title: 'Urdu' },
  { id: 'islamiat', title: 'Islamiat' },
  { id: 'science', title: 'Science' },
  { id: 'physics', title: 'Physics' },
  { id: 'chemistry', title: 'Chemistry' },
  { id: 'biology', title: 'Biology' },
  { id: 'social_studies', title: 'Social Studies / Pak St.' },
  { id: 'computer_science', title: 'Computer Science' },
  { id: 'other', title: 'Other' }
];

module.exports = {
  COUNTRY_CODES,
  COUNTRY_NAMES,
  COUNTRIES_DROPDOWN,
  REGIONS_DROPDOWN,
  ORGANIZATIONS_DROPDOWN,
  GRADES_DROPDOWN,
  SUBJECTS_DROPDOWN
};
