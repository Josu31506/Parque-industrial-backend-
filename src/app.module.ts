import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { ClaimsModule } from './claims/claims.module';
import { CommissionModule } from './commission/commission.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProducersModule } from './producers/producers.module';
import { ProductsModule } from './products/products.module';
import { PurchaseRequestsModule } from './purchase-requests/purchase-requests.module';
import { QuotesModule } from './quotes/quotes.module';
import { RolesModule } from './roles/roles.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ProducersModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    PurchaseRequestsModule,
    OrdersModule,
    SalesModule,
    ClaimsModule,
    NotificationsModule,
    QuotesModule,
    PaymentsModule,
    CommissionModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
