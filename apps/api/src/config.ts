import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  get databaseUrl() { return required('DATABASE_URL'); },
  get port() { return Number(process.env.PORT ?? 3000); },
  get jwtSecret() { return required('JWT_SECRET'); },
  get setupCode() { return process.env.SETUP_CODE ?? ''; },
  accessTokenTtlSeconds: 60 * 60, // 1 hour
  refreshTokenTtlDays: 120, // phones may stay offline for a long time
  get storageDriver() { return (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3'; },
  get localStorageDir() { return process.env.LOCAL_STORAGE_DIR ?? 'storage'; },
  get s3() {
    return {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? 'dairy',
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    };
  },
};
