import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import { generateUploadUrl, generateAccessUrl, validateFileUpload } from "~/services/FileUpload.server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Cloudflare R2 configuration
const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://your-account-id.r2.cloudflarestorage.com";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "your-bucket-name";
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

/**
 * GET endpoint to generate presigned upload URL
 * This allows external forms to get a secure URL for uploading files
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const fileName = url.searchParams.get("fileName");
    const contentType = url.searchParams.get("contentType");

    if (!shop || !fileName || !contentType) {
      return json(
        { error: "Missing required parameters: shop, fileName, contentType" },
        { status: 400, headers: corsResponse }
      );
    }

    // Validate file type and size
    const mockFile = new File([], fileName, { type: contentType });
    const validation = validateFileUpload(mockFile);
    
    if (!validation.valid) {
      return json(
        { error: validation.error },
        { status: 400, headers: corsResponse }
      );
    }

    // Generate presigned upload URL
    const { uploadUrl, fileName: uniqueFileName } = await generateUploadUrl(
      fileName,
      contentType,
      shop
    );

    return json({
      success: true,
      uploadUrl,
      fileName: uniqueFileName,
      expiresIn: 3600, // 1 hour
    }, { headers: corsResponse });

  } catch (error) {
    console.error('Error generating upload URL:', error);
    return json(
      { error: "Failed to generate upload URL" },
      { status: 500, headers: corsResponse }
    );
  }
};

/**
 * POST endpoint to handle direct file uploads to R2
 * Returns file URL and metadata for use in wholesale forms
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const shop = formData.get("shop") as string;

    if (!file || !shop) {
      return json(
        { error: "Missing file or shop parameter" },
        { status: 400, headers: corsResponse }
      );
    }

    // Validate file
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      return json(
        { error: validation.error },
        { status: 400, headers: corsResponse }
      );
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop();
    const uniqueFileName = `${shop}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;

    // Upload file to R2
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: uniqueFileName,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        shop: shop,
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    await s3Client.send(uploadCommand);

    // Generate access URL for the uploaded file
    const accessUrl = generateAccessUrl(uniqueFileName);

    // Return file information for use in wholesale form
    return json({
      success: true,
      fileName: uniqueFileName,
      originalName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      accessUrl: accessUrl,
      fileUrl: uniqueFileName, // R2 key for reference
      message: "File uploaded successfully to R2",
    }, { headers: corsResponse });

  } catch (error) {
    console.error('Error in direct file upload:', error);
    return json(
      { error: "Failed to upload file to R2" },
      { status: 500, headers: corsResponse }
    );
  }
}; 