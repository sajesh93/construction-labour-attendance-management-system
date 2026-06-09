import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Background worker process (separate from the API). Hosts BullMQ consumers for
 * report generation (XLSX/PDF rendering) and the scheduled audit-partition job.
 * Runs the same DI container as the API without listening on HTTP.
 *
 * Deploy: `node dist/worker.js`.
 */
async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  logger.log('CLAMS worker started — awaiting jobs');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down worker`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap();
