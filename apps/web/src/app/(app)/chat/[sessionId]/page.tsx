import Chat from '@/components/chat/Chat';
import { checkChatSessionAccess } from '@/actions/chat/session.action';
import NotFound from 'next/dist/client/components/builtin/not-found';
import { StickyComposer } from '@/components/chat/StickyComposer';

export default async function ChatPageWithSessionId(props: { params: Promise<{ sessionId: string }> }) {
  const  params  = await props.params;
  const sessionId = params.sessionId;

  const isYours = await checkChatSessionAccess(sessionId);
  if (!isYours) return <NotFound />;
  return (
    <>
      <div className="overscroll-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-auto">
        <Chat sessionId={sessionId} />
      </div>
      <StickyComposer />
    </>
  );
}
