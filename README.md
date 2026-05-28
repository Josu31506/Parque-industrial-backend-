# Parque Industrial Conecta Backend

Backend profesional para marketplace de muebles locales con NestJS, PostgreSQL, Prisma, JWT, roles, solicitudes de compra, ventas de productores, pagos retenidos, reclamos, notificaciones y cotizaciones.

## Stack

- NestJS + TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication
- REST API
- class-validator / class-transformer
- Helmet, CORS, rate limiting
- bcrypt
- Swagger/OpenAPI

## Instalacion

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run seed
npm run start:dev
```

Swagger queda disponible en:

```txt
http://localhost:3000/api/docs
```

## Variables de entorno

```txt
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=1d
PORT=3000
FRONTEND_URL=http://localhost:5173
BCRYPT_SALT_ROUNDS=10
```

## Arquitectura

La aplicacion esta separada por modulos de dominio:

- `auth`: registro, login, JWT, usuario autenticado.
- `users`: gestion de usuarios y desactivacion.
- `producers`: productoras/vendedores.
- `categories`: categorias del catalogo.
- `products`: catalogo, filtros, disponibilidad.
- `cart`: carrito de cliente.
- `purchase-requests`: solicitudes bajo pedido, confirmacion por productor y pago.
- `orders`: pedidos y tracking por productor.
- `sales`: ventas visibles para productores.
- `claims`: reclamos y retencion de fondos.
- `notifications`: notificaciones persistidas.
- `quotes`: base para cotizaciones.
- `payments`: pagos simulados y fondos retenidos.
- `commission`: comision de plataforma.

## Roles

- `CLIENT`: compra, carrito, solicitudes, pedidos, reclamos, notificaciones y cotizaciones.
- `SELLER`: gestiona productos, solicitudes de venta y ventas.
- `ADVISOR`: atiende reclamos/cotizaciones y operacion.
- `ADMIN`: administra usuarios, categorias, productores, comisiones y auditoria.

## Flujos

Compra directa: producto `IN_STOCK` -> carrito -> pago simulado -> pedido -> venta por productor -> fondos retenidos.

Compra bajo pedido: carrito -> solicitud de compra -> productor confirma/rechaza -> fecha estimada -> pago 100% o 50% -> pedido -> ventas.

Reclamos: cliente crea reclamo -> fondos de pedido/ventas pasan a `HELD_BY_CLAIM` -> admin/asesor resuelve.

Cotizaciones: cliente crea solicitud -> asesor coordina -> resolucion -> futuro flujo de pago/pedido.

## Seguridad

- Passwords hasheadas con bcrypt.
- JWT para autenticacion.
- Guards de JWT y roles.
- ValidationPipe global con whitelist y transform.
- Helmet, CORS restringido por `FRONTEND_URL` y rate limiting.

## Comandos

```bash
npm run start:dev
npm run build
npm run test
npm run seed
npm run prisma:migrate
```
