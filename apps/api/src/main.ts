import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(config.port, '0.0.0.0');
  console.log(`Dairy API listening on port ${config.port}`);
}
bootstrap();
