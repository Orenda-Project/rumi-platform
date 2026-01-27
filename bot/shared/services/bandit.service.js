/**
 * Bandit Service
 * Multi-Armed Bandit using Thompson Sampling for A/B testing
 *
 * Used for dynamically selecting best-performing message variants
 * in feature suggestions and other A/B tests.
 *
 * Mathematical Foundation:
 * - Each "arm" = a variant (e.g., message phrasing A, B, C)
 * - Track successes (α) and failures (β) for each arm
 * - Sample from Beta(α, β) distribution to choose arm
 * - Update α/β based on outcome (conversion or not)
 */

const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');

class BanditService {
  /**
   * Select best variant using Thompson Sampling
   * @param {string} testName - Name of the A/B test
   * @param {string} language - User's language for content selection
   * @returns {Promise<{variantName: string, content: object, testId: string}|null>}
   */
  static async selectVariant(testName, language = 'en') {
    try {
      // Get test and its variants
      const { data: test, error: testError } = await supabase
        .from('ab_tests')
        .select(`
          id,
          status,
          ab_test_variants (
            variant_name,
            variant_content,
            successes,
            failures
          )
        `)
        .eq('test_name', testName)
        .eq('status', 'active')
        .single();

      if (testError || !test) {
        logToFile('No active test found', { testName, error: testError?.message });
        return null;
      }

      const variants = test.ab_test_variants;
      if (!variants || variants.length === 0) {
        logToFile('No variants for test', { testName });
        return null;
      }

      // Thompson Sampling: Sample from Beta distribution for each variant
      const samples = variants.map(variant => ({
        ...variant,
        sample: this._sampleBeta(variant.successes || 1, variant.failures || 1)
      }));

      // Select variant with highest sample
      const selected = samples.reduce((best, current) =>
        current.sample > best.sample ? current : best
      );

      logToFile('🎰 Bandit selected variant', {
        testName,
        samples: samples.map(s => ({ name: s.variant_name, sample: s.sample.toFixed(4) })),
        selected: selected.variant_name
      });

      return {
        variantName: selected.variant_name,
        content: selected.variant_content,
        testId: test.id
      };
    } catch (error) {
      logToFile('Error in bandit selection', { error: error.message, testName });
      return null;
    }
  }

  /**
   * Get message content from variant in specified language
   * @param {object} variantContent - Variant content object with language keys
   * @param {string} language - Desired language
   * @returns {string} Message in requested language or English fallback
   */
  static getLocalizedMessage(variantContent, language = 'en') {
    if (!variantContent) return null;
    return variantContent[language] || variantContent.en || null;
  }

  /**
   * Record an impression (variant was shown to user)
   * @param {string} testId - Test UUID
   * @param {string} variantName - Variant name shown
   * @param {string} userId - User UUID (optional)
   * @param {string} phoneNumber - User phone number (optional)
   * @param {object} eventData - Additional event data (optional)
   */
  static async recordImpression(testId, variantName, userId = null, phoneNumber = null, eventData = {}) {
    try {
      // Increment impressions on variant
      await supabase.rpc('increment_variant_impressions', {
        p_test_id: testId,
        p_variant_name: variantName
      }).catch(() => {
        // Fallback if RPC doesn't exist - manual update
        return this._incrementField(testId, variantName, 'impressions');
      });

      // Log event
      await supabase.from('ab_test_events').insert({
        test_id: testId,
        variant_name: variantName,
        user_id: userId,
        phone_number: phoneNumber,
        event_type: 'impression',
        event_data: eventData
      });

      logToFile('📊 Bandit impression recorded', { testId, variantName });
    } catch (error) {
      logToFile('Error recording impression', { error: error.message });
    }
  }

  /**
   * Record a conversion (user engaged with the suggestion)
   * @param {string} testId - Test UUID
   * @param {string} variantName - Variant name that converted
   * @param {string} userId - User UUID (optional)
   * @param {string} phoneNumber - User phone number (optional)
   * @param {object} eventData - Additional event data (optional)
   */
  static async recordConversion(testId, variantName, userId = null, phoneNumber = null, eventData = {}) {
    try {
      // Update successes (α) for Beta distribution
      await this._incrementField(testId, variantName, 'successes');
      await this._incrementField(testId, variantName, 'conversions');

      // Log event
      await supabase.from('ab_test_events').insert({
        test_id: testId,
        variant_name: variantName,
        user_id: userId,
        phone_number: phoneNumber,
        event_type: 'conversion',
        event_data: eventData
      });

      logToFile('✅ Bandit conversion recorded', { testId, variantName });
    } catch (error) {
      logToFile('Error recording conversion', { error: error.message });
    }
  }

