import React from 'react';
import { Button, ButtonGroup, Text, BlockStack } from '@shopify/polaris';
import { Link, useLocation } from '@remix-run/react';
import {TitleBar} from '@shopify/app-bridge-react';

interface JourneyHeaderProps {
  groupId: string | null;
  groupName: string | null;
  groupTag: string | null;
}

const JourneyHeader: React.FC<JourneyHeaderProps> = ({ groupId = null, groupName = null, groupTag = null }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const isUpdateGroup = currentPath === '/app/updategroup';
  const isAddMembers = currentPath === '/app/addmembers';
  const isGroupVolumePrice = currentPath === '/app/groupvolumepriceconfig';

  return (
    <BlockStack gap="400" inlineAlign="center">
    <ButtonGroup >

        <Button 
            url={`/app/updategroup?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}`}
            variant={isUpdateGroup ? 'primary' : 'secondary'}
            disabled={isUpdateGroup}
            >
            Update Group Settings
        </Button>

        <Button
            url={`/app/addmembers?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}`}
            variant={isAddMembers ? 'primary' : 'secondary'}
            disabled={isAddMembers || !groupId}
        >
            Add Members
        </Button>
        <Button
            url={`/app/groupvolumepriceconfig?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}`}
            variant={isGroupVolumePrice ? 'primary' : 'secondary'}
            disabled={isGroupVolumePrice || !groupId}
        >
            Configure Volume and Pricing
        </Button>
        </ButtonGroup>
    </BlockStack>
  );
};

export default JourneyHeader;