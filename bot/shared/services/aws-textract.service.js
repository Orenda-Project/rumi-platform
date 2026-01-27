const { TextractClient, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const { logToFile } = require('../utils/logger');

const textractRegion = process.env.AWS_REGION_TEXTRACT
  || process.env.AWS_REGION
  || 'us-east-1';

const textractCredentials = {
  accessKeyId: process.env.AWS_TEXTRACT_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_TEXTRACT_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
};

const textractClient = new TextractClient({
  region: textractRegion,
  credentials: textractCredentials,
});

class AWSTextractService {
  static async extractText(buffer) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const command = new AnalyzeDocumentCommand({
          Document: { Bytes: buffer },
          FeatureTypes: ['TABLES', 'FORMS'],
        });

        const response = await textractClient.send(command);

        let extractedText = '';
        let totalConfidence = 0;
        let blockCount = 0;

        for (const block of response.Blocks || []) {
          if (block.BlockType === 'LINE' && block.Text) {
            extractedText += `${block.Text} `;
          }
          if (block.Confidence) {
            totalConfidence += block.Confidence;
            blockCount++;
          }
        }

        const avgConfidence = blockCount > 0 ? totalConfidence / blockCount : 0;
        if (avgConfidence && avgConfidence < 70) {
          logToFile('AWS Textract low confidence', {
            confidence: avgConfidence,
            textLength: extractedText.length,
          });
        }

        return extractedText.trim();
      } catch (error) {
        attempt++;

        if (error.name === 'ThrottlingException' && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logToFile('AWS Textract throttled, retrying', { attempt, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        logToFile('AWS Textract extraction failed', { error: error.message });
        throw error;
      }
    }

    throw new Error('Textract failed after retries');
  }
}

module.exports = { AWSTextractService };

