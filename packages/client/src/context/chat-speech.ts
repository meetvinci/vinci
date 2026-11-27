import { createContext } from 'react';
import type { SpeechChat } from '../types/speech.types';

export const chatSpeechContext = createContext<SpeechChat | null>(null);
