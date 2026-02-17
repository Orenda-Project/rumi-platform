/**
 * Registration Flow Endpoint Handler
 *
 * Handles endpoint-based WhatsApp Flow for user registration (PROJ-010).
 * Uses data_api_version 3.0 with encrypted data exchange.
 *
 * Flow screens (bd-391, bd-395: split-screen + conditional org):
 *   PERSONAL_INFO → REGION_INFO (if PK) → PROFESSIONAL_INFO → SUCCESS (if org != "other")
 *   PERSONAL_INFO → REGION_INFO (if PK) → PROFESSIONAL_INFO → ORG_DETAILS → SUCCESS (if org == "other")
 *   PERSONAL_INFO → PROFESSIONAL_INFO (if not PK) → SUCCESS
 *   PERSONAL_INFO → PROFESSIONAL_INFO (if not PK) → ORG_DETAILS → SUCCESS (if org == "other")
 *
 * PERSONAL_INFO: full_name, country
 *   Endpoint provides: countries (dropdown data-source)
 *
 * REGION_INFO: region (only for Pakistan users)
 *   Endpoint provides: regions (dropdown data-source)
 *
 * PROFESSIONAL_INFO: organization, organization_other, school_name, grade, subjects
 *   Endpoint provides: organizations, grades, subjects (dropdown data-sources)
 *
 * SUCCESS: terminal screen
 *   Endpoint provides: welcome_message, portal_message, extension_message_response
 *
 * Key patterns (learned from attendance endpoint bugs):
 * - Response format: {screen, data} ONLY - NO version field
 * - BACK must return ALL declared data fields with values
 * - Check both INIT and init for action names
 * - handlePing returns {data: {status: 'active'}}
 * - Log full JSON responses for debugging
 *
 * Bead: bd-384, bd-391, bd-395
 * Updated: February 16, 2026
 */

const { logToFile } = require('../utils/logger');
const redisService = require('../services/cache/railway-redis.service');
const {
  COUNTRIES_DROPDOWN,
  REGIONS_DROPDOWN,
  ORGANIZATIONS_DROPDOWN,
  GRADES_DROPDOWN,
  SUBJECTS_DROPDOWN
} = require('../config/registration-data');

const REDIS_PREFIX = 'reg_flow:';
const REDIS_TTL = 3600; // 1 hour

/**
 * Handle INIT action - return PERSONAL_INFO screen with country dropdown only
 * bd-391: Region is now on a separate screen, not included in INIT
 */
async function handleRegistrationInit(userId) {
  logToFile('📝 Registration flow INIT', { userId });

  return {
    screen: 'PERSONAL_INFO',
    data: {
      countries: COUNTRIES_DROPDOWN
    }
  };
}

/**
 * Handle data_exchange for registration screens
 */
async function handleRegistrationDataExchange(userId, screen, screenData, flowToken) {
  logToFile('📝 Registration flow data_exchange', {
    userId,
    screen,
    screenDataKeys: Object.keys(screenData || {}),
    screenData
  });

  if (screen === 'PERSONAL_INFO') {
    return await handlePersonalInfoSubmit(userId, screenData, flowToken);
  }

  if (screen === 'REGION_INFO') {
    return await handleRegionInfoSubmit(userId, screenData, flowToken);
  }

  if (screen === 'PROFESSIONAL_INFO') {
    return await handleProfessionalInfoSubmit(userId, screenData, flowToken);
  }

  if (screen === 'ORG_DETAILS') {
    return await handleOrgDetailsSubmit(userId, screenData, flowToken);
  }

  logToFile('⚠️ Unknown screen in registration flow', { screen });
  return createErrorResponse('Unknown screen');
}

/**
 * Handle PERSONAL_INFO screen submission
 * bd-391: Split-screen routing - PK goes to REGION_INFO, others skip to PROFESSIONAL_INFO
 */
