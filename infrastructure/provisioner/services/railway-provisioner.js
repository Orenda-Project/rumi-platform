/**
 * Railway Provisioner Service
 * Handles Railway project creation via GraphQL API
 *
 * bd-342: Create project, add Redis plugin, get connection string
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
   * @returns {Promise<string>} Redis connection URL
   */
  async getRedisConnectionString(serviceId, environmentId) {
    const query = `
      query GetVariables($serviceId: String!, $environmentId: String!) {
        variables(serviceId: $serviceId, environmentId: $environmentId)
      }
    `;

    const data = await this.graphql(query, { serviceId, environmentId });

    if (!data.variables || !data.variables.REDIS_URL) {
      // For self-deployed Redis, construct the URL
      // Railway generates internal URLs like redis.railway.internal:6379
      throw new Error('Redis URL not found - service may still be deploying');
    }

    return data.variables.REDIS_URL;
  }

  /**
   * Get Railway project dashboard URL
   * @param {string} projectId - Railway project ID
   * @returns {string} Dashboard URL
   */
  getProjectUrl(projectId) {
    return `https://railway.com/project/${projectId}`;
  }
}

module.exports = RailwayProvisioner;
