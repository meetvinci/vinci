import { ORPCError } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { match } from 'ts-pattern';
import { chatAnswerProblem } from '../services/chat/chat.utils';
import { roomsQuestionHint, roomsQuestionText } from '../services/rooms/rooms.utils';
import { useRpc } from './use-rpc';
import type { ConversationQuestion, QuestionAnswerInput } from '@repo/contracts/universal';

export function useChatQuestion(question: ConversationQuestion) {
  const { rpc } = useRpc();
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const answer = useMutation(rpc.conversation.answerQuestion.mutationOptions({ meta: { invalidates: [rpc.conversation.questions.key()] } }));
  const isGone = (answer.error instanceof ORPCError && answer.error.code === 'NOT_FOUND') || answer.data?.isAccepted === false;
  const own = typed.trim();
  const isSecret = question.secret !== null;

  const reply = (value: QuestionAnswerInput) => answer.mutate({
    botId: question.botId,
    conversationId: question.conversationId,
    id: question.id,
    answer: value,
  });

  return {
    ...roomsQuestionText({ question: question.text }),
    hint: roomsQuestionHint({ question }),
    picked,
    typed,
    setTyped,
    isAnswered: answer.isPending || answer.data?.isAccepted === true,
    canSend: question.isMultiSelect ? picked.length > 0 || own !== '' : own !== '',
    problem: chatAnswerProblem({ isGone, isError: answer.isError }),
    skip: () => reply({ kind: 'skip' }),
    choose: (choice: string) => match(question.isMultiSelect)
      .with(true, () => setPicked(picked.includes(choice) ? picked.filter((item) => item !== choice) : [...picked, choice]))
      .with(false, () => reply({ kind: 'choices', choices: [choice] }))
      .exhaustive(),
    isSecret,
    send: () => match({
      hasPicked: question.isMultiSelect && picked.length > 0,
      own,
      isSecret,
    })
      .with({ hasPicked: true, own: '' }, () => reply({ kind: 'choices', choices: picked }))
      .with({ own: '' }, () => undefined)
      .with({ isSecret: true }, () => {
        setTyped('');
        reply({ kind: 'secret', value: own });
      })
      .otherwise(({ hasPicked }) => reply({ kind: 'text', text: hasPicked ? [...picked, own].join(', ') : own })),
  };
}
