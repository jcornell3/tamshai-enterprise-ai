/**
 * Typed mock factory for BullMQ
 *
 * Provides type-safe mocks for Queue and Job.
 */

/**
 * Mock job data for identity cleanup
 */
export interface MockDeleteUserJobData {
  keycloakUserId: string;
  employeeId: string;
}

/**
 * Mock job representation
 */
export interface MockJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  timestamp: number;
  delay?: number;
  attemptsMade: number;
  opts: {
    delay?: number;
    attempts?: number;
  };
}

/**
 * Mock job options
 */
export interface MockJobOptions {
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
}

/**
 * Typed mock for BullMQ Queue
 */
export interface MockQueue<T = unknown> {
  add: jest.Mock<Promise<MockJob<T>>, [string, T, MockJobOptions?]>;
  close: jest.Mock<Promise<void>, []>;
  getJob: jest.Mock<Promise<MockJob<T> | null>, [string]>;
  getJobs: jest.Mock<Promise<MockJob<T>[]>, [string[]?, number?, number?]>;
  obliterate: jest.Mock<Promise<void>, [{ force?: boolean }?]>;
}

/**
 * Typed mock for BullMQ Worker processor function
 */
export type MockWorkerProcessor<T = unknown> = (job: MockJob<T>) => Promise<unknown>;

/**
 * Typed mock for BullMQ Worker
 */
export interface MockWorker<T = unknown> {
  on: jest.Mock<void, [string, (...args: unknown[]) => void]>;
  close: jest.Mock<Promise<void>, []>;
  run: jest.Mock<Promise<void>, []>;
  pause: jest.Mock<Promise<void>, []>;
  resume: jest.Mock<Promise<void>, []>;
  // Store the processor for testing
  _processor?: MockWorkerProcessor<T>;
}

/**
 * Factory function to create a typed Queue mock
 *
 * @returns Fresh mock Queue instance
 */
export function createMockQueue<T = unknown>(): MockQueue<T> {
  let jobIdCounter = 0;

  return {
    add: jest.fn().mockImplementation((name: string, data: T, opts?: MockJobOptions) => {
      jobIdCounter++;
      return Promise.resolve({
        id: `job-${jobIdCounter}`,
        name,
        data,
        timestamp: Date.now(),
        delay: opts?.delay,
        attemptsMade: 0,
        opts: opts || {},
      } as MockJob<T>);
    }),
    close: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
    getJobs: jest.fn().mockResolvedValue([]),
    obliterate: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Factory function to create a typed Worker mock
 *
 * @param processor - Optional processor function to store
 * @returns Fresh mock Worker instance
 */
export function createMockWorker<T = unknown>(
  processor?: MockWorkerProcessor<T>
): MockWorker<T> {
  const worker: MockWorker<T> = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
  };

  if (processor) {
    worker._processor = processor;
  }

  return worker;
}

/**
 * Create a mock job for testing
 *
 * @param name - Job name
 * @param data - Job data
 * @param overrides - Properties to override defaults
 * @returns Mock job
 */
export function createMockJob<T>(
  name: string,
  data: T,
  overrides: Partial<MockJob<T>> = {}
): MockJob<T> {
  return {
    id: `job-${Date.now()}`,
    name,
    data,
    timestamp: Date.now(),
    attemptsMade: 0,
    opts: {},
    ...overrides,
  };
}

/**
 * Reset all mocks in a MockQueue instance
 *
 * @param queue - The mock queue to reset
 */
export function resetMockQueue<T>(queue: MockQueue<T>): void {
  queue.add.mockReset();
  queue.close.mockReset();
  queue.getJob.mockReset();
  queue.getJobs.mockReset();
  queue.obliterate.mockReset();
}
