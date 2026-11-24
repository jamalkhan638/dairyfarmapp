import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import * as path from 'path';
import { config } from '../config';

/** Photos and receipts. "local" writes to disk (development); "s3" uses MinIO or any S3-compatible store. */
@Injectable()
export class StorageService {
  private s3?: S3Client;

  private client() {
    if (!this.s3) {
      const c = config.s3;
      this.s3 = new S3Client({
        endpoint: c.endpoint,
        region: c.region,
        forcePathStyle: true, // required by MinIO
        credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
      });
    }
    return this.s3;
  }

  private localPath(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9/_-]/g, '');
    return path.resolve(config.localStorageDir, safe);
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (config.storageDriver === 's3') {
      await this.client().send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: body, ContentType: contentType }));
      return;
    }
    const p = this.localPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }

  async get(key: string): Promise<Buffer> {
    if (config.storageDriver === 's3') {
      const r = await this.client().send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return fs.readFile(this.localPath(key));
  }
}
