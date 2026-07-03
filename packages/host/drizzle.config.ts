import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/persistence/sqlite/schema.ts',
    out: './src/persistence/sqlite/migrations',
    dialect: 'sqlite',
});
