/**
 * Chart Service
 * Generates charts for classroom observation reports using ChartJS
 * Server-side rendering for embedding in PDF reports
 *
 * NOTE: This service requires the 'canvas' module which has native dependencies.
 * If canvas is not installed, chart generation will be disabled and null will be returned.
 * See shared/utils/canvas-loader.js for installation instructions.
 */

const { isChartAvailable, getChartJSNodeCanvas } = require('../utils/canvas-loader');
const { logToFile } = require('../utils/logger');

// Chart configuration
const CHART_WIDTH = 600;
const CHART_HEIGHT = 400;
const BACKGROUND_COLOR = 'white';

// Check canvas availability once at module load
const CHARTS_ENABLED = isChartAvailable();
if (!CHARTS_ENABLED) {
  console.warn('[chart.service] Chart generation disabled - canvas module not available');
}

/**
 * Chart Service
 * Generates chart images as base64 strings for embedding in reports
 */
class ChartService {
  /**
   * Generate Talk Time Pie Chart
   * Shows distribution of teacher vs student talk time
   * @param {object} talkTimeData - { teacher_percentage, student_percentage }
   * @returns {Promise<string|null>} Base64 image data URL, or null if canvas not available
   */
  static async generateTalkTimePieChart(talkTimeData) {
    if (!CHARTS_ENABLED) {
      logToFile('Chart generation skipped - canvas not available');
      return null;
    }

    try {
      logToFile('Generating Talk Time Pie Chart', talkTimeData);

      const { ChartJSNodeCanvas } = getChartJSNodeCanvas();
      const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: CHART_WIDTH,
        height: CHART_HEIGHT,
        backgroundColour: BACKGROUND_COLOR
      });

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
            },
            tooltip: {
              enabled: true,
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  return `${label}: ${value.toFixed(1)}%`;
                }
              }
            }
          }
        },
        plugins: [{
          id: 'background',
          beforeDraw: (chart) => {
            const ctx = chart.ctx;
            ctx.fillStyle = BACKGROUND_COLOR;
            ctx.fillRect(0, 0, chart.width, chart.height);
          }
        }]
      };

      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64Image}`;

      logToFile('✅ Talk Time Pie Chart generated', {
        size: imageBuffer.length
      });

      return dataUrl;
    } catch (error) {
      logToFile('❌ Error generating Talk Time Pie Chart', {
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
   * @returns {Promise<string|null>} Base64 image data URL, or null if canvas not available
   */
  static async generateQuestionTypesBarChart(questionsData) {
    if (!CHARTS_ENABLED) {
      logToFile('Chart generation skipped - canvas not available');
      return null;
    }

    try {
      logToFile('Generating Question Types Bar Chart', questionsData);

      const { ChartJSNodeCanvas } = getChartJSNodeCanvas();
      const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: CHART_WIDTH,
        height: CHART_HEIGHT,
        backgroundColour: BACKGROUND_COLOR
      });

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
            },
            tooltip: {
              enabled: true,
              callbacks: {
                label: function(context) {
                  const value = context.parsed.y || 0;
                  return `Count: ${value}`;
                }
              }
            }
          }
        },
        plugins: [{
          id: 'background',
          beforeDraw: (chart) => {
            const ctx = chart.ctx;
            ctx.fillStyle = BACKGROUND_COLOR;
            ctx.fillRect(0, 0, chart.width, chart.height);
          }
        }]
      };

      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64Image}`;

      logToFile('✅ Question Types Bar Chart generated', {
        size: imageBuffer.length
      });

      return dataUrl;
    } catch (error) {
      logToFile('❌ Error generating Question Types Bar Chart', {
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
   * @returns {Promise<string|null>} Base64 image data URL, or null if canvas not available
   */
  static async generateScoresRadarChart(scoresData) {
    if (!CHARTS_ENABLED) {
      logToFile('Chart generation skipped - canvas not available');
      return null;
    }

    try {
      logToFile('Generating Scores Radar Chart', scoresData);

      const { ChartJSNodeCanvas } = getChartJSNodeCanvas();
      const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: CHART_WIDTH,
        height: CHART_HEIGHT,
        backgroundColour: BACKGROUND_COLOR
      });

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
                },
                callback: function(value) {
                  const labels = ['', 'Unsatisfactory', 'Basic', 'Proficient', 'Distinguished'];
                  return labels[value] || value;
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
            },
            tooltip: {
              enabled: true,
              callbacks: {
                label: function(context) {
                  const value = context.parsed.r || 0;
                  const labels = ['', 'Unsatisfactory', 'Basic', 'Proficient', 'Distinguished'];
                  return `Score: ${value} (${labels[Math.round(value)] || ''})`;
                }
              }
            }
          }
        },
        plugins: [{
          id: 'background',
          beforeDraw: (chart) => {
            const ctx = chart.ctx;
            ctx.fillStyle = BACKGROUND_COLOR;
            ctx.fillRect(0, 0, chart.width, chart.height);
          }
        }]
      };

      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64Image}`;

      logToFile('✅ Scores Radar Chart generated', {
        size: imageBuffer.length
      });

      return dataUrl;
    } catch (error) {
      logToFile('❌ Error generating Scores Radar Chart', {
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
        hasScores: !!analysisData.scores
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

      logToFile('✅ All charts generated', {
        chartsGenerated: Object.keys(charts).length
      });

      return charts;
    } catch (error) {
      logToFile('❌ Error generating all charts', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = ChartService;
