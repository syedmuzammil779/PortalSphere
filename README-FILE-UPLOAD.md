# File Upload System Setup

This document explains how to set up and use the file upload system for your B2B Plus app.

## Overview

The file upload system allows external HTML forms to upload files to your app using Cloudflare R2 storage with presigned URLs. Files are organized by shop and can be managed through the protected admin interface.

## Features

- ✅ **Presigned URL Uploads**: Secure, temporary upload URLs
- ✅ **Cloudflare R2 Integration**: Scalable object storage
- ✅ **CORS Enabled**: Cross-origin requests supported
- ✅ **Shop Isolation**: Each shop manages their own files
- ✅ **File Validation**: Type and size restrictions
- ✅ **Metadata Storage**: Rich file information in database
- ✅ **Admin Interface**: Protected file management within app

## Prerequisites

1. **Cloudflare R2 Account** with API credentials
2. **Database Migration** to add the `ShopFiles` table
3. **Environment Variables** configured
4. **Prisma Client** generated

## Setup Steps

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Cloudflare R2 Configuration
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_REGION=auto
```

### 2. Database Migration

Run the Prisma migration to create the `ShopFiles` table:

```bash
npm run prisma:migrate
```

### 3. Generate Prisma Client

After migration, generate the Prisma client:

```bash
npm run prisma:generate
```

## API Endpoints

### GET /api/upload
Generates a presigned URL for file upload.

**Query Parameters:**
- `shop`: Shopify shop domain
- `fileName`: Original filename
- `contentType`: MIME type

**Response:**
```json
{
  "success": true,
  "uploadUrl": "https://...presigned-url...",
  "fileName": "shop/unique-filename.ext",
  "expiresIn": 3600
}
```

### POST /api/upload
Saves file metadata after successful upload.

**Request Body:**
```json
{
  "shop": "shop.myshopify.com",
  "fileName": "shop/unique-filename.ext",
  "originalName": "document.pdf",
  "fileSize": 1024000,
  "mimeType": "application/pdf",
  "metadata": {}
}
```

## Usage Flow

### 1. External Form Integration

```javascript
// Step 1: Get upload URL
const uploadUrlResponse = await fetch(
  `/api/upload?shop=${shop}&fileName=${fileName}&contentType=${contentType}`
);
const { uploadUrl, fileName: uniqueFileName } = await uploadUrlResponse.json();

// Step 2: Upload to R2
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type }
});

// Step 3: Save metadata
await fetch('/api/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    shop, fileName: uniqueFileName, originalName: file.name,
    fileSize: file.size, mimeType: file.type
  })
});
```

### 2. Include in Wholesale Form

After file upload, include the file URL in your wholesale form:

```javascript
const wholesaleData = {
  shop: 'shop.myshopify.com',
  api_key: 'your-api-key',
  timestamp: Math.floor(Date.now() / 1000),
  hmac: 'calculated-hmac',
  companyName: 'Company Name',
  // ... other fields ...
  fileUrl: metadataResult.accessUrl, // Include file URL
  fileName: uploadData.fileName
};

await fetch('/api/wholesalepricingform', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(wholesaleData)
});
```

## File Management

### Admin Interface
Access files through `/app/files` route within your Shopify app:
- View all uploaded files
- Download/view files
- Delete files
- See file metadata

### Database Schema
```sql
model ShopFiles {
  id          String   @id @default(cuid())
  shop        String
  fileName    String
  originalName String
  fileSize    Int
  mimeType    String
  fileUrl     String
  accessUrl   String
  uploadedAt  DateTime @default(now())
  metadata    Json?
  
  @@index([shop])
  @@index([uploadedAt])
}
```

## Security Features

- **Presigned URLs**: Temporary, secure upload URLs (1 hour expiry)
- **Access URLs**: Temporary download URLs (7 days expiry)
- **Shop Isolation**: Files are organized by shop domain
- **File Validation**: Type and size restrictions
- **CORS Protection**: Controlled cross-origin access

## File Validation

**Supported Types:**
- Images: `image/*`
- Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Size Limits:**
- Maximum: 10MB (configurable in `FileUpload.server.ts`)

## Testing

### 1. Test Upload Endpoint
Use the example form at `/upload-example.html` to test file uploads.

### 2. Test Integration
1. Upload a file using the example form
2. Verify file appears in `/app/files`
3. Test file download/view functionality

## Troubleshooting

### Common Issues

1. **Prisma Client Error**
   ```
   Property 'shopFiles' does not exist on type 'PrismaClient'
   ```
   **Solution**: Run `npm run prisma:generate` after migration

2. **R2 Connection Error**
   ```
   Failed to connect to R2
   ```
   **Solution**: Verify environment variables and R2 credentials

3. **CORS Error**
   ```
   CORS policy blocked request
   ```
   **Solution**: Check CORS configuration in `cors.server.ts`

### Debug Steps

1. Check environment variables are set correctly
2. Verify R2 bucket exists and is accessible
3. Check database connection and migration status
4. Review server logs for detailed error messages

## Customization

### File Types
Modify `allowedTypes` array in `FileUpload.server.ts`:

```typescript
const allowedTypes = [
  'image/*',
  'application/pdf',
  'application/msword',
  'text/plain',
  'application/json'
];
```

### File Size Limits
Modify `maxSize` parameter in `validateFileUpload`:

```typescript
const maxSize = 50 * 1024 * 1024; // 50MB
```

### URL Expiry Times
Modify expiry times in `FileUpload.server.ts`:

```typescript
// Upload URL expiry (1 hour)
expiresIn: 3600

// Access URL expiry (7 days)
expiresIn: 604800
```

## Integration Examples

### React Component
```jsx
const FileUpload = ({ shop }) => {
  const [file, setFile] = useState(null);
  
  const handleUpload = async () => {
    // Implementation using the API endpoints
  };
  
  return (
    <input type="file" onChange={(e) => setFile(e.target.files[0])} />
  );
};
```

### Node.js Server
```javascript
const uploadFile = async (shop, file) => {
  // Get upload URL
  const uploadUrl = await getUploadUrl(shop, file.name, file.type);
  
  // Upload to R2
  await uploadToR2(uploadUrl, file);
  
  // Save metadata
  await saveMetadata(shop, file, uploadUrl.fileName);
};
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for error details
3. Verify all setup steps are completed
4. Test with the example form first

## Future Enhancements

- [ ] File compression and optimization
- [ ] Image thumbnail generation
- [ ] Batch file operations
- [ ] File sharing and permissions
- [ ] Advanced search and filtering
- [ ] File versioning support 