  /**
   * Record a non-conversion (user did not engage)
   * @param {string} testId - Test UUID
   * @param {string} variantName - Variant name that didn't convert
   * @param {string} userId - User UUID (optional)
   * @param {string} phoneNumber - User phone number (optional)
   */
  static async recordNonConversion(testId, variantName, userId = null, phoneNumber = null) {
    try {
      // Update failures (β) for Beta distribution
      await this._incrementField(testId, variantName, 'failures');

      // Log event
      await supabase.from('ab_test_events').insert({
        test_id: testId,
        variant_name: variantName,
        user_id: userId,
        phone_number: phoneNumber,
        event_type: 'bounce',
        event_data: {}
      });

      logToFile('📉 Bandit non-conversion recorded', { testId, variantName });
    } catch (error) {
      logToFile('Error recording non-conversion', { error: error.message });
    }
  }

  /**
   * Get statistics for a test
   * @param {string} testName - Name of the test
   * @returns {Promise<object>} Test statistics with variants
   */
  static async getTestStats(testName) {
    try {
      const { data: test, error } = await supabase
        .from('ab_tests')
        .select(`
          *,
          ab_test_variants (*)
        `)
        .eq('test_name', testName)
        .single();

      if (error) throw error;

      // Calculate conversion rates and confidence
      const variants = test.ab_test_variants.map(v => ({
        ...v,
        conversionRate: v.impressions > 0 ? (v.conversions / v.impressions * 100).toFixed(2) : 0,
        confidence: this._wilsonScore(v.conversions, v.impressions)
      }));

      return {
        ...test,
        ab_test_variants: variants
      };
    } catch (error) {
      logToFile('Error getting test stats', { error: error.message, testName });
      return null;
    }
  }

  /**
   * Sample from Beta distribution using Box-Muller approximation
   * @private
   */
  static _sampleBeta(alpha, beta) {
    // Use Gamma distribution to sample from Beta
    // Beta(α, β) = Gamma(α) / (Gamma(α) + Gamma(β))
    const gammaAlpha = this._sampleGamma(alpha);
    const gammaBeta = this._sampleGamma(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  /**
   * Sample from Gamma distribution using Marsaglia-Tsang method
   * @private
   */
  static _sampleGamma(shape) {
    if (shape < 1) {
      // For shape < 1, use: Gamma(a) = Gamma(a+1) * U^(1/a)
      return this._sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this._normalRandom();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * Generate standard normal random using Box-Muller
   * @private
   */
  static _normalRandom() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Calculate Wilson score confidence interval
   * @private
   */
  static _wilsonScore(successes, total, z = 1.96) {
    if (total === 0) return { lower: 0, upper: 0, score: 0 };

    const p = successes / total;
    const n = total;

    const denominator = 1 + z * z / n;
    const centre = p + z * z / (2 * n);
    const adjustment = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);

    const lower = Math.max(0, (centre - adjustment) / denominator);
    const upper = Math.min(1, (centre + adjustment) / denominator);
    const score = lower; // Wilson lower bound is common ranking metric

    return {
      lower: (lower * 100).toFixed(2),
      upper: (upper * 100).toFixed(2),
      score: (score * 100).toFixed(2)
    };
  }

  /**
   * Increment a field on a variant
   * @private
   */
  static async _incrementField(testId, variantName, field) {
    const { data: variant } = await supabase
      .from('ab_test_variants')
      .select(field)
      .eq('test_id', testId)
      .eq('variant_name', variantName)
      .single();

    if (variant) {
      await supabase
        .from('ab_test_variants')
        .update({
          [field]: (variant[field] || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('test_id', testId)
        .eq('variant_name', variantName);
    }
  }
}

module.exports = BanditService;
