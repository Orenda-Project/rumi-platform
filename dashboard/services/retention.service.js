/**
 * Retention Analytics Service
 * Calculates cohort retention rates for Digital Coach platform with RLS enforcement
 *
 * Key Concepts:
 * - Retention: Did user return to platform? (Day 0 = 100%, Week 1+ = % returned)
 * - Activation: Did user use features on Day 0? (separate metric)
 * - Cohorts: Weekly groups of users by registration date
 *
 * Performance: Uses materialized views when available (bd-044)
 */

const materializedViews = require('./materialized-views.service');

/**
 * Calculate retention data for all cohorts
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @param {string} featureType - 'overall', 'coaching', 'lesson_plans', 'reading'
 * @param {number} weeksBack - How many weeks of cohorts to include (default 12)
 * @param {string} startDate - Optional filter start date (YYYY-MM-DD)
 * @param {string} endDate - Optional filter end date (YYYY-MM-DD)
 * @returns {Promise<Object>} { cohorts: [], summary: {} }
 */
async function getRetentionData(
  dbClient,
  featureType = 'overall',
  weeksBack = 12,
  startDate = null,
  endDate = null
) {
  try {
    // Try materialized view first for 'overall' without date filters (bd-044)
    // MV is ~527x faster (0.6ms vs 317ms)
    const mvStart = Date.now();
    console.log(`[Retention] Checking MV: featureType=${featureType}, startDate=${startDate}, endDate=${endDate}`);

    if (featureType === 'overall' && !startDate && !endDate) {
      console.log('[Retention] MV conditions met, attempting MV query...');
      const mvData = await materializedViews.getRetentionFromView(dbClient, featureType);
      console.log(`[Retention] MV query returned ${mvData ? mvData.length : 'null'} rows in ${Date.now() - mvStart}ms`);

      if (mvData && mvData.length > 0) {
        console.log('[Retention] Using materialized view (bd-044)');
        // Transform MV data to match expected format
        const cohorts = mvData.map(cohort => ({
          cohortWeek: cohort.cohort_week,
          cohortSize: cohort.cohort_size,
          day0Pct: 100.0,
          day0ActivationPct: parseFloat(cohort.day0_activation_pct || 0),
          week1Pct: parseFloat(cohort.week1_pct || 0),
          week2Pct: parseFloat(cohort.week2_pct || 0),
          week3Pct: parseFloat(cohort.week3_pct || 0),
          week4Pct: parseFloat(cohort.week4_pct || 0),
          week5_8Pct: 0, // Not in MV yet
          week9_12Pct: 0, // Not in MV yet
          week1Users: cohort.week1_users,
          week2Users: cohort.week2_users,
          week3Users: cohort.week3_users,
          week4Users: cohort.week4_users,
          hasWeek2Data: cohort.has_week2_data,
          hasWeek3Data: cohort.has_week3_data,
          hasWeek4Data: cohort.has_week4_data,
          hasWeek5_8Data: false,
          hasWeek9_12Data: false
        }));
        const summary = calculateSummaryStats(cohorts);
        return { cohorts, summary };
      }
    }

    // Fallback to calculate_retention() RPC function
    const fallbackReason = featureType !== 'overall' ? 'featureType not overall'
      : startDate ? 'startDate filter provided'
      : endDate ? 'endDate filter provided'
      : 'MV returned no data';
    console.log(`[Retention] Using calculate_retention() fallback (reason: ${fallbackReason})`);

    // Calculate date range
    const endDateCutoff = endDate || new Date().toISOString().split('T')[0];
    const startDateCutoff = startDate || new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Call the retention RPC function with RLS context
    const result = await dbClient.query(`
      SELECT * FROM calculate_retention($1, $2, $3)
    `, [featureType, startDateCutoff, endDateCutoff]);

    const data = result.rows;

    // Transform data for frontend
    const cohorts = (data || []).map(cohort => ({
      cohortWeek: cohort.cohort_week,
      cohortSize: cohort.cohort_size,

      // Retention percentages (Day 0 always 100%)
      day0Pct: 100.0,
      week1Pct: parseFloat(cohort.week1_pct || 0),
      week2Pct: parseFloat(cohort.week2_pct || 0),
      week3Pct: parseFloat(cohort.week3_pct || 0),
      week4Pct: parseFloat(cohort.week4_pct || 0),
      week5_8Pct: parseFloat(cohort.week5_8_pct || 0),
      week9_12Pct: parseFloat(cohort.week9_12_pct || 0),

      // Activation metrics (feature usage on Day 0)
      day0ActivationPct: parseFloat(cohort.day0_activation_pct || 0),

      // Raw counts
      week1Users: cohort.week1_users,
      week2Users: cohort.week2_users,
      week3Users: cohort.week3_users,
      week4Users: cohort.week4_users,

      // Maturity flags (for N/A display)
      hasWeek2Data: cohort.has_week2_data,
      hasWeek3Data: cohort.has_week3_data,
      hasWeek4Data: cohort.has_week4_data,
      hasWeek5_8Data: cohort.has_week5_8_data,
      hasWeek9_12Data: cohort.has_week9_12_data
    }));

    // Calculate summary statistics
    const summary = calculateSummaryStats(cohorts);

    return { cohorts, summary };
  } catch (error) {
    console.error('getRetentionData error:', error);
    throw error;
  }
}

