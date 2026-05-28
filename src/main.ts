import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const frontendUrl = config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Parque Industrial Conecta API')
    .setDescription('API REST para marketplace de muebles, productores, ventas y pagos retenidos.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap();
