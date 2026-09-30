import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Product images live in S3-compatible object storage — SeaweedFS locally
 * (see infra/docker-compose.yml), AWS S3 / R2 / etc. in production. Only
 * configuration changes between them. The database stores object keys; the
 * public URL is built from S3_PUBLIC_URL so a CDN can sit in front later.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = requireEnv('S3_BUCKET');
  private readonly publicBaseUrl = requireEnv('S3_PUBLIC_URL').replace(/\/+$/, '');
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
        : undefined, // fall back to the default AWS credential chain (IAM role, etc.)
  });

  async onModuleInit() {
    // Local dev convenience only. In production the bucket (and its public-read
    // policy / CDN) is provisioned outside the app.
    if (process.env.S3_AUTO_CREATE_BUCKET !== 'true') return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket ${this.bucket}`);
      } catch (error) {
        this.logger.warn(`Could not create bucket ${this.bucket}: ${(error as Error).message}`);
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are unique per upload, so the object never changes — cache hard.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  /** Best-effort cleanup — used to undo uploads when the database write fails. */
  async deleteMany(keys: string[]) {
    if (keys.length === 0) return;
    try {
      await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
      );
    } catch (error) {
      this.logger.error(`Failed to delete ${keys.length} orphaned object(s): ${(error as Error).message}`);
    }
  }

  publicUrl(key: string) {
    return `${this.publicBaseUrl}/${key}`;
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. See .env.example.`);
  return value;
}
