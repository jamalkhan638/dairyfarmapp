import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Not needed for 'prisma generate'; migrate commands fail with a clear message if missing.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
