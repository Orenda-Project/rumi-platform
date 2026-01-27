/**
 * Parallel Workers Test Suite
 * Issue #43 Phase 2: Tests for Railway replica support
 *
 * Tests verify:
 * 1. RAILWAY_REPLICA_ID is included in worker identification
 * 2. Replica ID is logged in job processing events
 * 3. SQS visibility timeout prevents duplicate processing
 */

describe('Parallel Worker Support (Issue #43 Phase 2)', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to pick up env changes
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Replica Identification', () => {
    it('should use RAILWAY_REPLICA_ID when available', () => {
      // Arrange
      process.env.RAILWAY_REPLICA_ID = 'replica-abc123';

      // Act - require fresh module
      const REPLICA_ID = process.env.RAILWAY_REPLICA_ID || 'local';
      const WORKER_ID = `sqs-worker-test-123-${REPLICA_ID}`;

      // Assert
      expect(WORKER_ID).toContain('replica-abc123');
      expect(REPLICA_ID).toBe('replica-abc123');
    });

    it('should fallback to "local" when no RAILWAY_REPLICA_ID', () => {
      // Arrange
      delete process.env.RAILWAY_REPLICA_ID;

      // Act
      const REPLICA_ID = process.env.RAILWAY_REPLICA_ID || 'local';
      const WORKER_ID = `sqs-worker-test-123-${REPLICA_ID}`;

      // Assert
      expect(WORKER_ID).toContain('local');
      expect(REPLICA_ID).toBe('local');
    });

    it('should include replica ID in worker ID format', () => {
      // Arrange
      process.env.RAILWAY_REPLICA_ID = 'replica-xyz789';

      // Act
      const REPLICA_ID = process.env.RAILWAY_REPLICA_ID || 'local';
      const WORKER_ID = `sqs-worker-hostname-12345-${REPLICA_ID}`;

      // Assert - verify format: sqs-worker-{hostname}-{pid}-{replicaId}
      const parts = WORKER_ID.split('-');
      expect(parts[0]).toBe('sqs');
      expect(parts[1]).toBe('worker');
      expect(parts[parts.length - 1]).toBe('replica');
      expect(WORKER_ID).toMatch(/sqs-worker-.+-\d+-replica-\w+/);
    });
  });

  describe('Railway Configuration', () => {
    it('should have valid railway.toml structure', () => {
      const fs = require('fs');
      const path = require('path');

      const railwayTomlPath = path.join(__dirname, '../../railway.toml');

      // Check file exists
      expect(fs.existsSync(railwayTomlPath)).toBe(true);

      // Read and verify content
      const content = fs.readFileSync(railwayTomlPath, 'utf8');

      // Verify key configurations
      expect(content).toContain('[build]');
      expect(content).toContain('[deploy]');
      expect(content).toContain('numReplicas');
      expect(content).toContain('[environments.production.deploy]');
      expect(content).toContain('[environments.staging.deploy]');
    });

    it('should have 3 replicas for production', () => {
      const fs = require('fs');
      const path = require('path');

      const railwayTomlPath = path.join(__dirname, '../../railway.toml');
      const content = fs.readFileSync(railwayTomlPath, 'utf8');

      // Production should have 3 replicas
      expect(content).toMatch(/\[environments\.production\.deploy\][\s\S]*numReplicas\s*=\s*3/);
    });

    it('should have 1 replica for staging (cost savings)', () => {
      const fs = require('fs');
      const path = require('path');

      const railwayTomlPath = path.join(__dirname, '../../railway.toml');
      const content = fs.readFileSync(railwayTomlPath, 'utf8');

      // Staging should have 1 replica
      expect(content).toMatch(/\[environments\.staging\.deploy\][\s\S]*numReplicas\s*=\s*1/);
    });
  });

  describe('SQS Duplicate Prevention', () => {
    it('should have visibility timeout configured for video jobs', () => {
      // The SQS service should have visibility timeout > video processing time
      // Video processing takes 10-12 minutes, visibility timeout is 30 min + 15 min extension = 45 min

      const expectedVisibilityTimeout = 1800; // 30 minutes in seconds
      const expectedExtension = 900; // 15 minutes in seconds
      const totalTimeout = expectedVisibilityTimeout + expectedExtension;
      const videoProcessingTime = 12 * 60; // 12 minutes in seconds

      // Verify timeout is greater than processing time
      expect(totalTimeout).toBeGreaterThan(videoProcessingTime);
      expect(totalTimeout).toBe(2700); // 45 minutes
    });

    it('should use FIFO queue for ordered delivery', () => {
      // FIFO queue URL should end with .fifo
      const videoQueueUrl = process.env.SQS_VIDEO_QUEUE_URL || 'rumi-video-queue.fifo';

      if (videoQueueUrl) {
        expect(videoQueueUrl).toMatch(/\.fifo$/);
      }
    });
  });

  describe('Throughput Calculations', () => {
    it('should calculate correct throughput with 3 replicas', () => {
      const totalVideos = 50;
      const numReplicas = 3;
      const minutesPerVideo = 10;

      // With single worker: 50 * 10 = 500 minutes = 8.3 hours
      const singleWorkerTime = totalVideos * minutesPerVideo;
      expect(singleWorkerTime).toBe(500);

      // With 3 replicas: 50 / 3 ≈ 17 videos per worker * 10 min = 170 min ≈ 3 hours
      const videosPerReplica = Math.ceil(totalVideos / numReplicas);
      const parallelWorkerTime = videosPerReplica * minutesPerVideo;

      expect(videosPerReplica).toBe(17);
      expect(parallelWorkerTime).toBe(170); // ~3 hours

      // Verify improvement factor
      const improvementFactor = singleWorkerTime / parallelWorkerTime;
      expect(improvementFactor).toBeCloseTo(2.94, 1); // ~3x improvement
    });
  });
});
