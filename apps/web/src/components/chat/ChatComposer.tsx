'use client';
import React, { useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { clsx } from 'clsx';
import ChatModeToggle from '@/components/chat/ChatModeToggle';
import { useChatUI } from '@/providers/ChatProvider';
import { useSessionsState } from '@/features/chat/chat.sessions.store';
import { useChatSessionStream } from '@/features/chat/useChatSessionStream';
import { useChatState } from '@/features/chat/chat.store';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Button } from '../ui/button';
import { Loader2, SendIcon } from 'lucide-react';

export default function ChatComposer() {
  const { selectedSessionId } = useSessionsState();
  const { submitAction, loading } = useChatSessionStream(selectedSessionId);
  const [userInput, setUserInput] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);
  const { setAwaitingFirstToken } = useChatUI();
  const { busy } = useChatState();

  const isComposing = useRef(false);

  const buttonDisabled = () => !userInput || busy || loading;

  return (
    <form
      className={clsx('w-full gap-6 overflow-hidden')}
      ref={formRef}
      action={submitAction}
      onSubmit={() => {
        setAwaitingFirstToken(true);
        setTimeout(() => setUserInput(''), 0);
      }}
    >
      <InputGroup className={'rounded-2xl'}>
        <InputGroupTextarea
          id="chat-input"
          name="text"
          value={userInput}
          className="grid w-full resize-none min-h-8 max-h-36"
          onChange={e => setUserInput(e.target.value)}
          placeholder="Ask me anything!"
          onCompositionStart={() => {
            isComposing.current = true;
          }}
          onCompositionEnd={e => {
            isComposing.current = false;
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              if (isComposing.current) {
                return;
              }
              e.preventDefault();
              if (!buttonDisabled()) {
                formRef.current?.requestSubmit();
              }
            }
          }}
        />
        <InputGroupAddon align="block-end" className="cursor-auto">
          <InputGroupButton asChild>
            <ChatModeToggle sessionId={selectedSessionId} />
          </InputGroupButton>
          <InputGroupButton
            variant={'default'}
            size={'icon-sm'}
            className="ml-auto rounded-full"
            type="submit"
            disabled={buttonDisabled()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <SendIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {/*<div className={clsx('flex w-full gap-2.5')}>*/}
      {/*<TextareaAutosize*/}
      {/*  id="chat-input"*/}
      {/*  name="text"*/}
      {/*  value={userInput}*/}
      {/*  rows={1}*/}
      {/*  onChange={e => setUserInput(e.target.value)}*/}
      {/*  placeholder="Ask me anything!"*/}
      {/*  className={*/}
      {/*    'min-h-[1.7rem] w-full flex-1 resize-none rounded-3xl border-0 bg-border px-6 py-3 text-[1.15rem] leading-7 text-foreground placeholder:text-muted-foreground focus:outline-none'*/}
      {/*  }*/}
      {/*  onCompositionStart={() => {*/}
      {/*    isComposing.current = true;*/}
      {/*  }}*/}
      {/*  onCompositionEnd={e => {*/}
      {/*    isComposing.current = false;*/}
      {/*  }}*/}
      {/*  onKeyDown={e => {*/}
      {/*    if (e.key === 'Enter' && !e.shiftKey) {*/}
      {/*      if (isComposing.current) {*/}
      {/*        return;*/}
      {/*      }*/}
      {/*      e.preventDefault();*/}
      {/*      if (!buttonDisabled()) {*/}
      {/*        formRef.current?.requestSubmit();*/}
      {/*      }*/}
      {/*    }*/}
      {/*  }}*/}
      {/*/>*/}
      {/*<button*/}
      {/*  type="submit"*/}
      {/*  disabled={buttonDisabled()}*/}
      {/*  className={*/}
      {/*    'rounded-3xl bg-border px-6 py-3 text-[1.15rem] leading-7 text-foreground disabled:text-muted'*/}
      {/*  }*/}
      {/*>*/}
      {/*  {busy ? 'Loading...' : 'SUBMIT'}*/}
      {/*</button>*/}
      {/*</div>*/}
    </form>
  );
}
