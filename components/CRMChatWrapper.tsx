'use client';
import SaguaroChatWidget from './SaguaroChatWidget';

interface CRMChatWrapperProps {
  userId: string | null;
  projectList: Array<{ id: string; name: string }>;
}

export default function CRMChatWrapper({ userId, projectList }: CRMChatWrapperProps) {
  return <SaguaroChatWidget variant="crm" userId={userId} projectList={projectList} />;
}
