/**
 * Chart Service
 * Generates charts for classroom observation reports using ChartJS
 * Server-side rendering for embedding in PDF reports
 *
 * Supports two backends:
 * 1. Local canvas (chartjs-node-canvas) - Preferred, requires native dependencies
 * 2. QuickChart.io API - Fallback, works on all platforms including Windows
 *
 * The service automatically falls back to QuickChart.io when canvas is not available.
 */

const { isChartAvailable, getChartJSNodeCanvas } = require('../utils/canvas-loader');
const { logToFile } = require('../utils/logger');

// Chart configuration
const CHART_WIDTH = 600;
const CHART_HEIGHT = 400;
const BACKGROUND_COLOR = 'white';

// QuickChart.io configuration
const QUICKCHART_URL = 'https://quickchart.io/chart';

// Check canvas availability once at module load
const LOCAL_CANVAS_AVAILABLE = isChartAvailable();
if (!LOCAL_CANVAS_AVAILABLE) {
  console.warn('[chart.service] Local canvas not available - using QuickChart.io fallback');
}

/**
 * Generate chart using QuickChart.io API
 * @param {object} config - Chart.js configuration
 * @returns {Promise<string>} Base64 data URL
 */
async function generateWithQuickChart(config) {
  const url = new URL(QUICKCHART_URL);
  url.searchParams.set('c', JSON.stringify(config));
  url.searchParams.set('w', CHART_WIDTH.toString());
  url.searchParams.set('h', CHART_HEIGHT.toString());
  url.searchParams.set('bkg', BACKGROUND_COLOR);
  url.searchParams.set('f', 'png');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`QuickChart API error: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64Image = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64Image}`;
}

/**
 * Generate chart using local canvas
 * @param {object} config - Chart.js configuration
 * @returns {Promise<string>} Base64 data URL
 */
async function generateWithLocalCanvas(config) {
  const { ChartJSNodeCanvas } = getChartJSNodeCanvas();
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColour: BACKGROUND_COLOR
  });

  // Add background plugin for local rendering
  const configWithBackground = {
    ...config,
    plugins: [
      ...(config.plugins || []),
      {
        id: 'background',
        beforeDraw: (chart) => {
          const ctx = chart.ctx;
          ctx.fillStyle = BACKGROUND_COLOR;
          ctx.fillRect(0, 0, chart.width, chart.height);
        }
      }
    ]
  };

  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configWithBackground);
  const base64Image = imageBuffer.toString('base64');
  return `data:image/png;base64,${base64Image}`;
}

/**
 * Generate chart with automatic fallback
 * Uses local canvas if available, otherwise falls back to QuickChart.io
 * @param {object} config - Chart.js configuration
 * @param {string} chartName - Name for logging
 * @returns {Promise<string>} Base64 data URL
 */
async function generateChart(config, chartName) {
  if (LOCAL_CANVAS_AVAILABLE) {
    logToFile(`Generating ${chartName} with local canvas`);
    return await generateWithLocalCanvas(config);
  } else {
    logToFile(`Generating ${chartName} with QuickChart.io`);
    return await generateWithQuickChart(config);
  }
}

/**
 * Chart Service
 * Generates chart images as base64 strings for embedding in reports
 */
class ChartService {
  /**
   * Check if chart generation is available
   * @returns {boolean} True if charts can be generated (either locally or via QuickChart)
   */
  static isAvailable() {
    // Always available now - QuickChart.io is the fallback
    return true;
  }

  /**
   * Check which backend is being used
   * @returns {string} 'local' or 'quickchart'
   */
  static getBackend() {
    return LOCAL_CANVAS_AVAILABLE ? 'local' : 'quickchart';
  }

  /**
   * Generate Talk Time Pie Chart
   * Shows distribution of teacher vs student talk time
   * @param {object} talkTimeData - { teacher_percentage, student_percentage }
   * @returns {Promise<string>} Base64 image data URL
   */
  static async generateTalkTimePieChart(talkTimeData) {
    try {
      logToFile('Generating Talk Time Pie Chart', talkTimeData);

      const configuration = {
        type: 'pie',
        data: {
          labels: ['Teacher Talk Time', 'Student Talk Time'],
          datasets: [{
            data: [
              talkTimeData.teacher_percentage,
              talkTimeData.student_percentage
            ],
            backgroundColor: [
              '#4A90E2', // Blue for teacher
              '#50C878'  // Green for students
            ],
            borderColor: '#FFFFFF',
            borderWidth: 2
          }]
        },
        options: {
          responsive: false,
          plugins: {
            title: {
              display: true,
              text: 'Talk Time Distribution',
              font: {
                size: 18,
                weight: 'bold'
              },
              padding: {
                top: 10,
                bottom: 20
              }
            },
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                font: {
                  size: 14
                },
                padding: 15
              }
            }
          }
        }
      };

      const dataUrl = await generateChart(configuration, 'Talk Time Pie Chart');

