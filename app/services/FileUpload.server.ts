import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

// Cloudflare R2 configuration
const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://12580c27c4a11883dfac1736a718b67e.r2.cloudflarestorage.com";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "8cdf7365c2f5ba308eea55549eab4c8b";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "54c6cf382a1b44d58c7a50e9fcbecaae7d47885820bd040a464a2ba7bf762337";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "portalsphere";
const R2_REGION = process.env.R2_REGION || "auto";

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: R2_REGION,
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for Cloudflare R2
});

export interface FileUploadResult {
  success: boolean;
  fileUrl?: string;
  accessUrl?: string;
  fileName?: string;
  error?: string;
}

export interface FileMetadata {
  shop: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  metadata?: Record<string, any>;
}

/**
 * Generate a presigned URL for file upload
 */
export async function generateUploadUrl(
  fileName: string,
  contentType: string,
  shop: string
): Promise<{ uploadUrl: string; fileName: string }> {
  const fileExtension = fileName.split('.').pop();
  const uniqueFileName = `${shop}/${uuidv4()}.${fileExtension}`;
  
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: uniqueFileName,
    ContentType: contentType,
    Metadata: {
      shop: shop,
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiry
  
  return {
    uploadUrl,
    fileName: uniqueFileName,
  };
}

/**
 * Generate a public URL for file access/download (for public buckets)
 */
export function generateAccessUrl(fileName: string): string {
  // For public buckets, return the direct public URL
  return `https://pub-0196d8edc1254fb89c98704b353e80f4.r2.dev/${fileName}`;
}

/**
 * Delete a file from R2
 */
export async function deleteFile(fileName: string): Promise<boolean> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

/**
 * Get the public URL for a file (if bucket is public)
 */
export function getPublicUrl(fileName: string): string {
  return `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${fileName}`;
}

/**
 * Validate file upload
 */
export function validateFileUpload(
  file: File,
  maxSize: number = 10 * 1024 * 1024, // 10MB default
  allowedTypes: string[] = ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
    };
  }

  // Check file type
  const isValidType = allowedTypes.some(type => {
    if (type.endsWith('/*')) {
      return file.type.startsWith(type.slice(0, -1));
    }
    return file.type === type;
  });

  if (!isValidType) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  return { valid: true };
} 