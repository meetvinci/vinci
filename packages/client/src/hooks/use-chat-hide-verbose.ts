import { use } from 'react';
import { chatStepsContext } from '../context/chat-steps';
import { useChatDefaults } from './use-chat-defaults';

export function useChatHideVerbose() {
  const defaults = useChatDefaults();
  const canSeeSteps = use(chatStepsContext);

  return {
    canSeeSteps,
    hideVerbose: !canSeeSteps || (defaults.settings?.hideVerbose ?? true),
    isPending: defaults.isPending,
    setHideVerbose: (hideVerbose: boolean) => defaults.configure({ hideVerbose }),
  };
}
