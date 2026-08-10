// client/src/hooks/useSocket.ts

import { useEffect, useRef, useCallback } from 'react';
import { socket, initSocket } from '../socket/socket';
import type { Socket } from 'socket.io-client';

export function useSocket(): Socket {
  const socketRef = useRef<Socket>(initSocket());
  return socketRef.current;
}

export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
  const socket = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const cb = (data: T) => handlerRef.current(data);
    socket.on(event, cb);
    return () => { socket.off(event, cb); };
  }, [socket, event]);
}

export function useSocketEmit() {
  const socket = useSocket();
  return useCallback(
    (event: string, data?: unknown, ack?: (res: unknown) => void) => {
      if (ack) {
        socket.emit(event, data, ack);
      } else {
        socket.emit(event, data);
      }
    },
    [socket]
  );
}