async function handlePersonalInfoSubmit(userId, screenData, flowToken) {
  const fullName = (screenData.full_name || '').trim();
  const country = screenData.country || '';

  if (!fullName) {
    return createErrorResponse('Name is required');
  }

  if (!country) {
    return createErrorResponse('Country is required');
  }

  // Store partial registration data in Redis (region not collected yet)
  const regData = {
    full_name: fullName,
    country,
    region: null
  };
  await storeRegData(flowToken, regData);

  // bd-391: Route based on country
  if (country === 'PK') {
    // Pakistan users → REGION_INFO screen
    const response = {
      screen: 'REGION_INFO',
      data: {
        regions: REGIONS_DROPDOWN
      }
    };

    logToFile('📤 PERSONAL_INFO → REGION_INFO (PK user)', {
      userId, country, response: JSON.stringify(response)
    });

    return response;
  }

  // Non-PK users → skip directly to PROFESSIONAL_INFO
  const response = {
    screen: 'PROFESSIONAL_INFO',
    data: {
      organizations: ORGANIZATIONS_DROPDOWN,
      grades: GRADES_DROPDOWN,
      subjects: SUBJECTS_DROPDOWN
    }
  };

  logToFile('📤 PERSONAL_INFO → PROFESSIONAL_INFO (non-PK, skipping region)', {
    userId, country, response: JSON.stringify(response)
  });

  return response;
}

/**
 * Handle REGION_INFO screen submission (bd-391: new screen for PK users)
 * Updates Redis with selected region, navigates to PROFESSIONAL_INFO
 */
async function handleRegionInfoSubmit(userId, screenData, flowToken) {
  const region = screenData.region || null;

  // Get stored data and update with region
  const stored = await getRegData(flowToken);
  stored.region = region;
  await storeRegData(flowToken, stored);

  const response = {
    screen: 'PROFESSIONAL_INFO',
    data: {
      organizations: ORGANIZATIONS_DROPDOWN,
      grades: GRADES_DROPDOWN,
      subjects: SUBJECTS_DROPDOWN
    }
  };

  logToFile('📤 REGION_INFO → PROFESSIONAL_INFO', {
    userId, region, response: JSON.stringify(response)
  });

  return response;
}

/**
 * Handle PROFESSIONAL_INFO screen submission
 * bd-395: Organization is mandatory. If org is "other", navigate to ORG_DETAILS.
 * Otherwise, go directly to SUCCESS.
 */
async function handleProfessionalInfoSubmit(userId, screenData, flowToken) {
  const organization = screenData.organization || '';

  // bd-395: Organization is mandatory
  if (!organization) {
    return createErrorResponse('Organization is required');
  }

  const stored = await getRegData(flowToken);

  const allData = {
    ...stored,
    organization,
    school_name: (screenData.school_name || '').trim() || null,
    grade: screenData.grade || '',
    subjects: screenData.subjects || []
  };

  // bd-395: If org is "other", navigate to ORG_DETAILS for custom org name
  if (organization === 'other') {
    await storeRegData(flowToken, allData);

    const response = {
      screen: 'ORG_DETAILS',
      data: {}
    };

    logToFile('📤 PROFESSIONAL_INFO → ORG_DETAILS (org=other)', {
      userId, response: JSON.stringify(response)
    });

    return response;
  }

  // Non-"other" org → go directly to SUCCESS
  await deleteRegData(flowToken);

  const response = {
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params: {
          flow_token: flowToken,
          full_name: allData.full_name || '',
          country: allData.country || '',
          region: allData.region || null,
          organization: allData.organization || null,
          organization_other: null,
          school_name: allData.school_name || null,
          grade: allData.grade || '',
          subjects: allData.subjects || []
        }
      },
      welcome_message: `Welcome, ${allData.full_name || 'Teacher'}! Your registration is complete.`,
      portal_message: 'Your portal is ready at portal.hellorumi.ai'
    }
  };

  logToFile('📤 PROFESSIONAL_INFO → SUCCESS', {
    userId, allData, response: JSON.stringify(response)
  });

  return response;
}