/**
 * Calculate summary statistics across all cohorts
 * @param {Array} cohorts - Cohort retention data
 * @returns {Object} Summary metrics
 */
function calculateSummaryStats(cohorts) {
  if (!cohorts || cohorts.length === 0) {
    return {
      avgCohortSize: 0,
      avgWeek1Retention: 0,
      avgWeek4Retention: 0,
      avgDay0Activation: 0,
      totalUsers: 0,
      activeCohorts: 0
    };
  }

  const matureCohorts = cohorts.filter(c => c.hasWeek2Data); // At least 2 weeks old
  const veryMatureCohorts = cohorts.filter(c => c.hasWeek4Data); // At least 4 weeks old

  return {
    avgCohortSize: Math.round(cohorts.reduce((sum, c) => sum + c.cohortSize, 0) / cohorts.length),
    avgWeek1Retention: matureCohorts.length > 0
      ? Math.round(matureCohorts.reduce((sum, c) => sum + c.week1Pct, 0) / matureCohorts.length * 10) / 10
      : 0,
    avgWeek4Retention: veryMatureCohorts.length > 0
      ? Math.round(veryMatureCohorts.reduce((sum, c) => sum + c.week4Pct, 0) / veryMatureCohorts.length * 10) / 10
      : 0,
    avgDay0Activation: Math.round(cohorts.reduce((sum, c) => sum + c.day0ActivationPct, 0) / cohorts.length * 10) / 10,
    totalUsers: cohorts.reduce((sum, c) => sum + c.cohortSize, 0),
    activeCohorts: cohorts.length
  };
}

/**
 * Get retention curve data for Chart.js visualization
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @param {string} featureType - 'overall', 'coaching', 'lesson_plans', 'reading'
 * @param {Array} cohortWeeks - Specific cohorts to include (optional, max 5 for readability)
 * @param {number} weeksBack - How many weeks of cohorts (default 12)
 * @param {Array} precomputedCohorts - Optional pre-computed cohorts to avoid re-fetching (bd-044)
 * @returns {Promise<Object>} Chart.js compatible dataset
 */