      logToFile('Talk Time Pie Chart generated successfully', {
        backend: ChartService.getBackend()
      });

      return dataUrl;
    } catch (error) {
      logToFile('Error generating Talk Time Pie Chart', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate Question Types Bar Chart
   * Shows count of open-ended vs closed-ended questions
   * @param {object} questionsData - { open_ended_count, closed_ended_count }
   * @returns {Promise<string>} Base64 image data URL
   */
  static async generateQuestionTypesBarChart(questionsData) {
    try {
      logToFile('Generating Question Types Bar Chart', questionsData);

      const configuration = {
        type: 'bar',
        data: {
          labels: ['Open-Ended Questions', 'Closed-Ended Questions'],
          datasets: [{
            label: 'Number of Questions',
            data: [
              questionsData.open_ended_count,
              questionsData.closed_ended_count
            ],
            backgroundColor: [
              '#4A90E2', // Blue for open-ended
              '#FF9800'  // Orange for closed-ended
            ],
            borderColor: [
              '#3A7BC8',
              '#E68900'
            ],
            borderWidth: 2
          }]
        },
        options: {
          responsive: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
                font: {
                  size: 12
                }
              },
              title: {
                display: true,
                text: 'Count',
                font: {
                  size: 14,
                  weight: 'bold'
                }
              }
            },
            x: {
              ticks: {
                font: {
                  size: 12
                }
              }
            }
          },
          plugins: {
            title: {
              display: true,
              text: 'Questioning Techniques',
              font: {
                size: 18,
                weight: 'bold'
              },
              padding: {
                top: 10,
                bottom: 20
              }
            },
            legend: {
              display: false
            }
          }
        }
      };

      const dataUrl = await generateChart(configuration, 'Question Types Bar Chart');

      logToFile('Question Types Bar Chart generated successfully', {
        backend: ChartService.getBackend()
      });

      return dataUrl;
    } catch (error) {
      logToFile('Error generating Question Types Bar Chart', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate Scores Radar Chart
   * Shows Danielson Framework scores across domains
   * @param {object} scoresData - { planning, environment, instruction, overall }
   * @returns {Promise<string>} Base64 image data URL
   */
  static async generateScoresRadarChart(scoresData) {
    try {
      logToFile('Generating Scores Radar Chart', scoresData);

      const configuration = {
        type: 'radar',
        data: {
          labels: [
            'Planning & Preparation',
            'Classroom Environment',
            'Instruction',
            'Overall'
          ],
          datasets: [{
            label: 'Score',
            data: [
              scoresData.planning,
              scoresData.environment,
              scoresData.instruction,
              scoresData.overall
            ],
            backgroundColor: 'rgba(74, 144, 226, 0.2)',
            borderColor: '#4A90E2',
            borderWidth: 2,
            pointBackgroundColor: '#4A90E2',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#4A90E2'
          }]
        },
        options: {
          responsive: false,
          scales: {
            r: {
              beginAtZero: true,
              min: 0,
              max: 4,
              ticks: {
                stepSize: 1,
                font: {
                  size: 12
                }
              },
              pointLabels: {
                font: {
                  size: 12
                }
              }
            }
          },
          plugins: {
            title: {
              display: true,
              text: 'Danielson Framework Scores',
              font: {
                size: 18,
                weight: 'bold'
              },
              padding: {
                top: 10,
                bottom: 20
              }
            },
            legend: {
              display: false
            }
          }
        }
      };

      const dataUrl = await generateChart(configuration, 'Scores Radar Chart');

      logToFile('Scores Radar Chart generated successfully', {
        backend: ChartService.getBackend()
      });

      return dataUrl;
    } catch (error) {
      logToFile('Error generating Scores Radar Chart', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate all charts for a coaching session
   * @param {object} analysisData - Complete analysis data from GPT-5 mini
   * @returns {Promise<object>} Object with all chart data URLs
   */
  static async generateAllCharts(analysisData) {
    try {
      logToFile('Generating all charts for report', {
        hasTalkTime: !!analysisData.talk_time,
        hasQuestions: !!analysisData.questions,
        hasScores: !!analysisData.scores,
        backend: ChartService.getBackend()
      });

      const charts = {};

      // Generate Talk Time Pie Chart
      if (analysisData.talk_time) {
        charts.talkTimePie = await this.generateTalkTimePieChart(analysisData.talk_time);
      }

      // Generate Question Types Bar Chart
      if (analysisData.questions) {
        charts.questionTypesBar = await this.generateQuestionTypesBarChart(analysisData.questions);
      }

      // Generate Scores Radar Chart
      if (analysisData.scores) {
        charts.scoresRadar = await this.generateScoresRadarChart(analysisData.scores);
      }

      logToFile('All charts generated', {
        chartsGenerated: Object.keys(charts).length,
        backend: ChartService.getBackend()
      });

      return charts;
    } catch (error) {
      logToFile('Error generating all charts', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = ChartService;
