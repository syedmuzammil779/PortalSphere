import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { Card, Page, Layout, Button, DataTable, Badge, Modal, Text, BlockStack, InlineStack, Thumbnail } from "@shopify/polaris";
import { useState, useCallback } from "react";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  try {
    // Get all files for this shop
    const files = await prisma.shopFiles.findMany({
      where: { shop },
      orderBy: { uploadedAt: 'desc' },
    });

    return json({ files, shop });
  } catch (error) {
    console.error('Error fetching files:', error);
    return json({ files: [], shop, error: "Failed to fetch files" });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const action = formData.get('action');

  try {
    if (action === 'delete') {
      const fileId = formData.get('fileId') as string;
      
      // Delete file from database
      await prisma.shopFiles.delete({
        where: { id: fileId, shop },
      });

      return json({ success: true, message: "File deleted successfully" });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error('Error in file action:', error);
    return json({ error: "Failed to perform action" }, { status: 500 });
  }
};

export default function FilesPage() {
  const { files, shop, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<any>(null);

  const handleDeleteClick = useCallback((file: any) => {
    setFileToDelete(file);
    setDeleteModalOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    setDeleteModalOpen(false);
    setFileToDelete(null);
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const rows = files.map((file) => [
    <Thumbnail
      source={file.mimeType.startsWith('image/') ? file.accessUrl : 'https://cdn.shopify.com/s/files/1/0757/9955/files/file-icon.png'}
      alt={file.originalName}
      size="small"
    />,
    file.originalName,
    formatFileSize(file.fileSize),
    file.mimeType,
    formatDate(file.uploadedAt),
    <InlineStack align="center" gap="200">
      <Button
        size="slim"
        onClick={() => window.open(file.accessUrl, '_blank')}
      >
        View
      </Button>
      <Button
        size="slim"
        tone="critical"
        onClick={() => handleDeleteClick(file)}
      >
        Delete
      </Button>
    </InlineStack>
  ]);

  return (
    <Page
      title="Shop Files"
      subtitle={`Manage files for ${shop}`}
      backAction={{ content: 'Back', url: '/app' }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            {error && (
              <div style={{ padding: '16px', color: 'red' }}>
                {error}
              </div>
            )}
            
            {actionData?.success && (
              <div style={{ padding: '16px', color: 'green' }}>
                {actionData.message}
              </div>
            )}

            {files.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <Text variant="bodyMd" as="p">
                  No files uploaded yet. Files uploaded through external forms will appear here.
                </Text>
              </div>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Preview', 'File Name', 'Size', 'Type', 'Uploaded', 'Actions']}
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={handleDeleteConfirm}
        title="Delete File"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: () => {
            if (fileToDelete) {
              const form = document.createElement('form');
              form.method = 'post';
              form.innerHTML = `
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="fileId" value="${fileToDelete.id}" />
              `;
              document.body.appendChild(form);
              form.submit();
              document.body.removeChild(form);
            }
            handleDeleteConfirm();
          },
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleDeleteConfirm,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text variant="bodyMd" as="p">
              Are you sure you want to delete "{fileToDelete?.originalName}"?
            </Text>
            <Text variant="bodyMd" as="p">
              This action cannot be undone.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
} 