async function getRetentionCurve(dbClient, featureType = 'overall', cohortWeeks = null, weeksBack = 12, precomputedCohorts = null) {
  try {
    // Use pre-computed cohorts if provided (bd-044 optimization)
    let cohorts;
    if (precomputedCohorts) {
      console.log('[Retention] getRetentionCurve using pre-computed cohorts (bd-044)');
      cohorts = precomputedCohorts;
    } else {
      // Get full retention data
      const result = await getRetentionData(dbClient, featureType, weeksBack);
      cohorts = result.cohorts;
    }

    // Filter to specific cohorts if provided
    let selectedCohorts = cohorts;
    if (cohortWeeks && cohortWeeks.length > 0) {
      selectedCohorts = cohorts.filter(c => cohortWeeks.includes(c.cohortWeek));
    } else {
      // Default: Show 3 most recent cohorts + average
      selectedCohorts = cohorts.slice(0, 3);
    }

    // Prepare labels (time periods)
    const labels = ['Day 0', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5-8', 'Week 9-12'];

    // Color palette for cohort lines
    const colors = [
      '#6366F1', // Indigo
      '#10B981', // Green
      '#8B5CF6', // Violet
      '#EC4899', // Pink
      '#F59E0B'  // Amber
    ];

    // Build datasets for each cohort
    const datasets = selectedCohorts.map((cohort, idx) => {
      const data = [
        100, // Day 0 always 100%
        cohort.week1Pct,
        cohort.hasWeek2Data ? cohort.week2Pct : null,
        cohort.hasWeek3Data ? cohort.week3Pct : null,
        cohort.hasWeek4Data ? cohort.week4Pct : null,
        cohort.hasWeek5_8Data ? cohort.week5_8Pct : null,
        cohort.hasWeek9_12Data ? cohort.week9_12Pct : null
      ];

      return {
        label: `${formatCohortWeek(cohort.cohortWeek)} (${cohort.cohortSize} users)`,
        data,
        borderColor: colors[idx % colors.length],
        backgroundColor: colors[idx % colors.length] + '33', // 20% opacity
        tension: 0.3, // Smooth curves
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: false // Don't connect gaps (N/A periods)
      };
    });

    // Add average line calculated from ALL cohorts (not just selected ones)
    // This ensures the average includes mature cohorts for Week 4+ data
    if (cohorts.length > 1) {
      const avgData = labels.map((_, idx) => {
        if (idx === 0) return 100; // Day 0

        // Use ALL cohorts for average calculation, not just selectedCohorts
        const validCohorts = cohorts.filter(c => {
          if (idx === 1) return true; // Week 1 always valid
          if (idx === 2) return c.hasWeek2Data;
          if (idx === 3) return c.hasWeek3Data;
          if (idx === 4) return c.hasWeek4Data;
          if (idx === 5) return c.hasWeek5_8Data;
          if (idx === 6) return c.hasWeek9_12Data;
          return false;
        });

        if (validCohorts.length === 0) return null;

        const sum = validCohorts.reduce((total, c) => {
          if (idx === 1) return total + c.week1Pct;
          if (idx === 2) return total + c.week2Pct;
          if (idx === 3) return total + c.week3Pct;
          if (idx === 4) return total + c.week4Pct;
          if (idx === 5) return total + c.week5_8Pct;
          if (idx === 6) return total + c.week9_12Pct;
          return total;
        }, 0);

        return Math.round(sum / validCohorts.length * 10) / 10;
      });

      datasets.push({
        label: 'Average Across Cohorts',
        data: avgData,
        borderColor: '#64748B', // Slate
        backgroundColor: '#64748B33',
        borderDash: [5, 5], // Dashed line
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        spanGaps: false
      });
    }

    return {
      labels,
      datasets
    };
  } catch (error) {
    console.error('getRetentionCurve error:', error);
    throw error;
  }
}

/**
 * Compare two specific cohorts side-by-side
 * @param {string} cohort1Week - First cohort week (YYYY-MM-DD format)
 * @param {string} cohort2Week - Second cohort week (YYYY-MM-DD format)
 * @param {string} featureType - 'overall', 'coaching', 'lesson_plans', 'reading'
 * @returns {Promise<Object>} Comparison metrics
 */
async function compareCohorts(cohort1Week, cohort2Week, featureType = 'overall') {
  try {
    const { cohorts } = await getRetentionData(featureType, 52); // Get up to 1 year of data

    const cohort1 = cohorts.find(c => c.cohortWeek === cohort1Week);
    const cohort2 = cohorts.find(c => c.cohortWeek === cohort2Week);

    if (!cohort1 || !cohort2) {
      throw new Error('One or both cohorts not found');
    }

    // Calculate percentage point differences
    const comparison = {
      cohort1: {
        week: formatCohortWeek(cohort1.cohortWeek),
        size: cohort1.cohortSize,
        day0Activation: cohort1.day0ActivationPct,
        week1Retention: cohort1.week1Pct,
        week2Retention: cohort1.week2Pct,
        week3Retention: cohort1.week3Pct,
        week4Retention: cohort1.week4Pct
      },
      cohort2: {
        week: formatCohortWeek(cohort2.cohortWeek),
        size: cohort2.cohortSize,
        day0Activation: cohort2.day0ActivationPct,
        week1Retention: cohort2.week1Pct,
        week2Retention: cohort2.week2Pct,
        week3Retention: cohort2.week3Pct,
        week4Retention: cohort2.week4Pct
      },
      differences: {
        sizeChange: cohort2.cohortSize - cohort1.cohortSize,
        day0ActivationChange: Math.round((cohort2.day0ActivationPct - cohort1.day0ActivationPct) * 10) / 10,
        week1RetentionChange: Math.round((cohort2.week1Pct - cohort1.week1Pct) * 10) / 10,
        week2RetentionChange: cohort2.hasWeek2Data && cohort1.hasWeek2Data
          ? Math.round((cohort2.week2Pct - cohort1.week2Pct) * 10) / 10
          : null,
        week3RetentionChange: cohort2.hasWeek3Data && cohort1.hasWeek3Data
          ? Math.round((cohort2.week3Pct - cohort1.week3Pct) * 10) / 10
          : null,
        week4RetentionChange: cohort2.hasWeek4Data && cohort1.hasWeek4Data
          ? Math.round((cohort2.week4Pct - cohort1.week4Pct) * 10) / 10
          : null
      }
    };

    return comparison;
  } catch (error) {
    console.error('compareCohorts error:', error);
    throw error;
  }
}

/**
 * Get overall retention summary for dashboard cards
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @param {number} weeksBack - How many weeks to analyze (default 12)
 * @param {Object} precomputedData - Optional pre-computed { cohorts, summary } to avoid re-fetching (bd-044)
 * @returns {Promise<Object>} Summary statistics
 */
async function getRetentionSummary(dbClient, weeksBack = 12, precomputedData = null) {
  try {
    // Use pre-computed data if provided (bd-044 optimization)
    let cohorts, summary;
    if (precomputedData) {
      console.log('[Retention] getRetentionSummary using pre-computed data (bd-044)');
      cohorts = precomputedData.cohorts;
      summary = precomputedData.summary;
    } else {
      const result = await getRetentionData(dbClient, 'overall', weeksBack);
      cohorts = result.cohorts;
      summary = result.summary;
    }

    // Calculate trends (compare last 4 weeks vs previous 4 weeks)
    const recent4Weeks = cohorts.slice(0, 4);
    const previous4Weeks = cohorts.slice(4, 8);

    const recentAvgWeek1 = recent4Weeks.length > 0
      ? recent4Weeks.reduce((sum, c) => sum + c.week1Pct, 0) / recent4Weeks.length
      : 0;

    const previousAvgWeek1 = previous4Weeks.length > 0
      ? previous4Weeks.reduce((sum, c) => sum + c.week1Pct, 0) / previous4Weeks.length
      : 0;

    const week1Trend = Math.round((recentAvgWeek1 - previousAvgWeek1) * 10) / 10;

    const recentAvgActivation = recent4Weeks.length > 0
      ? recent4Weeks.reduce((sum, c) => sum + c.day0ActivationPct, 0) / recent4Weeks.length
      : 0;

    const previousAvgActivation = previous4Weeks.length > 0
      ? previous4Weeks.reduce((sum, c) => sum + c.day0ActivationPct, 0) / previous4Weeks.length
      : 0;

    const activationTrend = Math.round((recentAvgActivation - previousAvgActivation) * 10) / 10;

    return {
      ...summary,
      week1Trend, // Percentage point change vs previous 4 weeks
      activationTrend,
      latestCohortSize: cohorts[0]?.cohortSize || 0,
      latestCohortWeek: cohorts[0]?.cohortWeek || null
    };
  } catch (error) {
    console.error('getRetentionSummary error:', error);
    throw error;
  }
}

/**
 * Format cohort week for display
 * @param {string} cohortWeek - ISO date string (YYYY-MM-DD)
 * @returns {string} Formatted string "Week of Nov 10, 2025"
 */
function formatCohortWeek(cohortWeek) {
  const date = new Date(cohortWeek);
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return `Week of ${date.toLocaleDateString('en-US', options)}`;
}

/**
 * Get color class for retention percentage (heatmap cells)
 * @param {number} percentage - Retention percentage (0-100)
 * @returns {string} CSS class name
 */
function getRetentionColorClass(percentage) {
  if (percentage === null || percentage === undefined) return 'retention-cell-na';
  if (percentage >= 50) return 'retention-cell-excellent';
  if (percentage >= 40) return 'retention-cell-good';
  if (percentage >= 30) return 'retention-cell-moderate';
  if (percentage >= 20) return 'retention-cell-fair';
  if (percentage >= 10) return 'retention-cell-poor';
  return 'retention-cell-critical';
}

module.exports = {
  getRetentionData,
  getRetentionCurve,
  compareCohorts,
  getRetentionSummary,
  formatCohortWeek,
  getRetentionColorClass
};