/**
 * Handle ORG_DETAILS screen submission (bd-395)
 * Collects custom organization name when user selected "Other".
 * Combines with stored data from Redis and returns SUCCESS.
 */
async function handleOrgDetailsSubmit(userId, screenData, flowToken) {
  const organizationOther = (screenData.organization_other || '').trim();

  // bd-395: Custom org name is mandatory when "Other" is selected
  if (!organizationOther) {
    return createErrorResponse('Please enter your organization name');
  }

  const stored = await getRegData(flowToken);
  await deleteRegData(flowToken);

  const response = {
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params: {
          flow_token: flowToken,
          full_name: stored.full_name || '',
          country: stored.country || '',
          region: stored.region || null,
          organization: stored.organization || 'other',
          organization_other: organizationOther,
          school_name: stored.school_name || null,
          grade: stored.grade || '',
          subjects: stored.subjects || []
        }
      },
      welcome_message: `Welcome, ${stored.full_name || 'Teacher'}! Your registration is complete.`,
      portal_message: 'Your portal is ready at portal.hellorumi.ai'
    }
  };

  logToFile('📤 ORG_DETAILS → SUCCESS', {
    userId, organizationOther, response: JSON.stringify(response)
  });

  return response;
}

/**
 * Handle BACK navigation between screens
 * bd-391: Updated for split-screen routing
 * bd-395: Added ORG_DETAILS → PROFESSIONAL_INFO
 */
async function handleRegistrationBack(userId, screen, flowToken) {
  logToFile('📝 Registration flow BACK', { userId, screen });

  // bd-395: BACK from ORG_DETAILS → PROFESSIONAL_INFO
  if (screen === 'ORG_DETAILS') {
    return {
      screen: 'PROFESSIONAL_INFO',
      data: {
        organizations: ORGANIZATIONS_DROPDOWN,
        grades: GRADES_DROPDOWN,
        subjects: SUBJECTS_DROPDOWN
      }
    };
  }

  if (screen === 'REGION_INFO') {
    // REGION_INFO → back to PERSONAL_INFO (countries only, no regions)
    return {
      screen: 'PERSONAL_INFO',
      data: {
        countries: COUNTRIES_DROPDOWN
      }
    };
  }

  if (screen === 'PROFESSIONAL_INFO') {
    // Check if user is PK → go back to REGION_INFO, else → PERSONAL_INFO
    const stored = await getRegData(flowToken);

    if (stored.country === 'PK') {
      return {
        screen: 'REGION_INFO',
        data: {
          regions: REGIONS_DROPDOWN
        }
      };
    }

    // Non-PK user → back to PERSONAL_INFO
    return {
      screen: 'PERSONAL_INFO',
      data: {
        countries: COUNTRIES_DROPDOWN
      }
    };
  }

  // Default: go to PERSONAL_INFO
  return {
    screen: 'PERSONAL_INFO',
    data: {
      countries: COUNTRIES_DROPDOWN
    }
  };
}

// --- Redis helpers ---

async function storeRegData(flowToken, data) {
  try {
    await redisService.set(`${REDIS_PREFIX}${flowToken}`, JSON.stringify(data), REDIS_TTL);
  } catch (error) {
    logToFile('⚠️ Redis store failed for registration', { flowToken, error: error.message });
  }
}

async function getRegData(flowToken) {
  try {
    const raw = await redisService.get(`${REDIS_PREFIX}${flowToken}`);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    logToFile('⚠️ Redis get failed for registration', { flowToken, error: error.message });
    return {};
  }
}

async function deleteRegData(flowToken) {
  try {
    await redisService.set(`${REDIS_PREFIX}${flowToken}`, '{}', 1);
  } catch (error) {
    logToFile('⚠️ Redis delete failed for registration', { flowToken, error: error.message });
  }
}

// --- Error helper ---

function createErrorResponse(message) {
  return {
    data: {
      error: { message }
    }
  };
}

module.exports = {
  handleRegistrationInit,
  handleRegistrationDataExchange,
  handleRegistrationBack,
  createErrorResponse
};
