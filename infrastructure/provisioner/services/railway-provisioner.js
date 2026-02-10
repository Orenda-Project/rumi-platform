/**
 * Railway Provisioner Service
 * Handles Railway project creation via GraphQL API
 *
 * bd-342: Create project, add Redis plugin, get connection string
 * bd-211: Create bot service, domain, and project token for clone users
 */

const fetch = require('node-fetch');

class RailwayProvisioner {
  constructor() {
    this.teamToken = process.env.RAILWAY_TEAM_TOKEN;
    this.apiUrl = 'https://backboard.railway.com/graphql/v2';

    if (!this.teamToken) {
      throw new Error('RAILWAY_TEAM_TOKEN is required');
    }
  }

  /**
   * Execute a GraphQL query/mutation
   * @param {string} query - GraphQL query
   * @param {Object} variables - Query variables
   * @returns {Promise<Object>} Query result
   */
  async graphql(query, variables = {}) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.teamToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  /**
   * Create a new Railway project
   * @param {string} name - Deployment name
   * @returns {Promise<Object>} Created project details
   */
  async createProject(name) {
    const projectName = `rumi-${name}`;

    const query = `
      mutation ProjectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
        }
      }
    `;

    try {
      const data = await this.graphql(query, {
        input: {
          name: projectName,
          isPublic: false
        }
      });

      if (!data.projectCreate) {
        throw new Error('Project creation returned empty response');
      }

      return data.projectCreate;
    } catch (error) {
      throw new Error(`Failed to create Railway project: ${error.message}`);
    }
  }

