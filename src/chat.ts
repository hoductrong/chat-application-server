import { Server } from 'http';
import * as SocketIO from 'socket.io';
import * as events from 'events';
import * as url from 'url';
import {
  ClientToServerEvents,
  ConversationAction,
  Message,
  ServerToClientEvents,
  Socket,
  SocketData,
} from './types';
import { authMiddleware } from './middlewares';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

const FIVE_MILLISECONDS = 5_000;

type UserId = string;
type ConversationId = string;
type ClientId = string;
type MessageStore = Map<UserId, Map<ConversationId, Message[]>>;
export class Chat {
  private io: SocketIO.Server<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    SocketData
  >;
  private ev: events;
  private clients: Map<UserId, Map<ClientId, Socket>> = new Map();
  conversations = new Map<ConversationId, UserId[]>();
  messages: MessageStore = new Map();
  mIds: Map<ConversationId, number> = new Map();

  public constructor(server: Server) {
    this.io = new SocketIO.Server(server);
    this.listen();
    this.ev = new events.EventEmitter();

    this.applyMiddlewares();
  }

  private listen(): void {
    this.io.on('connection', (socket) => {
      const { onMessage, joinConversation, leaveConversation, onDisconnect } = makeSocketHandlers(
        socket,
        this.clients,
        this.conversations,
        this.messages,
        this.mIds
      );

      // each  socket has a default room with its own client id
      socket.join(socket.data.clientId);
      if (this.clients.has(socket.data.userId)) {
        this.clients.get(socket.data.userId).set(socket.data.clientId, socket);
        console.log('A new client has connected: ', socket.data.clientId);
      } else {
        const temp = new Map();
        temp.set(socket.data.clientId, socket);
        this.clients.set(socket.data.userId, temp);
        console.log('A new user has connected: ', socket.data.userId);
      }
      console.log('Total clients: ', this.clients.size);

      socket.emit(
        'session',
        formatSuccessResponse({
          userId: socket.data.userId,
          username: socket.data.username,
          sessionId: socket.data.sessionId,
        }),
        (res) => {
          if (res.success) {
          }
        }
      );

      socket.on('conversation', async (data, cb) => {
        if (data.action === 'join') {
          try {
            await joinConversation(data);
            cb(formatSuccessResponse({}));
          } catch (error) {
            cb(formatErrorResponse({ status: 500, message: error?.message }));
          }
        }
        if (data.action === 'leave') {
          try {
            await leaveConversation(data);
            cb(formatSuccessResponse({}));
          } catch (error) {
            cb(formatErrorResponse({ status: 500, message: error?.message }));
          }
        }
      });

      socket.on('message', async (data, ack) => {
        const ch = data.conversationId;

        const messageWithId = await onMessage(ch, data);
        ack(formatSuccessResponse(messageWithId));
      });

      socket.on('disconnect', (e) => {
        console.log('Socket disconnected: ', socket.data.clientId);
        this.clients.delete(socket.data.userId);
        onDisconnect(e);
      });
    });
  }

  applyMiddlewares() {
    this.io.use(authMiddleware);
  }
}

function formatErrorResponse({ message, status }: { status: number; message: string }) {
  return {
    success: false,
    status,
    message,
  };
}

function formatSuccessResponse<T>(data: T) {
  return {
    success: true,
    data,
  };
}

