import { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import { connectionManager } from './ConnectionManager.js';
import { roomManager } from '../game/RoomManager.js';
import { ClientMessage, type ClientMessageType, type ErrorResponse } from '../types/index.js';

export function handleMessage(ws: WebSocket, data: string): void {
  const playerId = connectionManager.getPlayerId(ws);
  if (!playerId) {
    sendError(ws, 'NOT_CONNECTED', 'Connection not registered');
    return;
  }

  let message: ClientMessageType;
  try {
    const parsed = JSON.parse(data);
    message = ClientMessage.parse(parsed);
  } catch (error) {
    logger.warn('Invalid message format', { playerId, error: String(error) });
    sendError(ws, 'INVALID_MESSAGE', 'Invalid message format');
    return;
  }

  logger.debug('Received message', { playerId, type: message.type });

  try {
    switch (message.type) {
      case 'join_room':
        handleJoinRoom(playerId, message);
        break;
      case 'leave_room':
        handleLeaveRoom(playerId);
        break;
      case 'ready':
        handleReady(playerId, message.isReady);
        break;
      case 'submit_action':
        handleSubmitAction(playerId, message);
        break;
      case 'submit_shuffle':
        handleSubmitShuffle(playerId, message);
        break;
      case 'submit_unmask':
        handleSubmitUnmask(playerId, message);
        break;
      case 'submit_hand_reveal':
        handleSubmitHandReveal(playerId, message);
        break;
    }
  } catch (error) {
    logger.error('Error handling message', { playerId, type: message.type, error: String(error) });
    sendError(ws, 'INTERNAL_ERROR', 'An error occurred processing your request');
  }
}

function handleJoinRoom(
  playerId: string,
  message: { roomId?: string; playerName: string; publicKeyX: string; publicKeyY: string }
): void {
  const publicKey = {
    x: BigInt(message.publicKeyX),
    y: BigInt(message.publicKeyY),
    isInfinity: false,
  };

  if (message.roomId) {
    roomManager.joinRoom(message.roomId, playerId, message.playerName, publicKey);
  } else {
    roomManager.createRoom(playerId, message.playerName, publicKey);
  }
}

function handleLeaveRoom(playerId: string): void {
  const playerData = connectionManager.getPlayerData(playerId);
  if (playerData?.roomId) {
    roomManager.leaveRoom(playerData.roomId, playerId);
  }
}

function handleReady(playerId: string, isReady: boolean): void {
  const playerData = connectionManager.getPlayerData(playerId);
  if (playerData?.roomId) {
    roomManager.setPlayerReady(playerData.roomId, playerId, isReady);
  }
}

function handleSubmitAction(
  playerId: string,
  message: { actionType: number; amount: number; proof?: string; publicWitness?: string; stateCommitment?: string }
): void {
  const playerData = connectionManager.getPlayerData(playerId);
  if (!playerData?.roomId) {
    connectionManager.send(playerId, {
      type: 'error',
      code: 'NOT_IN_ROOM',
      message: 'You are not in a room',
    });
    return;
  }

  roomManager.submitAction(
    playerData.roomId,
    playerId,
    {
      playerId,
      type: message.actionType,
      amount: message.amount,
    },
    message.proof,
    message.publicWitness
  );
}

function handleSubmitShuffle(
  playerId: string,
  message: { shuffledDeck: any[]; deckCommitment: string; proof?: string; publicWitness?: string }
): void {
  const playerData = connectionManager.getPlayerData(playerId);
  if (!playerData?.roomId) {
    connectionManager.send(playerId, {
      type: 'error',
      code: 'NOT_IN_ROOM',
      message: 'You are not in a room',
    });
    return;
  }

  roomManager.submitShuffle(
    playerData.roomId,
    playerId,
    message.shuffledDeck,
    message.deckCommitment,
    message.proof,
    message.publicWitness
  );
}

function handleSubmitUnmask(
  playerId: string,
  message: { cardIndex: number; unmaskedCard: any; proof?: string; publicWitness?: string }
): void {
  const playerData = connectionManager.getPlayerData(playerId);
  if (!playerData?.roomId) {
    connectionManager.send(playerId, {
      type: 'error',
      code: 'NOT_IN_ROOM',
      message: 'You are not in a room',
    });
    return;
  }

  roomManager.submitUnmask(
    playerData.roomId,
    playerId,
    message.cardIndex,
    message.unmaskedCard,
    message.proof,
    message.publicWitness
  );
}

function handleSubmitHandReveal(
  playerId: string,
  message: { handRank: number; handDescription: string; cardIndices: number[]; proof?: string; publicWitness?: string }
): void {
  const playerData = connectionManager.getPlayerData(playerId);
  if (!playerData?.roomId) {
    connectionManager.send(playerId, {
      type: 'error',
      code: 'NOT_IN_ROOM',
      message: 'You are not in a room',
    });
    return;
  }

  roomManager.submitHandReveal(
    playerData.roomId,
    playerId,
    message.handRank,
    message.handDescription,
    message.cardIndices,
    message.proof,
    message.publicWitness
  );
}

function sendError(ws: WebSocket, code: string, message: string): void {
  const error: ErrorResponse = { type: 'error', code, message };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(error));
  }
}

export function handleDisconnect(ws: WebSocket): void {
  const playerId = connectionManager.removeConnection(ws);
  if (playerId) {
    const playerData = connectionManager.getPlayerData(playerId);
    if (playerData?.roomId) {
      roomManager.handleDisconnect(playerData.roomId, playerId);
    }
  }
}
