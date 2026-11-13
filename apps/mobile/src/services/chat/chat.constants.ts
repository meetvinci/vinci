import { AlarmClock, Bot, Cpu, FileText, KeyRound, LayoutDashboard, ListTodo, MessageCircleQuestion, Plug, Search, SquarePen, Terminal, Wrench } from 'lucide-react-native';
import type { ToolIconKind } from '@repo/client/client';
import type { LucideIcon } from 'lucide-react-native';

export const CHAT_TYPING = {
  dot: {
    animationName: {
      '0%': { opacity: 0.35 },
      '40%': { opacity: 1 },
      '80%': { opacity: 0.35 },
      '100%': { opacity: 0.35 },
    },
    animationDuration: '1.4s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  label: {
    animationName: {
      '0%': { opacity: 0.5 },
      '50%': { opacity: 1 },
      '100%': { opacity: 0.5 },
    },
    animationDuration: '1.8s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  dotDelayMs: 160,
} as const;

export const CHAT_PANE = { barHeight: 56 } as const;

export const CHAT_MEDIA = { seekStepSeconds: 5, closeDragPx: 120, maxZoom: 4, playbackEvent: 'chat.playback' } as const;

export const CHAT_TOOL_ICONS = {
  terminal: Terminal,
  file: FileText,
  edit: SquarePen,
  search: Search,
  bot: Bot,
  model: Cpu,
  question: MessageCircleQuestion,
  secret: KeyRound,
  routine: AlarmClock,
  todo: ListTodo,
  artifact: LayoutDashboard,
  mcp: Plug,
  tool: Wrench,
} satisfies Record<ToolIconKind, LucideIcon>;
