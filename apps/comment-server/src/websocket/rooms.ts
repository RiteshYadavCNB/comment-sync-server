import { invalidRoom, missingComponentId } from '../utils/errors.js';

export const getCommentRoomId = (projectId: string, componentId: string): string => {
  if (!projectId || projectId.trim() === '') {
    throw invalidRoom('Missing projectId');
  }

  if (!componentId || componentId.trim() === '') {
    throw missingComponentId();
  }

  return `${projectId}:component:${componentId}`;
};

