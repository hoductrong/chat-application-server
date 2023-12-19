import { Socket as SocketIO } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

export type Session = {
  userId: string;
  username: string;
};

export type Message = {
  id: number;
  message: string;
  conversationId: string;
  createdAt: number;
  senderId: string;
  senderName: string;
};

export type Conversation = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  members: string[];
};

export type ConversationAction = {
  action: 'join' | 'leave';
  conversation: string;
  userId: string;
};

export type SuccessResponse<T> = {
  success: boolean;
  data: T;
};

export type ErrorResponse = {
  success: boolean;
  status: number;
  message: string;
};

export type Response<T> = SuccessResponse<T> | ErrorResponse;

export type ServerToClientEvents = {
  message: (data: SuccessResponse<Message>, cb: (res: { success: boolean }) => void) => void;
  session: (data: SuccessResponse<Session>, cb: (res: { success: boolean }) => void) => void;
};

export type ClientToServerEvents = {
  message: (data: Message, cb: (message: Response<object>) => void) => void;
  conversation: (data: ConversationAction, cb: (message: Response<object>) => void) => void;
};

export type SocketData = {
  sessionId: string;
  userId: string;
  username: string;
  clientId: string;
};

export type Socket = SocketIO<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
