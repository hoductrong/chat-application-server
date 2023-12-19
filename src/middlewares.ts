import { ExtendedError } from './error';
import { sessionStore } from './sessionStore';
import { Socket } from './types';

export function authMiddleware(socket: Socket, next: (err?: ExtendedError) => void) {
  const sessionId = socket.handshake.auth.sessionId ?? socket.handshake.headers['x-session-id'];

  if (sessionId) {
    const session = sessionStore.findSession(sessionId);

    if (session) {
      socket.data.sessionId = sessionId;
      socket.data.userId = session.userId;
      socket.data.username = session.username;
      socket.data.clientId = socket.id;
      return next();
    }
  }

  const { userId, username, clientId } = getAuthInfo(socket);

  if (!userId || !username) {
    return next(
      new ExtendedError('invalid username or userId', {
        success: false,
        status: 401,
        message: 'invalid username or userId',
      })
    );
  }

  // using Date.now() as sessionId just for simplicity, this id could be duplicated if 2 sockets connect at the same time
  const newSessionId = Date.now().toString();
  socket.data.userId = userId;
  socket.data.username = username;
  socket.data.sessionId = newSessionId;
  socket.data.clientId = clientId;
  sessionStore.saveSession(newSessionId, { userId, username });
  next();
}

export function getAuthInfo(socket: Socket) {
  if (socket.handshake.headers['x-user-id'] || socket.handshake.headers['x-username']) {
    return {
      userId: socket.handshake.headers['x-user-id'],
      username: socket.handshake.headers['x-username'],
      clientId: socket.handshake.headers['x-client-id'],
    };
  }

  const { userId, username, clientId } = socket.handshake.auth;
  return { userId, username, clientId };
}
