process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/dairy_test';
process.env.JWT_SECRET = 'test-secret';
process.env.SETUP_CODE = 'test-setup';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = require('path').join(require('os').tmpdir(), 'dairy-test-storage');