  /**
   * Get environments for a project
   * @param {string} projectId - Railway project ID
   * @returns {Promise<Array>} List of environments
   */
  async getEnvironments(projectId) {
    const query = `
      query GetProject($projectId: String!) {
        project(id: $projectId) {
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql(query, { projectId });
    return data.project.environments.edges.map(e => e.node);
  }

  /**
   * Add Redis plugin to a project
   * @param {string} projectId - Railway project ID
   * @returns {Promise<Object>} Redis service details
   */
  async addRedisPlugin(projectId) {
    // First, get the production environment
    const environments = await this.getEnvironments(projectId);
    const prodEnv = environments.find(e => e.name === 'production') || environments[0];

    if (!prodEnv) {
      throw new Error('No environment found for project');
    }

    // Create Redis service
    const query = `
      mutation ServiceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
        }
      }
    `;

    const data = await this.graphql(query, {
      input: {
        projectId: projectId,
        name: 'redis',
        source: { image: 'redis:7-alpine' }
      }
    });

    if (!data.serviceCreate) {
      throw new Error('Redis service creation returned empty response');
    }

    return {
      serviceId: data.serviceCreate.id,
      environmentId: prodEnv.id
    };
  }

  /**
   * Get Redis connection string from service variables
   * @param {string} serviceId - Redis service ID
   * @param {string} environmentId - Environment ID
   * @param {string} projectId - Project ID
   * @returns {Promise<string>} Redis connection URL
   */
  async getRedisConnectionString(serviceId, environmentId, projectId) {
    // For self-deployed Redis images, Railway uses internal networking
    // The service name becomes the hostname within the project
    // Format: redis.railway.internal:6379

    // Try to get variables if available
    try {
      const query = `
        query GetVariables($projectId: String!, $serviceId: String!, $environmentId: String!) {
          variables(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId)
        }
      `;

      const data = await this.graphql(query, { projectId, serviceId, environmentId });

      if (data.variables && data.variables.REDIS_URL) {
        return data.variables.REDIS_URL;
      }
    } catch (error) {
      // Variables may not be available yet, use internal URL
      console.log('Variables not available yet, using internal URL');
    }

    // Return internal Railway URL for Redis
    // This works within the Railway private network
    return 'redis://redis.railway.internal:6379';
  }

  /**
   * Get Railway project dashboard URL
   * @param {string} projectId - Railway project ID
   * @returns {string} Dashboard URL
   */
  getProjectUrl(projectId) {
    return `https://railway.com/project/${projectId}`;
  }

  /**
   * Create the main bot service (empty - user deploys code to it)
   * @param {string} projectId - Railway project ID
   * @returns {Promise<Object>} Bot service details with serviceId and environmentId
   */
  async createBotService(projectId) {
    // First, get the production environment
    const environments = await this.getEnvironments(projectId);
    const prodEnv = environments.find(e => e.name === 'production') || environments[0];

    if (!prodEnv) {
      throw new Error('No environment found for project');
    }

    // Create empty bot service (user will deploy code to it)
    const query = `
      mutation ServiceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `;

    const data = await this.graphql(query, {
      input: {
        projectId: projectId,
        name: 'bot'
      }
    });

    if (!data.serviceCreate) {
      throw new Error('Bot service creation returned empty response');
    }

    return {
      serviceId: data.serviceCreate.id,
      environmentId: prodEnv.id,
      serviceName: data.serviceCreate.name
    };
  }

  /**
   * Create a Railway-provided domain for a service
   * @param {string} serviceId - Service ID
   * @param {string} environmentId - Environment ID
   * @param {number} targetPort - Port to expose (default: 3000)
   * @returns {Promise<Object>} Domain details including the full URL
   */
  async createServiceDomain(serviceId, environmentId, targetPort = 3000) {
    const query = `
      mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          id
          domain
          targetPort
        }
      }
    `;

    const data = await this.graphql(query, {
      input: {
        serviceId: serviceId,
        environmentId: environmentId,
        targetPort: targetPort
      }
    });

    if (!data.serviceDomainCreate) {
      throw new Error('Domain creation returned empty response');
    }

    return {
      domainId: data.serviceDomainCreate.id,
      domain: data.serviceDomainCreate.domain,
      url: `https://${data.serviceDomainCreate.domain}`,
      webhookUrl: `https://${data.serviceDomainCreate.domain}/webhook`,
      targetPort: data.serviceDomainCreate.targetPort
    };
  }

  /**
   * Create a project token for deployment access
   * This allows users to deploy to the project without being team members
   * @param {string} projectId - Project ID
   * @param {string} environmentId - Environment ID
   * @param {string} tokenName - Name for the token
   * @returns {Promise<Object>} Token details
   */
  async createProjectToken(projectId, environmentId, tokenName) {
    // Railway API returns projectTokenCreate as a String! (the token directly)
    const query = `
      mutation ProjectTokenCreate($input: ProjectTokenCreateInput!) {
        projectTokenCreate(input: $input)
      }
    `;

    const data = await this.graphql(query, {
      input: {
        projectId: projectId,
        environmentId: environmentId,
        name: tokenName
      }
    });

    if (!data.projectTokenCreate) {
      throw new Error('Project token creation returned empty response');
    }

    return {
      tokenId: null,
      tokenName: tokenName,
      token: data.projectTokenCreate
    };
  }

  /**
   * Set environment variables for a service
   * @param {string} projectId - Project ID
   * @param {string} serviceId - Service ID
   * @param {string} environmentId - Environment ID
   * @param {Object} variables - Key-value pairs of environment variables
   * @returns {Promise<boolean>} True if successful
   */
  async setServiceVariables(projectId, serviceId, environmentId, variables) {
    const query = `
      mutation VariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `;

    await this.graphql(query, {
      input: {
        projectId: projectId,
        serviceId: serviceId,
        environmentId: environmentId,
        variables: variables
      }
    });

    return true;
  }

  /**
   * Full provisioning: Create project with bot service, domain, and deployment token
   * @param {string} name - Deployment name
   * @returns {Promise<Object>} Complete provisioning result
   */
  async provisionComplete(name) {
    console.log(`Starting complete Railway provisioning for: ${name}`);

    // Step 1: Create project
    const project = await this.createProject(name);
    console.log(`Created project: ${project.id}`);

    // Step 2: Create bot service
    const botService = await this.createBotService(project.id);
    console.log(`Created bot service: ${botService.serviceId}`);

    // Step 3: Create domain for bot service
    const domain = await this.createServiceDomain(
      botService.serviceId,
      botService.environmentId,
      3000
    );
    console.log(`Created domain: ${domain.domain}`);

    // Step 4: Create Redis service
    const redis = await this.addRedisPlugin(project.id);
    console.log(`Created Redis service: ${redis.serviceId}`);

    // Step 5: Create project token for user deployment
    const token = await this.createProjectToken(
      project.id,
      botService.environmentId,
      `${name}-deploy-token`
    );
    console.log(`Created project token: ${token.tokenName}`);

    // Step 6: Get Redis connection string
    const redisUrl = await this.getRedisConnectionString(
      redis.serviceId,
      redis.environmentId,
      project.id
    );

    return {
      project: {
        id: project.id,
        name: project.name,
        url: this.getProjectUrl(project.id)
      },
      botService: {
        id: botService.serviceId,
        name: botService.serviceName,
        environmentId: botService.environmentId
      },
      domain: {
        url: domain.url,
        webhookUrl: domain.webhookUrl,
        domain: domain.domain
      },
      redis: {
        serviceId: redis.serviceId,
        url: redisUrl
      },
      deployToken: {
        token: token.token,
        name: token.tokenName,
        usage: `cd bot && RAILWAY_TOKEN=${token.token} railway up --service bot`
      }
    };
  }
}

module.exports = RailwayProvisioner;
