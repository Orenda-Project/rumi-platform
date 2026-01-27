/**
 * API Health Aggregator Service
 * Combines data from all API health services
 */

const { getRailwayHealth } = require('./railway.service');
const { getElevenLabsHealth } = require('./elevenlabs.service');
const { getGammaHealth } = require('./gamma.service');
const { getCloudflareR2Health } = require('./cloudflare-r2.service');
const { getSupabaseHealth } = require('./supabase.service');
const { getWhatsAppHealth } = require('./whatsapp.service');
const { getOpenAIHealth } = require('./openai.service');
const { getSonioxHealth } = require('./soniox.service');
const { getUpliftHealth } = require('./uplift.service');

/**
 * Get health data for all services
 * @param {Object} db - Supabase client instance (for services with local tracking)
 */
async function getAllServicesHealth(db) {
  try {
    // Fetch all services in parallel
    const [
      railway,
      elevenlabs,
      gamma,
      cloudflareR2,
      supabase,
      whatsapp,
      openai,
      soniox,
      uplift
    ] = await Promise.all([
      getRailwayHealth(),
      getElevenLabsHealth(),
      getGammaHealth(),
      getCloudflareR2Health(),
      getSupabaseHealth(),
      getWhatsAppHealth(),
      getOpenAIHealth(),
      getSonioxHealth(db),
      getUpliftHealth(db)
    ]);

    const services = [
      railway,
      elevenlabs,
      gamma,
      cloudflareR2,
      supabase,
      whatsapp,
      openai,
      soniox,
      uplift
    ];

    // Calculate total costs
    const totalCost = services.reduce((sum, service) => {
      return sum + (parseFloat(service.cost.current) || 0);
    }, 0);

    const projectedCost = services.reduce((sum, service) => {
      return sum + (parseFloat(service.cost.projected) || 0);
    }, 0);

    // Collect warnings
    const warnings = [];
    services.forEach(service => {
      if (service.status === 'critical') {
        warnings.push(`🔴 ${service.service}: Critical - ${service.usage.percentage.toFixed(1)}% used`);
      } else if (service.status === 'warning') {
        warnings.push(`🟡 ${service.service}: Warning - ${service.usage.percentage.toFixed(1)}% used`);
      } else if (service.status === 'error') {
        warnings.push(`⚠️ ${service.service}: Error - ${service.details.error}`);
      }
    });

    // Count services by status
    const statusCounts = {
      healthy: services.filter(s => s.status === 'healthy').length,
      warning: services.filter(s => s.status === 'warning').length,
      critical: services.filter(s => s.status === 'critical').length,
      error: services.filter(s => s.status === 'error').length
    };

    return {
      totalCost: totalCost.toFixed(2),
      projectedCost: projectedCost.toFixed(2),
      services,
      warnings,
      statusCounts,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error aggregating API health data:', error);
    throw error;
  }
}

/**
 * Get health data for a specific service
 * @param {string} serviceName - Name of the service
 * @param {Object} db - Supabase client instance
 */
async function getServiceHealth(serviceName, db) {
  const serviceMap = {
    railway: getRailwayHealth,
    elevenlabs: getElevenLabsHealth,
    gamma: getGammaHealth,
    'cloudflare-r2': getCloudflareR2Health,
    supabase: getSupabaseHealth,
    whatsapp: getWhatsAppHealth,
    openai: getOpenAIHealth,
    soniox: () => getSonioxHealth(db),
    uplift: () => getUpliftHealth(db)
  };

  const serviceFunction = serviceMap[serviceName.toLowerCase()];
  if (!serviceFunction) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  return await serviceFunction();
}

module.exports = {
  getAllServicesHealth,
  getServiceHealth
};
