import {
    Page, Layout, BlockStack, Card, Text,
    TextField, Tag,
    Button, Spinner,
    Toast,
    Frame
} from "@shopify/polaris";
import React, { useEffect, useState } from 'react';
import { json, LoaderFunction, ActionFunction, redirect } from '@remix-run/node';
import { useLoaderData, useSubmit } from '@remix-run/react';
import { getSettings, updateSettings } from '~/services/Settings.server';
import { authenticate } from '~/shopify.server';
import PageHeader from '~/components/PageHeader';

export const loader: LoaderFunction = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const savedNotificationEmails = (await getSettings(admin, "notificationEmails")) || "";

    return { savedNotificationEmails };
};

// Action function to handle email submission
export const action: ActionFunction = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const notificationEmails = formData.get("notificationEmails");

    await updateSettings(admin, "notificationEmails", notificationEmails as string);
    return redirect("/app/storeconfigs");

};

// Email validation function
const validateEmail = (email: string) => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Simple email regex
    return emailPattern.test(email);
};

const EmailsForNotifications: React.FC = () => {
    const { savedNotificationEmails } = useLoaderData<{ savedNotificationEmails: string }>();
    const [notificationEmail, setNotificationEmail] = useState('');
    const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const submit = useSubmit();

    useEffect(() => {
        if (savedNotificationEmails) {
            const emailArray = savedNotificationEmails.split(',').filter(tag => tag.trim());
            setNotificationEmails(emailArray); // Convert array to single string
        }
    }, [savedNotificationEmails]);

    const handleNotificationEmailInput = (value: string) => {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; 
    
        if (value.endsWith(',')) {
            const newEmail = value.replace(/,/, '').trim();
    
            // Validate the email format
            if (!emailPattern.test(newEmail)) {
                console.error('Invalid email format:', newEmail);
                setToastMessage('Invalid email format. Please enter a valid email address.');
                setShowToast(true);
                return; 
            }
            
            setToastMessage('');
            // Check if the email is not already in the list
            if (newEmail && !notificationEmails.includes(newEmail)) {
                setNotificationEmails([...notificationEmails, newEmail]);
                setToastMessage('Email address added successfully!');
                setShowToast(true);            
            } else {
                setToastMessage('This email address is already in the list.');
                setShowToast(true);
            }
            setNotificationEmail(''); 
        } else {
            setNotificationEmail(value);
        }
    };

    const handleNotificationEmailBlur = () => {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Simple email regex

        const trimmedEmail = notificationEmail.trim();
    
        // Validate the email format
        if (trimmedEmail && !emailPattern.test(trimmedEmail)) {
            setToastMessage('Invalid email format. Please enter a valid email address.');
            setShowToast(true);
            setNotificationEmail(''); // Clear the input field
            return; // Exit the function if the email is invalid
        }

        if (trimmedEmail && !notificationEmails.includes(notificationEmail.trim())) {
            setNotificationEmails([...notificationEmails, notificationEmail.trim()]);
        }
        setNotificationEmail('');
    };

    const removeNotificationEmail = (emailToRemove: string) => {
        setNotificationEmails(notificationEmails.filter(email => email !== emailToRemove));
    };

    const handleSave = () => {
        setIsLoading(true);
        const formData = new FormData();
        formData.append("notificationEmails", notificationEmails.join(','));
        submit(formData, { method: "post" });
    };

    return (
        <Frame>
            <Page>
                <Layout>
                    <Layout.Section>
                        <PageHeader 
                            title="Notification Emails" 
                            subtitle="Wholesale Registration Requests"
                        />
                    </Layout.Section>
                    <Layout.Section>
                        <div style={{display: "flex", justifyContent: "flex-end", alignContent: "flex-end"}}>
                        <Button 
                            variant="primary" 
                            onClick={handleSave}
                            disabled={isLoading}
                        >
                        {isLoading ? ( <Spinner size="small" /> ) : ( 'Save Configurations' )}
                        </Button>
                        </div>
                    </Layout.Section>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="500">
                                <BlockStack gap="100">
                                    <Text as="h3" variant="headingMd">Notification Emails</Text>
                                    <Text as="p" variant="bodyMd">
                                        Manage which emails are notified when a new wholesale registration request is made.
                                    </Text>
                                </BlockStack>
                                <BlockStack gap="200">
                                    <TextField
                                        label=""
                                        type="text"
                                        value={notificationEmail}
                                        onChange={handleNotificationEmailInput}
                                        onBlur={handleNotificationEmailBlur}
                                        placeholder="Enter email address"
                                        helpText="Note: Use comma or leave the textbox to add new email address"
                                        autoComplete="off"
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                        {notificationEmails.map((email) => (
                                            <Tag key={email} onRemove={() => removeNotificationEmail(email)}>{email}</Tag>
                                        ))}
                                    </div>
                                    {showToast && (
                                        <Toast
                                            content={toastMessage}
                                            onDismiss={() => setShowToast(false)}
                                        />
                                    )}
                                </BlockStack>
                            </BlockStack>                            
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page> 
        </Frame> 
    );
};

export default EmailsForNotifications;