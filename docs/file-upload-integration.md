# File Upload Integration Guide

This document explains how to integrate with the file upload endpoint for external HTML forms.

## Overview

The file upload system uses a two-step process:
1. **Get Upload URL**: Request a presigned URL for uploading
2. **Save Metadata**: After successful upload, save file metadata to database

## Endpoints

### 1. Generate Upload URL
**GET** `/api/upload`

**Query Parameters:**
- `shop` (required): The Shopify shop domain
- `fileName` (required): Original filename
- `contentType` (required): MIME type of the file

**Response:**
```json
{
  "success": true,
  "uploadUrl": "https://...presigned-url...",
  "fileName": "shop/unique-filename.ext",
  "expiresIn": 3600
}
```

### 2. Save File Metadata
**POST** `/api/upload`

**Request Body:**
```json
{
  "shop": "your-shop.myshopify.com",
  "fileName": "shop/unique-filename.ext",
  "originalName": "document.pdf",
  "fileSize": 1024000,
  "mimeType": "application/pdf",
  "metadata": {
    "formType": "wholesale",
    "customerEmail": "customer@example.com"
  }
}
```

## HTML Form Integration Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>File Upload Form</title>
</head>
<body>
    <form id="uploadForm">
        <input type="file" id="fileInput" required>
        <button type="submit">Upload File</button>
    </form>

    <script>
        const SHOP = 'your-shop.myshopify.com';
        const API_BASE = 'https://your-app-domain.com';

        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById('fileInput');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a file');
                return;
            }

            try {
                // Step 1: Get presigned upload URL
                const uploadUrlResponse = await fetch(
                    `${API_BASE}/api/upload?shop=${SHOP}&fileName=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`
                );
                
                const uploadData = await uploadUrlResponse.json();
                
                if (!uploadData.success) {
                    throw new Error(uploadData.error);
                }

                // Step 2: Upload file to R2 using presigned URL
                const uploadResponse = await fetch(uploadData.uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: {
                        'Content-Type': file.type,
                    },
                });

                if (!uploadResponse.ok) {
                    throw new Error('Failed to upload file');
                }

                // Step 3: Save file metadata
                const metadataResponse = await fetch(`${API_BASE}/api/upload`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        shop: SHOP,
                        fileName: uploadData.fileName,
                        originalName: file.name,
                        fileSize: file.size,
                        mimeType: file.type,
                        metadata: {
                            uploadedVia: 'external-form',
                            timestamp: new Date().toISOString()
                        }
                    }),
                });

                const metadataResult = await metadataResponse.json();
                
                if (metadataResult.success) {
                    alert('File uploaded successfully!');
                    console.log('File access URL:', metadataResult.accessUrl);
                    
                    // You can now send this URL to your wholesale form endpoint
                    // along with other form data
                } else {
                    throw new Error(metadataResult.error);
                }

            } catch (error) {
                console.error('Upload failed:', error);
                alert('Upload failed: ' + error.message);
            }
        });
    </script>
</body>
</html>
```

## Integration with Wholesale Form

After successful file upload, you can include the file URL in your wholesale form submission:

```javascript
// Example: Include file URL in wholesale form
const wholesaleFormData = {
    shop: SHOP,
    api_key: 'your-api-key',
    timestamp: Math.floor(Date.now() / 1000),
    hmac: 'calculated-hmac',
    companyName: 'Company Name',
    // ... other form fields ...
    fileUrl: metadataResult.accessUrl, // Include the file access URL
    fileName: uploadData.fileName
};

// Submit to wholesale form endpoint
const wholesaleResponse = await fetch(`${API_BASE}/api/wholesalepricingform`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(wholesaleFormData),
});
```

## Environment Variables

Set these environment variables in your app:

```bash
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_REGION=auto
```

## File Validation

The system validates:
- **File size**: Maximum 10MB (configurable)
- **File types**: Images, PDFs, Word documents (configurable)
- **Shop ownership**: Files are organized by shop

## Security Features

- **Presigned URLs**: Temporary, secure upload URLs
- **Shop isolation**: Each shop can only access their own files
- **CORS enabled**: Cross-origin requests supported
- **File type validation**: Prevents malicious file uploads

## Error Handling

Common error responses:
- `400`: Missing required parameters
- `400`: Invalid file type or size
- `500`: Server error during upload or metadata saving

## File Management

Uploaded files can be managed through the protected `/app/files` route within your Shopify app, where store owners can:
- View all uploaded files
- Download/view files
- Delete files
- See file metadata 