const makeSocketHandlers = (
  socket: Socket,
  clients: Map<UserId, Map<ClientId, Socket>>,
  conversations: Map<ConversationId, UserId[]>,
  messages: MessageStore,
  mIds: Map<ConversationId, number>
) => {
  async function onMessage(ch: string, data: Omit<Message, 'id'>): Promise<Message> {
    if (!isSocketInRoom(ch)) {
      console.log('Joining conversation: ', ch);
      await joinConversation({
        action: 'join',
        conversation: ch,
        userId: data.senderId,
      });
    }

    const enrichedMessage = enrichMessage(data);

    await broadcast(ch, enrichedMessage);

    return enrichedMessage;
  }

  function enrichMessage(message: Omit<Message, 'id'>) {
    const id = mIds.get(message.conversationId) ?? 0;
    const newId = id + 1;
    mIds.set(message.conversationId, newId);
    return {
      ...message,
      id: newId,
    };
  }

  async function broadcast(conversationId: string, data: Message) {
    const members = conversations.get(conversationId);
    const membersWithoutSender = members.filter((m) => m !== data.senderId);
    if (!membersWithoutSender.length) {
      return;
    }

    const listUserClient = clients.get(data.senderId);

    if (!listUserClient) {
      return;
    }

    const clientsOfUser = getClientOfUser(membersWithoutSender);
    const clientsWithoutSender = [...listUserClient.keys()].filter(
      (c) => c !== socket.data.clientId
    );
    const receivers = clientsOfUser.concat(clientsWithoutSender);

    const client = listUserClient.get(socket.data.clientId);

    if (client && client.connected) {
      console.log('Broadcasting message: ', conversationId, data);
      // await preserveMessagesForOfflineClients(membersWithoutSender, data);
      // for (let index = 0; index < 100; index++) {
      //   client
      //     .timeout(FIVE_MILLISECONDS)
      //     .in(membersWithoutSender)
      //     .emit(
      //       'message',
      //       formatSuccessResponse({
      //         ...data,
      //         id: index % 10,
      //       }),
      //       (err, res) => {
      //         if (err) {
      //           console.log('Error: ', err);
      //         }
      //         console.log('Response: ', res);
      //       }
      //     );
      // }
      client
        .timeout(FIVE_MILLISECONDS)
        .in(receivers)
        .emit('message', formatSuccessResponse(data), (err, res) => {
          if (err) {
            console.log('Error: ', err);
          }
          console.log('Response: ', res);
        });
    } else {
      console.log('Sender not connected: ', client?.id);
    }
  }

  function getClientOfUser(userIds: string[]) {
    let clientsOfUser: string[] = [];
    for (const userId of userIds) {
      const clientsOfUserMap = clients.get(userId);
      if (clientsOfUserMap) {
        clientsOfUser = [...clientsOfUser, ...clientsOfUserMap.keys()];
      }
    }

    return clientsOfUser;
  }

  // async function preserveMessagesForOfflineClients(receivers: string[], message: Message) {
  //   for (const receiver of receivers) {
  //     const client = clients.get(receiver);
  //     if (!client || !client.connected) {
  //       const key = `${message.conversationId}_${receiver}` as `${string}_${string}`;

  //       messages.set(key, [...(messages.get(key) ?? []), message]);
  //     }
  //   }
  // }

  function isSocketInRoom(room: string) {
    return socket.rooms.has(room);
  }

  async function joinConversation(joinConversationData: ConversationAction) {
    if (!conversations.has(joinConversationData.conversation)) {
      console.log('Creating conversation: ', conversations, joinConversationData.conversation);
      conversations.set(joinConversationData.conversation, [joinConversationData.userId]);
    } else {
      const members = conversations.get(joinConversationData.conversation);
      console.log('Joining conversation: ', joinConversationData.conversation);
      if (!members.includes(joinConversationData.userId)) {
        members.push(joinConversationData.userId);
      }
    }

    await socket.join(joinConversationData.conversation);
  }

  async function leaveConversation(leaveConversationData: ConversationAction) {
    await socket.leave(leaveConversationData.conversation);
    if (conversations.has(leaveConversationData.conversation)) {
      const members = conversations.get(leaveConversationData.conversation);
      if (members.includes(leaveConversationData.userId)) {
        members.splice(members.indexOf(leaveConversationData.userId), 1);
      }
    }
  }

  function onDisconnect(m: SocketIO.DisconnectReason) {
    console.log('Socket leave connection: ', m);
  }

  return {
    onMessage,
    isSocketInRoom,
    joinConversation,
    leaveConversation,
    onDisconnect,
  };
};